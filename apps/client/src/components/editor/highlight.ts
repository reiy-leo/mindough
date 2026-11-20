/**
 * 高亮（Rei 2026-11-20 12:15「==文字==存高亮做，固定几种light dark theme都适合的颜色，可以参考Notion的颜色」；
 * 12:16「好复杂，高亮的点击直接切换颜色就好」）。
 *
 * 九种颜色，照 Notion 的背景色：灰、棕、橙、黄（默认）、绿、蓝、紫、粉、红。亮色、暗色各一套固定色值（styles/editor.css），字还是正文色。
 * 存法：黄色是 `==字==`；别的颜色存成行内 HTML `<mark data-color="red">字</mark>`，别的 Markdown 阅读器至少显示成高亮。
 * 读入时 `==` 要成对、紧贴着字（`a == b` 不算），三个以上的等号不算，转义过的 `\=\=` 不算；行内代码、代码块里不认（它们不是文字节点）。
 * 写出时文字里会被读成高亮的 `==` 加反斜杠，往返不变。
 *
 * - 手打 `==字==` 当场变成黄色高亮（输入规则；第一行纯文字标题里不变，title.ts 包了一层）。
 * - ⌘⇧H（Windows / Linux 是 Ctrl+Shift+H）切换黄色高亮：选了字改选中的，没选改接下来打的字。第一行标题里不起作用（title.ts 的 isFormatShortcut）。
 * - 换颜色：点一下已有的高亮，旁边弹小色板（MdEditor.tsx），点色点整段换色，「去掉高亮」去掉。点的时候光标照常放下。
 */
import { Extension, Mark, markInputRule, mergeAttributes } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { MdNode, ParseSpec, SerializeSpec } from './markdown';

export const HIGHLIGHT_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];
export const DEFAULT_HIGHLIGHT: HighlightColor = 'yellow';

export const highlightColorOf = (v: unknown): HighlightColor => (HIGHLIGHT_COLORS as readonly string[]).includes(String(v)) ? (v as HighlightColor) : DEFAULT_HIGHLIGHT;

