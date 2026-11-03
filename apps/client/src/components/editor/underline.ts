/**
 * 下划线（Rei 2026-11-03「下划线（直线cmd+u、波浪线cmd+u+1、双线cmd+u+2）」）。
 *
 * 三种：直线、波浪线、双线。markdown 没有下划线，存成行内 HTML：
 *   直线 `<u>字</u>`，波浪线 `<u class="wavy">字</u>`，双线 `<u class="double">字</u>`。
 * GitHub、Obsidian 和只读显示（marked + DOMPurify）都认 `<u>`；老版本的编辑器把标签显示成源码小块，字照常显示、存回去不丢。
 *
 * 按键：⌘U（Windows / Linux 是 Ctrl+U）加直线、再按去掉，和 ⌘B 一样：选了字改选中的字，没选改接下来打的字。
 * ⌘U 之后 ⌘ 还按着、1 秒内按 1 或 2：把这一下换成波浪线 / 双线；原来就是波浪线（双线）再按 ⌘U+1（⌘U+2）就去掉。
 * 这个时间窗里的 ⌘1 / ⌘2 只给下划线用，不往外传（类型页的 ⌘1 / ⌘2 不会跟着动）；窗口外照常。
 * 换样式和前面那下 ⌘U 是一次撤销。组字（中文输入法）时不管这些键（ime-guard.ts 同理）。
 */
import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { MdNode, ParseSpec, SerializeSpec } from './markdown';

export type UnderlineVariant = 'solid' | 'wavy' | 'double';

/** ⌘U 之后多久内按 1 / 2 算一组。 */
export const UNDERLINE_COMBO_MS = 1000;

const variantOf = (v: unknown): UnderlineVariant => (v === 'wavy' || v === 'double' ? v : 'solid');

