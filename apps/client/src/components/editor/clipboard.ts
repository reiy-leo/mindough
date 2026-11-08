/**
 * 编辑器的剪贴板（任务和日记共用一个编辑器，行为一样）。
 *
 * 复制、剪切（Rei 2026-11-05「任务编辑器中的复制，不要带样式或者markdown标记」，同日改定「应用内复制粘贴也只要纯文本」）：
 * - 剪贴板只写 text/plain，不写 text/html，也不写自定义类型；在念头团的编辑器之间复制粘贴也是纯文字，不带格式。
 * - 纯文字就是看到的字：没有 # 、**、_、~~、`、> 、列表符、有序编号、勾选框、[文字](链接)、<u>、<details> / <summary>。
 *   段落、标题、列表项、折叠块的标题和正文之间各换一行；空段落留一个空行；段落里的 Shift+回车 换行照留。
 *   链接只留文字（文字和网址一样就是网址）；网络图片留它显示的那行字，本机图片留说明文字（没有就不留）；
 *   代码、公式留原文；表格一行一行，格子之间用制表符；分隔线不留；脚注写成「[1]」。
 * - 粘贴：剪贴板里的字正好是念头团刚复制出去的，就照字面一行一段放进来，不当 markdown 读
 *   （否则单换行会读成段内换行、正文里的 * _ 会变成格式）；别处来的纯文字照旧当 markdown 读。
 * - 拖动：拖出编辑器也只带纯文字（拖起来时去掉 ProseMirror 写的 text/html）；在同一个编辑器里拖着挪位置，
 *   ProseMirror 用的是内存里的原内容，格式不变（这是挪动，不是复制粘贴）；拖到另一个编辑器里是纯文字。
 * - 选区起点 / 终点在折叠块里（Rei 2026-11-05 折叠块复制）：unwrapOpenDetails 拆掉外面那层 details，
 *   在同一个编辑器里拖着挪时不会多套一层折叠块。纯文字里折叠块本来就只剩标题和正文。
 */
import { DOMParser as PMDOMParser, DOMSerializer, Fragment, Slice, type Node as PMNode, type Schema } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { isRemoteImage, remoteImageText } from '../../lib/remote-image';
import type { MarkdownIO } from './markdown';


// ───────── 纯文字 ─────────

/** 段落里的 HTML 片段只留字：<br> 换行，别的标签和注释去掉。 */
const htmlText = (value: string) =>
  value
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/** 一个行内节点看到的字。 */
function inlineText(n: PMNode): string {
  if (n.isText) return n.text ?? '';
  switch (n.type.name) {
    case 'hardBreak':
      return '\n';
    case 'image': {
      const src = String(n.attrs.src ?? '');
      const alt = String(n.attrs.alt ?? '');
      return isRemoteImage(src) ? remoteImageText(src, alt) : alt.trim();
    }
    case 'html':
      return htmlText(String(n.attrs.value ?? ''));
    case 'footnote_reference':
      return `[${String(n.attrs.label ?? '')}]`;
    default:
      if (n.isLeaf) return n.type.spec.leafText ? n.type.spec.leafText(n) : '';
      return textOfInline(n.content);
  }
}

const textOfInline = (f: Fragment) => {
  let s = '';
  f.forEach((c) => void (s += inlineText(c)));
  return s;
};

/** 一块内容拆成几行。 */
function blockLines(n: PMNode): string[] {
  if (n.isTextblock) return [textOfInline(n.content)];
  if (n.isInline) return [inlineText(n)];
  switch (n.type.name) {
    case 'horizontalRule':
      return [];
    case 'table': {
      const rows: string[] = [];
      n.forEach((row) => {
        const cells: string[] = [];
        row.forEach((cell) => void cells.push(linesOf(cell.content).join(' ').trim()));
        rows.push(cells.join('\t'));
      });
      return rows;
    }
    case 'footnote_definition': {
      const lines = linesOf(n.content);
      const label = `[${String(n.attrs.label ?? '')}]`;
      return lines.length ? [`${label} ${lines[0]}`, ...lines.slice(1)] : [label];
    }
    default:
      if (n.isLeaf) return n.type.spec.leafText ? [n.type.spec.leafText(n)] : [];
      return linesOf(n.content);
  }
}

