/**
 * 任务的第一行是标题，只能是纯文字（Rei 2026-11-03「任务的标题不渲染任何样式，或者列表，以及其他，任务标题是纯文本不渲染md」）。
 * 只用在任务正文（详情、新建面板）；日记、资料备注不开（MdEditor 的 plainTitle）。
 *
 * - 第一块永远是一个普通段落，里面只有不带格式的文字：不是标题、列表、清单、引用、代码块、表格、折叠块、公式、分隔线，
 *   也没有粗体、斜体、下划线、删除线、行内代码、链接。
 * - 在第一行打 `# ` `- ` `1. ` `> ` `[] ` ```` ``` ```` `**x**` `$x$` `[x](y)` 这些都不变，原样留着；⌘B ⌘I ⌘U ⌘E ⌘K、
 *   ⌘⌥1–6 等块级快捷键在第一行不起作用；回车、Shift+回车都是另起一段（第一行里没有硬换行）。
 * - 粘贴到第一行只取纯文字：剪贴板第一行原样进标题，后面的行照常当 markdown 进正文。
 * - 兜底（appendTransaction）：拖拽、撤销、删掉第一行让第二块上来……不管怎么改，第一块不对就当场改成纯文字段落：
 *   标题、引用、列表、折叠块拆出第一段的文字，去掉格式；代码块取第一行；硬换行、图片处拆成两段；公式、HTML 片段、脚注变回原文。
 *   表格、分隔线、块级公式这类拆不出文字的，前面补一个空段落。
 * - 存的时候第一行按字面文字转义（core escapeTitleLine），读回来、列表里显示都是原来那几个字。
 * - 老数据第一行是标题 / 列表 / 带粗体的：打开时显示成纯文字（normalizeTitleDoc），但不写回；用户真改了才按新样子存。
 */