/** 认的开标签：`<u>`、`<u class="wavy">`、`<u class="double">`（单引号、大小写都行）；别的属性不认，原样留着。 */
export const UNDERLINE_OPEN_RE = /^<u(?:\s+class=(["'])(wavy|double)\1)?\s*>$/i;
export const UNDERLINE_CLOSE_RE = /^<\/u\s*>$/i;

/** 写出去的开标签。 */
export const underlineOpenTag = (v: UnderlineVariant) => (v === 'solid' ? '<u>' : `<u class="${v}">`);

export const Underline = Mark.create({
  name: 'underline',
  addAttributes: () => ({
    variant: {
      default: 'solid',
      parseHTML: (el: HTMLElement) => (el.classList.contains('wavy') ? 'wavy' : el.classList.contains('double') ? 'double' : 'solid'),
      renderHTML: (a: Record<string, unknown>) => (a.variant === 'wavy' || a.variant === 'double' ? { class: a.variant } : {}),
    },
  }),
  // 只认 <u>：网页里的 text-decoration: underline 多半是链接的样式，粘贴时不当下划线
  parseHTML: () => [{ tag: 'u' }],
  renderHTML: ({ HTMLAttributes }) => ['u', mergeAttributes(HTMLAttributes), 0],
});

// ───────── 读写 markdown ─────────

/** 同一层里的 html 开标签 … 闭标签配成一个 underline 节点（不成对的照旧是 html，原样显示、原样存）。 */
function pairUnderline(children: MdNode[]): MdNode[] {
  const out: MdNode[] = [];
  const open: { start: number; variant: UnderlineVariant }[] = [];
  for (const c of children) {
    const v = c.type === 'html' ? String(c.value ?? '').trim() : '';
    const m = v ? UNDERLINE_OPEN_RE.exec(v) : null;
    if (m) {
      open.push({ start: out.length, variant: variantOf(m[2]?.toLowerCase()) });
      out.push(c);
      continue;
    }
    if (v && UNDERLINE_CLOSE_RE.test(v) && open.length) {
      const o = open.pop()!;
      const inner = out.splice(o.start + 1);
      out.pop();
      out.push({ type: 'underline', variant: o.variant, children: inner });
      continue;
    }
    out.push(c);
  }
  return out;
}

/** remark 插件：`<u>…</u>` 读成 underline 节点（段落、标题、表格格子、链接文字里都行）。 */
export const remarkUnderline = () => (tree: MdNode) => {
  const walk = (n: MdNode) => {
    if (!Array.isArray(n.children)) return;
    for (const c of n.children) walk(c);
    n.children = pairUnderline(n.children);
  };
  walk(tree);
};

export const underlineParse: ParseSpec[] = [
  { name: 'underline', mark: true, match: (n) => n.type === 'underline', run: (s, n, t) => void s.openMark(t, { variant: variantOf(n.variant) }).next(n.children).closeMark(t) },
];

export const underlineSerialize: Record<string, SerializeSpec> = {
  underline: { mark: (s, m) => void s.withMark(m, 'underline', undefined, { variant: variantOf(m.attrs.variant) }) },
};

interface StringifyState {
  enter(name: string): () => void;
  createTracker(info: unknown): { move(s: string): string; current(): Record<string, unknown> };
  containerPhrasing(node: unknown, info: unknown): string;
}

/** remark-stringify 的写法：`<u …>` + 里面的行内内容 + `</u>`。 */
export const underlineHandler = (node: MdNode, _p: unknown, state: StringifyState, info: Record<string, unknown>) => {
  const exit = state.enter('underline');
  const tracker = state.createTracker(info);
  let value = tracker.move(underlineOpenTag(variantOf(node.variant)));
  value += tracker.move(state.containerPhrasing(node, { before: value, after: '<', ...tracker.current() }));
  value += tracker.move('</u>');
  exit();
  return value;
};

// ───────── 按键 ─────────

/** 选区现在的下划线：整段都是同一种才算（混着、没有都是 null）；空光标看接下来打的字会带什么。 */
export function underlineAt(state: EditorState): UnderlineVariant | null {
  const type = state.schema.marks.underline;
  if (!type) return null;
  const { empty, $from, from, to } = state.selection;
  if (empty) {
    const m = type.isInSet(state.storedMarks ?? $from.marks());
    return m ? variantOf(m.attrs.variant) : null;
  }
  let seen: UnderlineVariant | null | undefined;
  let mixed = false;
  state.doc.nodesBetween(from, to, (n) => {
    if (mixed) return false;
    if (!n.isText) return true;
    const m = type.isInSet(n.marks);
    const cur = m ? variantOf(m.attrs.variant) : null;
    if (seen === undefined) seen = cur;
    else if (seen !== cur) mixed = true;
    return true;
  });
  return mixed || !seen ? null : seen;
}

/** 按了哪个键、原来是什么样 → 变成什么样（null = 没有下划线）。 */
export function nextUnderline(prev: UnderlineVariant | null, key: 'u' | '1' | '2'): UnderlineVariant | null {
  if (key === 'u') return prev ? null : 'solid';
  const want: UnderlineVariant = key === '1' ? 'wavy' : 'double';
  return prev === want ? null : want;
}

/** 把选区的下划线设成 variant（null = 去掉）。空光标：改接下来打的字。 */
export function setUnderlineTr(state: EditorState, variant: UnderlineVariant | null): Transaction {
  const type = state.schema.marks.underline!;
  const tr = state.tr;
  const sel = state.selection;
  if (sel.empty) {
    tr.removeStoredMark(type);
    if (variant) tr.addStoredMark(type.create({ variant }));
    return tr;
  }
  for (const r of sel.ranges) {
    tr.removeMark(r.$from.pos, r.$to.pos, type);
    if (variant) tr.addMark(r.$from.pos, r.$to.pos, type.create({ variant }));
  }
  return tr;
}

/** 键盘事件是不是 ⌘ / Ctrl + 这个键（不带 ⌥、⇧）。认 code，免得非英文键盘布局对不上。 */
const modKey = (e: KeyboardEvent, key: string, code: string) => (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key.toLowerCase() === key || e.code === code);
const composingKey = (e: KeyboardEvent, viewComposing: boolean) => e.isComposing || e.keyCode === 229 || viewComposing;

const underlineKey = new PluginKey('md-underline-keys');

export function underlineKeysExtension() {
  return Extension.create({
    name: 'mindoughUnderlineKeys',
    // 低于 ime-guard（2000），高于别的按键处理
    priority: 1500,
    addProseMirrorPlugins() {
      /** 最近一次 ⌘U：按之前的样子、什么时候按的、那次的事务（换样式时并进同一次撤销）。 */
      let combo: { prev: UnderlineVariant | null; at: number; tr: Transaction | null } | null = null;
      return [
        new Plugin({
          key: underlineKey,
          props: {
            handleKeyDown(view, event) {
              if (composingKey(event, view.composing)) return false;
              const { state } = view;
              if (!state.schema.marks.underline) return false;
              if (modKey(event, 'u', 'KeyU')) {
                if (event.repeat) return true;
                if (state.selection.empty && state.selection.$from.parent.type.spec.code) return false;
                const prev = underlineAt(state);
                const tr = setUnderlineTr(state, nextUnderline(prev, 'u'));
                view.dispatch(tr);
                combo = { prev, at: Date.now(), tr: tr.docChanged ? tr : null };
                return true;
              }
              const k = modKey(event, '1', 'Digit1') ? '1' : modKey(event, '2', 'Digit2') ? '2' : null;
              if (k && combo && Date.now() - combo.at <= UNDERLINE_COMBO_MS) {
                // 这一下是下划线的：不让外面的 ⌘1 / ⌘2（类型页切档）跟着动
                event.preventDefault();
                event.stopPropagation();
                const tr = setUnderlineTr(view.state, nextUnderline(combo.prev, k));
                if (combo.tr) tr.setMeta('appendedTransaction', combo.tr);
                view.dispatch(tr);
                combo = { ...combo, at: Date.now(), tr: combo.tr ?? (tr.docChanged ? tr : null) };
                return true;
              }
              // 别的键（不是单按修饰键）：这一组结束
              if (!['Meta', 'Control', 'Shift', 'Alt', 'OS'].includes(event.key)) combo = null;
              return false;
            },
            handleDOMEvents: {
              keyup(_view, event) {
                if (event.key === 'Meta' || event.key === 'Control' || event.key === 'OS') combo = null;
                return false;
              },
              blur() {
                combo = null;
                return false;
              },
            },
          },
        }),
      ];
    },
  });
}