function linesOf(f: Fragment): string[] {
  const out: string[] = [];
  f.forEach((c) => {
    if (c.isInline) {
      // 切片最外层直接是行内内容（很少见）：接在上一行后面
      const t = inlineText(c);
      if (out.length) out[out.length - 1] += t;
      else out.push(t);
    } else out.push(...blockLines(c));
  });
  return out;
}

/** 复制出去的纯文字（见文件开头的规则）。 */
export const plainTextOf = (slice: Slice | Fragment): string => linesOf(slice instanceof Slice ? slice.content : slice).join('\n');

// ───────── 刚复制出去的字 ─────────

let lastCopied: string | null = null;
const norm = (s: string) => s.replace(/\r\n?/g, '\n');

/** 记下念头团刚放进剪贴板的纯文字（复制、剪切、拖动）。 */
export const rememberCopied = (text: string) => {
  lastCopied = norm(text);
};
/** 这段字是不是念头团刚复制出去的（粘回来照字面放，不当 markdown 读）。 */
export const isOwnCopy = (text: string) => lastCopied != null && text !== '' && norm(text) === lastCopied;
/** 测试用。 */
export const forgetCopied = () => {
  lastCopied = null;
};

/** 纯文字照字面变成段落：一行一段。 */
export function literalParagraphs(schema: Schema, text: string): PMNode[] {
  const para = schema.nodes.paragraph!;
  return norm(text)
    .split('\n')
    .map((line) => para.create(null, line ? schema.text(line) : null));
}

// ───────── 插件 ─────────

/** 写进剪贴板：只有 text/plain。 */
function writePlain(view: EditorView, event: ClipboardEvent): boolean {
  const sel = view.state.selection;
  const data = event.clipboardData;
  if (sel.empty || !data) return false;
  const text = plainTextOf(sel.content());
  event.preventDefault();
  data.clearData();
  data.setData('text/plain', text);
  rememberCopied(text);
  if (event.type === 'cut' && view.editable) view.dispatch(view.state.tr.deleteSelection().scrollIntoView().setMeta('uiEvent', 'cut'));
  return true;
}

/**
 * 剪贴板插件：复制 / 剪切只写纯文字；粘贴纯文字时当 markdown 读（念头团自己刚复制的照字面）；
 * VS Code 复制来的代码变代码块；拖出去只带纯文字。网络图片不加载（在不挂页面的文档里转换）。
 */
export function clipboardPlugin(io: () => MarkdownIO) {
  return new Plugin({
    view(view) {
      // ProseMirror 自己的 dragstart 先跑（它的监听先装），这里再把它写的 text/html 去掉
      const onDragStart = (e: DragEvent) => {
        const dt = e.dataTransfer;
        if (!dt || !view.dragging) return;
        try {
          dt.clearData('text/html');
        } catch {
          /* 有的浏览器不让清：那也只是多一份 html */
        }
        const text = dt.getData('text/plain');
        if (text) rememberCopied(text);
      };
      view.dom.addEventListener('dragstart', onDragStart);
      return { destroy: () => view.dom.removeEventListener('dragstart', onDragStart) };
    },
    props: {
      handleDOMEvents: {
        copy: (view, event) => writePlain(view, event),
        cut: (view, event) => writePlain(view, event),
      },
      // 拖动时 ProseMirror 用它写 text/plain
      clipboardTextSerializer: (slice) => plainTextOf(slice),
      // 拖动时内存里的那份内容：拆掉开着的外层折叠块
      transformCopied(slice) {
        try {
          return unwrapOpenDetails(slice);
        } catch {
          return slice;
        }
      },
      handlePaste(view, event) {
        const data = event.clipboardData;
        if (!data || !view.editable) return false;
        if (view.state.selection.$from.parent.type.spec.code) return false;
        const text = data.getData('text/plain');
        const vscode = data.getData('vscode-editor-data');
        if (vscode && text) {
          let lang = '';
          try {
            lang = String((JSON.parse(vscode) as { mode?: string }).mode ?? '');
          } catch {
            /* 不是 JSON：当普通文字 */
          }
          const code = view.state.schema.nodes.codeBlock;
          if (lang && code) {
            view.dispatch(view.state.tr.replaceSelectionWith(code.create({ language: lang }, view.state.schema.text(text))).scrollIntoView());
            return true;
          }
        }
        if (data.getData('text/html') || !text) return false;
        const schema = view.state.schema;
        if (isOwnCopy(text)) {
          const nodes = literalParagraphs(schema, text);
          const slice = new Slice(Fragment.fromArray(nodes), 1, 1);
          view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView().setMeta('uiEvent', 'paste'));
          return true;
        }
        let doc: PMNode;
        try {
          doc = io().parse(text);
        } catch {
          return false;
        }
        const detached = document.implementation.createHTMLDocument('');
        const wrap = detached.createElement('div');
        wrap.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(doc.content, { document: detached }));
        const slice = PMDOMParser.fromSchema(schema).parseSlice(wrap, { preserveWhitespace: true });
        const single = slice.content.childCount === 1 && slice.content.firstChild?.type.name === 'paragraph' ? slice.content.firstChild : null;
        try {
          if (single && slice.openStart >= 1) view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.from(single), 1, 1)).scrollIntoView());
          else view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
          return true;
        } catch {
          return false;
        }
      },
    },
  });
}