/** 认的开标签：`<mark>`、`<mark data-color="red">`（单双引号、大小写都行）；颜色不认识的当黄色。 */
export const MARK_OPEN_RE = /^<mark(?:\s+data-color=(["'])([a-z]+)\1)?\s*>$/i;
export const MARK_CLOSE_RE = /^<\/mark\s*>$/i;

/** 手打 `==字==`：行首或空白后面开始（和 Tiptap 的粗体、官方高亮一样，免得吃掉前面的字），里面不以空白开头结尾、不含等号。 */
export const HIGHLIGHT_INPUT_RE = /(?:^|\s)(==(?!\s)([^=]+?)(?<!\s)==)$/;

export const Highlight = Mark.create({
  name: 'highlight',
  addAttributes: () => ({
    color: {
      default: DEFAULT_HIGHLIGHT,
      parseHTML: (el: HTMLElement) => highlightColorOf(el.getAttribute('data-color')),
      renderHTML: (a: Record<string, unknown>) => ({ 'data-color': highlightColorOf(a.color) }),
    },
  }),
  parseHTML: () => [{ tag: 'mark' }],
  renderHTML: ({ HTMLAttributes }) => ['mark', mergeAttributes(HTMLAttributes, { class: 'md-highlight' }), 0],
  addInputRules() {
    return [markInputRule({ find: HIGHLIGHT_INPUT_RE, type: this.type, getAttributes: { color: DEFAULT_HIGHLIGHT } })];
  },
});

// ───────── 读 markdown ─────────

/** 一段文字里每个 `==` 的位置（只认正好两个等号的，三个以上的整串不算）。escaped[i] 为真的是转义过的，不算。 */
function markerOffsets(value: string, escaped: (i: number) => boolean): number[] {
  const out: number[] = [];
  const re = /={2,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value))) {
    if (m[0].length !== 2) continue;
    if (escaped(m.index) || escaped(m.index + 1)) continue;
    out.push(m.index);
  }
  return out;
}

/**
 * 文字节点在原文里有没有被转义的字：按原文逐字对，返回「value 里第 i 个字是不是转义来的」。
 * 原文和 value 对不上（实体、别的插件改过）时，只认原文里能直接找到的那些。
 */
function escapedMap(value: string, source: string | null): (i: number) => boolean {
  if (source == null || source === value) return () => false;
  const esc = new Set<number>();
  let j = 0;
  for (let i = 0; i < source.length && j < value.length; ) {
    const c = source[i]!;
    if (c === '\\' && i + 1 < source.length && /[!-/:-@[-`{-~]/.test(source[i + 1]!) && value[j] === source[i + 1]) {
      esc.add(j);
      i += 2;
      j += 1;
      continue;
    }
    if (c === value[j]) {
      i += 1;
      j += 1;
      continue;
    }
    if (c === '&') {
      // 实体：跳到分号，value 里算一个字
      const end = source.indexOf(';', i);
      if (end > i) {
        i = end + 1;
        j += 1;
        continue;
      }
    }
    // 对不上（换行之类）：原文往前走
    i += 1;
  }
  return (i) => esc.has(i);
}

/** 拆出来的 `==` 记号（别用 marker 这个名字：remarkMarker 给粗体、斜体挂的就是 marker）。 */
type Piece = MdNode & { hlMarker?: boolean; canOpen?: boolean; canClose?: boolean };

const isSpace = (s: string | undefined) => s == null || /\s/.test(s);

/** 一层 children 里的 `==…==` 配成 highlight 节点（不跨链接、强调这些节点的边界；不成对的照旧是文字）。 */
function pairEquals(children: MdNode[], source: string | null): MdNode[] {
  // 先把文字拆成「字 / 记号」
  const pieces: Piece[] = [];
  for (const c of children) {
    if (c.type !== 'text' || typeof c.value !== 'string' || !c.value.includes('==')) {
      pieces.push(c);
      continue;
    }
    const value = c.value;
    const pos = (c as { position?: { start?: { offset?: number }; end?: { offset?: number } } }).position;
    const src = source != null && pos?.start?.offset != null && pos.end?.offset != null ? source.slice(pos.start.offset, pos.end.offset) : null;
    const offs = markerOffsets(value, escapedMap(value, src));
    if (!offs.length) {
      pieces.push(c);
      continue;
    }
    let at = 0;
    for (const o of offs) {
      if (o > at) pieces.push({ type: 'text', value: value.slice(at, o) });
      // 记号前后挨着的字：能不能开（后面紧贴字）、能不能关（前面紧贴字）
      const before = value[o - 1];
      const after = value[o + 2];
      pieces.push({ type: 'text', value: '==', hlMarker: true, canOpen: after != null ? !isSpace(after) : true, canClose: before != null ? !isSpace(before) : true } as Piece);
      at = o + 2;
    }
    if (at < value.length) pieces.push({ type: 'text', value: value.slice(at) });
  }
  if (!pieces.some((p) => p.hlMarker)) return children;
  // 再配对：开的记号后面第一个能关的记号（中间得有东西）
  const out: Piece[] = [];
  let open = -1;
  for (const p of pieces) {
    const mk = p;
    if (!mk.hlMarker) {
      out.push(p);
      continue;
    }
    if (open >= 0 && mk.canClose && out.length > open + 1) {
      const inner = out.splice(open + 1);
      out.pop();
      out.push({ type: 'highlight', color: DEFAULT_HIGHLIGHT, children: inner.map(plainPiece) } as MdNode);
      open = -1;
      continue;
    }
    if (mk.canOpen) open = out.length;
    out.push(p);
  }
  // 合并相邻文字（没配上的记号回到文字里）
  const merged: MdNode[] = [];
  for (const p of out.map(plainPiece)) {
    const last = merged[merged.length - 1];
    if (p.type === 'text' && last?.type === 'text') merged[merged.length - 1] = { type: 'text', value: `${String(last.value)}${String(p.value)}` } as MdNode;
    else merged.push(p);
  }
  return merged;
}

const plainPiece = (p: Piece): MdNode => (p.hlMarker ? ({ type: 'text', value: '==' } as MdNode) : p);

/** 同一层里的 `<mark …>` … `</mark>` 配成 highlight 节点（不成对的照旧是 html）。 */
function pairMarkTags(children: MdNode[]): MdNode[] {
  const out: MdNode[] = [];
  const open: { start: number; color: HighlightColor }[] = [];
  for (const c of children) {
    const v = c.type === 'html' ? String(c.value ?? '').trim() : '';
    const m = v ? MARK_OPEN_RE.exec(v) : null;
    if (m) {
      open.push({ start: out.length, color: highlightColorOf(m[2]?.toLowerCase()) });
      out.push(c);
      continue;
    }
    if (v && MARK_CLOSE_RE.test(v) && open.length) {
      const o = open.pop()!;
      const inner = out.splice(o.start + 1);
      out.pop();
      out.push({ type: 'highlight', color: o.color, children: inner });
      continue;
    }
    out.push(c);
  }
  return out;
}

/** 不往里找 `==` 的节点：代码、HTML、公式（它们的字不是 text 子节点，这里只是保险）。 */
const SKIP = new Set(['inlineCode', 'code', 'html', 'math', 'inlineMath']);

/** remark 插件：`==字==`、`<mark data-color>字</mark>` 读成 highlight 节点。要排在 remarkUnderline 后面。 */
export function remarkHighlight() {
  return (tree: MdNode, file?: { value?: unknown }) => {
    const source = typeof file?.value === 'string' ? file.value : null;
    const walk = (n: MdNode) => {
      if (!Array.isArray(n.children) || SKIP.has(n.type)) return;
      for (const c of n.children) walk(c);
      n.children = pairEquals(pairMarkTags(n.children), source);
    };
    walk(tree);
  };
}

export const highlightParse: ParseSpec[] = [
  { name: 'highlight', mark: true, match: (n) => n.type === 'highlight', run: (s, n, t) => void s.openMark(t, { color: highlightColorOf(n.color) }).next(n.children).closeMark(t) },
];

export const highlightSerialize: Record<string, SerializeSpec> = {
  highlight: { mark: (s, m) => void s.withMark(m, 'highlight', undefined, { color: highlightColorOf(m.attrs.color) }) },
};

// ───────── 写 markdown ─────────

interface StringifyState {
  enter(name: string): () => void;
  createTracker(info: unknown): { move(s: string): string; current(): Record<string, unknown> };
  containerPhrasing(node: unknown, info: unknown): string;
}

/** remark-stringify 的写法：黄色 `==…==`，别的颜色 `<mark data-color="…">…</mark>`。 */
export const highlightHandler = (node: MdNode, _p: unknown, state: StringifyState, info: Record<string, unknown>) => {
  const color = highlightColorOf(node.color);
  const yellow = color === DEFAULT_HIGHLIGHT;
  const exit = state.enter('highlight');
  const tracker = state.createTracker(info);
  let value = tracker.move(yellow ? '==' : `<mark data-color="${color}">`);
  value += tracker.move(state.containerPhrasing(node, { before: value, after: yellow ? '=' : '<', ...tracker.current() }));
  value += tracker.move(yellow ? '==' : '</mark>');
  exit();
  return value;
};

/**
 * 文字里可能被读成高亮记号的 `==`（正好两个等号，前面或后面紧贴着字）加反斜杠；`a == b` 这种两边都是空白的不动。
 * 文字写法外面包一层（markdown.ts 组装时装）。
 */
export const escapeEquals = (s: string) =>
  // 前面已经转义了第一个等号的（行首的 = 会被转成 \=）：第二个也转上
  s.replace(/\\=(?==(?!=))/g, '\\=\\').replace(/(?<![=\\])==(?!=)/g, (m, off: number, all: string) => {
    const before = all[off - 1];
    const after = all[off + 2];
    const touches = before == null || after == null || !/\s/.test(before) || !/\s/.test(after);
    return touches ? '\\=\\=' : m;
  });

type TextHandler = (node: MdNode, parent: unknown, state: { safe(v: string, info: unknown): string }, info: unknown) => string;
export const highlightSafeText =
  (prev: TextHandler): TextHandler =>
  (node, parent, state, info) => {
    const out = prev(node, parent, state, info);
    return out.includes('==') ? escapeEquals(out) : out;
  };

// ───────── 按键、选区 ─────────

/** 选区（空光标看接下来打的字）的高亮颜色：整段同一种才算，混着、没有是 null。 */
export function highlightAt(state: EditorState): HighlightColor | null {
  const type = state.schema.marks.highlight;
  if (!type) return null;
  const { empty, $from, from, to } = state.selection;
  if (empty) {
    const m = type.isInSet(state.storedMarks ?? $from.marks());
    return m ? highlightColorOf(m.attrs.color) : null;
  }
  let seen: HighlightColor | null | undefined;
  let mixed = false;
  state.doc.nodesBetween(from, to, (n) => {
    if (mixed) return false;
    if (!n.isText) return true;
    const m = type.isInSet(n.marks);
    const cur = m ? highlightColorOf(m.attrs.color) : null;
    if (seen === undefined) seen = cur;
    else if (seen !== cur) mixed = true;
    return true;
  });
  return mixed || !seen ? null : seen;
}

/** 选区的高亮设成 color（null = 去掉）；空光标改接下来打的字。 */
export function setHighlightTr(state: EditorState, color: HighlightColor | null): Transaction {
  const type = state.schema.marks.highlight!;
  const tr = state.tr;
  const sel = state.selection;
  if (sel.empty) {
    tr.removeStoredMark(type);
    if (color) tr.addStoredMark(type.create({ color }));
    return tr;
  }
  for (const r of sel.ranges) {
    tr.removeMark(r.$from.pos, r.$to.pos, type);
    if (color) tr.addMark(r.$from.pos, r.$to.pos, type.create({ color }));
  }
  return tr;
}

/** 一段高亮：[from, to) 和颜色。 */
export interface HighlightRange {
  from: number;
  to: number;
  color: HighlightColor;
}

/** pos 处（含两头）那段连着的同色高亮；不在高亮里是 null。 */
export function highlightRangeAt(doc: PMNode, pos: number): HighlightRange | null {
  const type = doc.type.schema.marks.highlight;
  if (!type || pos < 0 || pos > doc.content.size) return null;
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;
  if (!parent.inlineContent) return null;
  const start = $pos.start();
  const runs: { from: number; to: number; color: HighlightColor }[] = [];
  parent.forEach((child, off) => {
    const m = type.isInSet(child.marks);
    const from = start + off;
    const to = from + child.nodeSize;
    const last = runs[runs.length - 1];
    const color = m ? highlightColorOf(m.attrs.color) : null;
    if (color && last && last.to === from && last.color === color) last.to = to;
    else if (color) runs.push({ from, to, color });
  });
  return runs.find((r) => r.from <= pos && pos <= r.to) ?? null;
}

/** 把这一段高亮换成 color（null = 去掉）。 */
export function recolorHighlightTr(state: EditorState, range: { from: number; to: number }, color: HighlightColor | null): Transaction {
  const type = state.schema.marks.highlight!;
  const tr = state.tr.removeMark(range.from, range.to, type);
  if (color) tr.addMark(range.from, range.to, type.create({ color }));
  return tr;
}

/** ⌘⇧H / Ctrl+Shift+H（认 code，免得别的键盘布局对不上；不带 ⌥）。 */
export const isHighlightShortcut = (e: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'key' | 'code'>) =>
  (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && (e.code === 'KeyH' || e.key.toLowerCase() === 'h');

const composingKey = (e: KeyboardEvent, viewComposing: boolean) => e.isComposing || e.keyCode === 229 || viewComposing;

export const highlightKey = new PluginKey('md-highlight');

export interface HighlightHooks {
  /** 点了一段高亮（只在能编辑时）：外面弹色板。 */
  onClick?: (range: HighlightRange) => void;
}

/** ⌘⇧H 切换黄色高亮；点高亮通知外面。优先级 1500：低于纯文字标题（1800，第一行里先拦下）和输入法守卫。 */
export function highlightExtension(hooks: () => HighlightHooks = () => ({})) {
  return Extension.create({
    name: 'mindoughHighlight',
    priority: 1500,
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: highlightKey,
          props: {
            handleKeyDown(view, event) {
              if (!isHighlightShortcut(event) || composingKey(event, view.composing)) return false;
              const { state } = view;
              if (!state.schema.marks.highlight) return false;
              event.preventDefault();
              if (event.repeat) return true;
              const { $from, empty } = state.selection;
              // 代码块、行内代码里不加
              if ($from.parent.type.spec.code || (empty && $from.marks().some((m) => m.type.name === 'code'))) return true;
              view.dispatch(setHighlightTr(state, highlightAt(state) === DEFAULT_HIGHLIGHT ? null : DEFAULT_HIGHLIGHT));
              return true;
            },
            handleClick(view, _pos, event) {
              if (!view.editable || event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
              // 按点中的 <mark> 找那一段（不按点的位置：点在高亮最后一个字后半边时位置已经在高亮外面了）
              const el = (event.target as HTMLElement | null)?.closest?.('mark') as HTMLElement | null;
              if (!el || !view.dom.contains(el)) return false;
              let at: number;
              try {
                at = view.posAtDOM(el, 0);
              } catch {
                return false;
              }
              const r = highlightRangeAt(view.state.doc, at);
              if (r) hooks().onClick?.(r);
              // 不拦：光标照常放在点的位置
              return false;
            },
          },
        }),
      ];
    },
  });
}