import { Extension, type AnyExtension, type AnyConfig, InputRule as TiptapInputRule } from '@tiptap/core';
import { Fragment, Slice, type Node as PMNode, type Schema } from '@tiptap/pm/model';
import { EditorState, Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state';
import { splitBlock } from '@tiptap/pm/commands';
import type { Transform } from '@tiptap/pm/transform';
import type { EditorView } from '@tiptap/pm/view';
import { InputRule as PmInputRule } from '@tiptap/pm/inputrules';
import { escapeTitleLine } from '@mindough/core';
import type { MarkdownIO } from './markdown';

export const plainTitleKey = new PluginKey<boolean>('md-plain-title');

/** 这个编辑器开着「第一行纯文字」。 */
export const titleMode = (state: EditorState) => !!plainTitleKey.getState(state);

/** pos 在第一块里（含两头）。 */
export const inFirstBlock = (doc: PMNode, pos: number) => {
  const first = doc.firstChild;
  return !!first && pos >= 0 && pos < first.nodeSize;
};

/** 输入规则、回车变表格之类在这里不该动：开着纯文字标题、pos 在第一块里。 */
export const titleLocked = (state: EditorState, pos: number) => titleMode(state) && inFirstBlock(state.doc, pos);

/** 选区两头都在第一块里。 */
const selectionInTitle = (state: EditorState) => {
  const first = state.doc.firstChild;
  if (!first) return false;
  const { from, to } = state.selection;
  return from >= 0 && to < first.nodeSize;
};

// ───────── 规范第一块 ─────────

/** 行内的原子节点变回原文（公式 $x$、HTML 片段、脚注 [^1]）；拿不到原文的给空串。 */
function literalOf(node: PMNode): string {
  switch (node.type.name) {
    case 'math_inline': {
      const f = '$'.repeat(Number(node.attrs.fence) || 1);
      return `${f}${node.textContent}${f}`;
    }
    case 'html':
      return String(node.attrs.value ?? '');
    case 'footnote_reference':
      return `[^${String(node.attrs.label ?? '')}]`;
    default:
      return node.textContent;
  }
}

/**
 * 把 node 沿第一个孩子一路往下的第一个文字块拿出来，返回它和剩下的部分（空了就 null）。
 * 剩下的不合规矩（列表项开头必须是段落之类）就让 schema 补齐；补不齐 / 一路下去碰到的不是文字块，返回 null。
 */
function takeFirstTextblock(node: PMNode): { block: PMNode; rest: PMNode | null; depth: number } | null {
  const child = node.firstChild;
  if (!child) return null;
  let block: PMNode;
  let content: Fragment;
  let depth = 1;
  if (child.isTextblock) {
    block = child;
    content = node.content.cut(child.nodeSize);
  } else {
    if (child.isLeaf || child.type.name === 'table') return null;
    const sub = takeFirstTextblock(child);
    if (!sub) return null;
    block = sub.block;
    depth = sub.depth + 1;
    content = sub.rest ? node.content.replaceChild(0, sub.rest) : node.content.cut(child.nodeSize);
  }
  if (content.size === 0) return { block, rest: null, depth };
  if (node.type.validContent(content)) return { block, rest: node.copy(content), depth };
  const filled = node.type.createAndFill(node.attrs, content, node.marks);
  return filled ? { block, rest: filled, depth } : null;
}

/** 选区头在 [start, start + size] 里：记下它在这段文字里的位置，改完放回去。 */
function caretIn(tr: Transform, start: number, size: number): number | null {
  const sel = (tr as Transaction).selection;
  if (!sel || !('empty' in sel) || !sel.empty) return null;
  const head = sel.head;
  return head >= start && head <= start + size ? head - start : null;
}

function placeCaret(tr: Transform, offset: number | null) {
  if (offset == null || !('setSelection' in tr)) return;
  const t = tr as Transaction;
  const first = t.doc.firstChild;
  if (!first) return;
  t.setSelection(TextSelection.create(t.doc, 1 + Math.min(offset, first.content.size)));
}

/** 第一块改成纯文字段落；改了返回 true。tr 可以是 Transaction（appendTransaction）或别的 Transform。 */
export function normalizeTitle(tr: Transform): boolean {
  let changed = false;
  for (let i = 0; i < 12; i++) {
    const doc = tr.doc;
    const schema: Schema = doc.type.schema;
    const para = schema.nodes.paragraph!;
    const first = doc.firstChild;
    if (!first) break;

    if (first.type === para) {
      // 硬换行、图片：在那儿拆成两段（硬换行去掉），后面的照原样留在第二段
      let cut = -1;
      let cutBreak = false;
      first.forEach((c, off) => {
        if (cut >= 0) return;
        if (c.type.name === 'hardBreak' || c.type.name === 'image') {
          cut = 1 + off;
          cutBreak = c.type.name === 'hardBreak';
        }
      });
      if (cut >= 0) {
        if (cutBreak) tr.delete(cut, cut + 1);
        tr.split(cut);
        changed = true;
        continue;
      }
      // 别的行内原子（公式、HTML、脚注）：换成原文
      let atom: { node: PMNode; pos: number } | null = null;
      first.forEach((c, off) => {
        if (!atom && !c.isText) atom = { node: c, pos: 1 + off };
      });
      if (atom) {
        const a = atom as { node: PMNode; pos: number };
        const text = literalOf(a.node);
        if (text) tr.replaceWith(a.pos, a.pos + a.node.nodeSize, schema.text(text));
        else tr.delete(a.pos, a.pos + a.node.nodeSize);
        changed = true;
        continue;
      }
      let marked = false;
      first.forEach((c) => {
        if (c.marks.length) marked = true;
      });
      if (marked) {
        tr.removeMark(1, first.nodeSize - 1);
        changed = true;
        continue;
      }
      break;
    }

    if (first.isTextblock && first.type.spec.code && first.type.name === 'codeBlock') {
      // 代码块：第一行变成标题，剩下的还是代码块
      const text = first.textContent;
      const nl = text.indexOf('\n');
      const line = nl < 0 ? text : text.slice(0, nl);
      const rest = nl < 0 ? '' : text.slice(nl + 1);
      const caret = caretIn(tr, 1, line.length);
      const nodes = [para.create(null, line ? schema.text(line) : null)];
      if (rest) nodes.push(first.type.create(first.attrs, schema.text(rest)));
      tr.replaceWith(0, first.nodeSize, nodes);
      placeCaret(tr, caret);
      changed = true;
      continue;
    }

    if (first.isTextblock && !first.type.spec.code) {
      // 标题、折叠块标题之类：换成段落（字留着，格式下一轮去掉）
      tr.setNodeMarkup(0, para);
      changed = true;
      continue;
    }

    // 引用、列表、提示块、折叠块……：把第一段拆出来放到最前面
    const taken = first.isTextblock ? null : takeFirstTextblock(first);
    if (taken && !taken.block.type.spec.code) {
      const caret = caretIn(tr, taken.depth + 1, taken.block.content.size);
      tr.replaceWith(0, first.nodeSize, taken.rest ? [taken.block, taken.rest] : [taken.block]);
      placeCaret(tr, caret);
      changed = true;
      continue;
    }
    // 拆不出文字（表格、分隔线、块级公式…）：前面补一个空段落
    tr.insert(0, para.create());
    changed = true;
    break;
  }
  return changed;
}

/** 读进来的文档：第一块规范成纯文字段落（只改显示，不改原文；见 editor.ts）。 */
export function normalizeTitleDoc(doc: PMNode): PMNode {
  const state = EditorState.create({ doc });
  const tr = state.tr;
  return normalizeTitle(tr) ? tr.doc : doc;
}

// ───────── 写出 ─────────

/** 第一块是不带格式的段落：返回它的文字；否则 null。 */
function plainFirstLine(doc: PMNode): string | null {
  const first = doc.firstChild;
  if (!first || first.type.name !== 'paragraph') return null;
  let plain = true;
  first.forEach((c) => {
    if (!c.isText || c.marks.length) plain = false;
  });
  return plain ? first.textContent : null;
}

/**
 * 开着纯文字标题时写 markdown：第一行按字面文字转义（escapeTitleLine），后面的块照常写。
 * 第一行是空的（或不是纯文字，理论上不会）就整篇照常写。
 */
export function serializeWithTitle(io: MarkdownIO, doc: PMNode): string {
  const line = plainFirstLine(doc);
  const head = line == null ? '' : escapeTitleLine(line);
  if (!head) return io.serialize(doc);
  if (doc.childCount === 1) return `${head}\n`;
  const rest = io.serialize(doc.copy(doc.content.cut(doc.firstChild!.nodeSize)));
  return rest.trim() ? `${head}\n\n${rest}` : `${head}\n`;
}

// ───────── 输入规则 ─────────

/** Tiptap 的输入规则包一层：第一块里不触发。 */
const guardRule = (rule: TiptapInputRule) =>
  new TiptapInputRule({
    find: rule.find,
    undoable: rule.undoable,
    handler: (props) => (titleLocked(props.state, props.range.from) ? null : rule.handler(props)),
  });

/** ProseMirror 的输入规则（自己用 inputRules 插件挂的那些）包一层：第一块里不触发。match / handler 是 PM 的内部字段。 */
type PmRuleFields = { match: RegExp; handler: (state: EditorState, match: RegExpMatchArray, start: number, end: number) => Transaction | null; undoable: boolean; inCode: boolean | 'only'; inCodeMark: boolean | 'only' };
export const guardTitleRules = (rules: PmInputRule[]): PmInputRule[] =>
  rules.map((rule) => {
    const r = rule as unknown as PmRuleFields;
    return new PmInputRule(r.match, (state, match, start, end) => (titleLocked(state, start) ? null : r.handler(state, match, start, end)), {
      undoable: r.undoable,
      inCode: r.inCode,
      inCodeMark: r.inCodeMark,
    });
  });

const hasInputRules = (ext: AnyExtension) => {
  for (let e: AnyExtension | null = ext; e; e = e.parent as AnyExtension | null) if ((e.config as AnyConfig).addInputRules) return true;
  return false;
};

/** 每个扩展的 Tiptap 输入规则都包一层（只在开着纯文字标题的编辑器里用；schema 不变）。 */
export function guardTitleInputRules(exts: AnyExtension[]): AnyExtension[] {
  return exts.map((ext) =>
    hasInputRules(ext)
      ? (ext.extend({
          addInputRules() {
            const rules = (this.parent?.() ?? []) as TiptapInputRule[];
            return rules.map(guardRule);
          },
        }) as AnyExtension)
      : ext,
  );
}

// ───────── 按键、粘贴、兜底 ─────────

/** 键盘事件的主键：字母 / 数字按物理键（⌥ 在 Mac 上会把字母变成别的字），别的按 key。 */
const keyName = (e: KeyboardEvent) => /^Key([A-Z])$/.exec(e.code)?.[1]?.toLowerCase() ?? /^Digit(\d)$/.exec(e.code)?.[1] ?? e.key.toLowerCase();

/** 第一行里不起作用的格式快捷键（粗体、斜体、下划线、代码、链接、标题、列表、引用、代码块、删除线…）。 */
export function isFormatShortcut(e: KeyboardEvent): boolean {
  if (!(e.metaKey || e.ctrlKey)) return false;
  const k = keyName(e);
  if (e.altKey) return /^[0-9]$/.test(k) || k === 'x' || k === 'c';
  if (e.shiftKey) return ['b', 'x', 's', 'e', 'h', 'm', '7', '8', '9'].includes(k);
  return ['b', 'i', 'u', 'e', 'k'].includes(k);
}

const composingKey = (view: EditorView, e: KeyboardEvent) => e.isComposing || e.keyCode === 229 || view.composing;

export interface PlainTitleOptions {
  io: () => MarkdownIO;
}

/**
 * 纯文字标题的扩展。优先级 1800：低于 ime-guard（2000，输入法的回车先给它），高于下划线（1500）、
 * 折叠块 / 公式 / 行为扩展（≤ 1100）和各个节点自己的快捷键，所以第一行的格式快捷键、回车在这里先拦下。
 */
export function plainTitleExtension(opts: PlainTitleOptions) {
  return Extension.create({
    name: 'mindoughPlainTitle',
    priority: 1800,
    addProseMirrorPlugins() {
      return [
        new Plugin<boolean>({
          key: plainTitleKey,
          state: { init: () => true, apply: (_tr, v) => v },
          appendTransaction(trs, _old, state) {
            if (!trs.some((t) => t.docChanged)) return null;
            const tr = state.tr;
            return normalizeTitle(tr) ? tr : null;
          },
          props: {
            handleKeyDown(view, event) {
              if (composingKey(view, event)) return false;
              const { state } = view;
              if (!selectionInTitle(state)) return false;
              if (isFormatShortcut(event)) {
                event.preventDefault();
                // ⌘K：也不让外面的 ⌘K（搜索）接着开
                if (keyName(event) === 'k') event.stopPropagation();
                return true;
              }
              // 回车、Shift+回车：只是另起一段（不变表格、折叠块、代码块、公式块，也不插硬换行）
              if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey) {
                return splitBlock(state, view.dispatch);
              }
              return false;
            },
            handlePaste(view, event) {
              if (!view.editable) return false;
              const { state } = view;
              if (!inFirstBlock(state.doc, state.selection.from)) return false;
              const data = event.clipboardData;
              if (!data || [...(data.files ?? [])].length) return false;
              const text = data.getData('text/plain');
              if (!text) return false;
              const lines = text.replace(/\r\n?/g, '\n').split('\n');
              const head = lines[0] ?? '';
              const restText = lines.slice(1).join('\n');
              const schema = state.schema;
              const headNode = schema.nodes.paragraph!.create(null, head ? schema.text(head) : null);
              let tr: Transaction;
              if (!restText.trim()) {
                tr = state.tr.replaceSelection(new Slice(Fragment.from(headNode), 1, 1));
              } else {
                let rest: PMNode[] = [];
                try {
                  opts
                    .io()
                    .parse(restText)
                    .forEach((n) => void rest.push(n));
                } catch {
                  rest = [schema.nodes.paragraph!.create(null, schema.text(restText))];
                }
                const last = rest[rest.length - 1];
                tr = state.tr.replaceSelection(new Slice(Fragment.fromArray([headNode, ...rest]), 1, last?.isTextblock ? 1 : 0));
              }
              view.dispatch(tr.scrollIntoView());
              return true;
            },
          },
        }),
      ];
    },
  });
}