// ───────── 折叠块：拆掉开着的外层 ─────────

const DETAILS = 'details';
const SUMMARY = 'details_summary';

/** 标题 → 一段普通文字（空标题不要）。 */
function summaryToParagraph(summary: PMNode): PMNode | null {
  const para = summary.type.schema.nodes.paragraph;
  if (!para) return null;
  return para.create(null, summary.content);
}

/** 拆开一个 details：标题换成段落，正文原样。 */
function detailsChildren(details: PMNode, keepEmptySummary: boolean): PMNode[] {
  const out: PMNode[] = [];
  details.forEach((child) => {
    if (child.type.name === SUMMARY) {
      if (!keepEmptySummary && child.content.size === 0) return;
      const p = summaryToParagraph(child);
      if (p) out.push(p);
    } else out.push(child);
  });
  return out;
}

/** 选区在折叠块里开头 / 结尾：拆掉外面那层 details（可能套好几层）。 */
export function unwrapOpenDetails(slice: Slice): Slice {
  let { content, openStart, openEnd } = slice;
  for (let guard = 0; guard < 50; guard++) {
    const first = content.firstChild;
    const last = content.lastChild;
    const single = content.childCount === 1;
    const headOpen = !!first && first.type.name === DETAILS && openStart > 0;
    const tailOpen = !!last && last.type.name === DETAILS && openEnd > 0;
    if (!headOpen && !tailOpen) break;
    const nodes: PMNode[] = [];
    content.forEach((n) => nodes.push(n));
    if (single) {
      // 同一个 details 两头都开着（或只开一头）：整个拆开
      // 起点开着的标题保持开着（是段落了），起点不开时空标题也不要
      const inner = detailsChildren(first!, headOpen && first!.firstChild?.type.name === SUMMARY);
      if (!inner.length) break;
      content = Fragment.fromArray(inner);
      openStart = headOpen ? openStart - 1 : 0;
      openEnd = tailOpen ? openEnd - 1 : 0;
      // 起点在正文里（切片里没有标题）、或在标题里：拆完后第一个孩子的开深度不变，合法
      continue;
    }
    let changed = false;
    if (headOpen) {
      const inner = detailsChildren(first!, first!.firstChild?.type.name === SUMMARY);
      nodes.splice(0, 1, ...inner);
      openStart -= 1;
      changed = true;
    }
    if (tailOpen) {
      const tailNode = nodes[nodes.length - 1]!;
      const inner = detailsChildren(tailNode, false);
      nodes.splice(nodes.length - 1, 1, ...inner);
      openEnd -= 1;
      changed = true;
    }
    if (!changed || !nodes.length) break;
    content = Fragment.fromArray(nodes);
  }
  if (content === slice.content) return slice;
  // 开深度不能超过实际层数（拆到最后只剩空内容等极端情况）
  openStart = Math.min(openStart, depthAtStart(content));
  openEnd = Math.min(openEnd, depthAtEnd(content));
  return new Slice(content, openStart, openEnd);
}

function depthAtStart(f: Fragment): number {
  let d = 0;
  for (let n = f.firstChild; n && !n.isLeaf && !n.isText; n = n.firstChild) d++;
  return d;
}
function depthAtEnd(f: Fragment): number {
  let d = 0;
  for (let n = f.lastChild; n && !n.isLeaf && !n.isText; n = n.lastChild) d++;
  return d;
}
