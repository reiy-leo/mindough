/**
 * 手机键盘上方的格式栏（Rei 2026-11-21 11:22「先做A」）：按钮的状态和点了做什么。界面在 FormatBar.tsx，什么时候出现见 lib/soft-keyboard.ts。
 *
 * - 一排按钮，顺序固定（FORMAT_BAR_ORDER）：清单、列表、编号列表、标题、粗体、高亮、引用、行内代码、链接、@、缩进、减少缩进、上移、下移、撤销。
 * - 状态跟着光标：光标在粗体里，粗体按钮是按下的样子，再点一下去掉；列表、标题、引用、清单、高亮、行内代码、链接一样。
 * - 标题点一下换一级：正文 → 标题 1 → 标题 2 → 标题 3 → 正文（4–6 级也回到正文）。
 * - 高亮：没有高亮就加黄色；光标已经在高亮里（或选中的字是同一种高亮）就交给外面弹那个九色色板（和点高亮一样）。
 * - 链接、@ 交给外面：链接开现有的链接框，@ 在光标处打一个 @，弹现有的候选浮层。
 * - 上移、下移和 ⌥↑↓ / Ctrl+↑↓ 是同一个（move-block.ts）；缩进、减少缩进和 Tab / Shift+Tab 一样，只在列表里能用。
 * - 任务第一行是纯文字标题（title.ts）：光标在第一行时格式按钮都灰掉，只留 @、撤销。代码块里格式按钮也灰掉。
 * - 输入法正在组字时什么都不做（runFormat 返回 'skip'），免得打断上屏（ime-guard.ts 同理）。
 */
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { DEFAULT_HIGHLIGHT, highlightAt, highlightRangeAt, setHighlightTr, type HighlightRange } from './highlight';
import { moveBlockTr } from './move-block';
import { titleLocked } from './title';
import { linkAtSelection } from './editor';

export type FormatButtonId =
  | 'task'
  | 'bullet'
  | 'ordered'
  | 'heading'
  | 'bold'
  | 'highlight'
  | 'quote'
  | 'code'
  | 'link'
  | 'mention'
  | 'indent'
  | 'outdent'
  | 'up'
  | 'down'
  | 'undo';

/** 按钮顺序（Rei 2026-11-21 定的方案 A）。 */
export const FORMAT_BAR_ORDER: readonly FormatButtonId[] = ['task', 'bullet', 'ordered', 'heading', 'bold', 'highlight', 'quote', 'code', 'link', 'mention', 'indent', 'outdent', 'up', 'down', 'undo'];

export interface FormatButtonState {
  /** 光标所在的地方已经是这种格式（按钮显示成按下）。 */
  active: boolean;
  disabled: boolean;
}

export interface FormatBarState {
  buttons: Record<FormatButtonId, FormatButtonState>;
  /** 光标所在块的标题级别，0 = 不是标题。 */
  heading: number;
}

/** 点了以后外面要做的事：done 已经改好；link 开链接框；mention 已经打了 @（外面记下位置，弹日期项）；palette 弹高亮色板；skip 没做。 */
export type FormatResult = { kind: 'done' } | { kind: 'skip' } | { kind: 'link' } | { kind: 'mention'; at: number } | { kind: 'palette'; range: HighlightRange };

interface ItemAt {
  pos: number;
  node: PMNode;
  /** 它所在列表的类型名（bulletList / orderedList）。 */
  list: string;
}

/** 光标所在的、最里面那一项列表项。 */
export function listItemAt(state: EditorState): ItemAt | null {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (n.type.name === 'listItem') return { pos: $from.before(d), node: n, list: $from.node(d - 1).type.name };
  }
  return null;
}

/** 选区碰到的列表项：只算第一段落在选区里的那几项（光标在子项里就只算子项，不连带外面那项）。 */
export function listItemsInSelection(state: EditorState): { pos: number; node: PMNode }[] {
  const { from, to } = state.selection;
  const out: { pos: number; node: PMNode }[] = [];
  state.doc.nodesBetween(from, to, (n, pos) => {
    if (n.type.name !== 'listItem') return true;
    const first = n.firstChild;
    const start = pos + 1;
    const end = start + (first?.nodeSize ?? 0);
    if (from <= end && to >= start) out.push({ pos, node: n });
    return true;
  });
  return out;
}

function setChecked(tr: Transaction, items: { pos: number; node: PMNode }[], checked: boolean | null, only?: (n: PMNode) => boolean) {
  for (const it of items) {
    const n = tr.doc.nodeAt(it.pos);
    if (!n || n.type.name !== 'listItem' || (only && !only(n))) continue;
    if (n.attrs.checked === checked) continue;
    tr.setNodeMarkup(it.pos, undefined, { ...n.attrs, checked });
  }
  return tr;
}

/** 光标所在块的标题级别；不是标题是 0。 */
export function headingLevel(state: EditorState): number {
  const p = state.selection.$from.parent;
  return p.type.name === 'heading' ? Number(p.attrs.level) || 1 : 0;
}

/** 标题按钮的下一级：0 → 1 → 2 → 3 → 0，4–6 级也回到 0（正文）。 */
export const nextHeading = (level: number) => (level <= 0 ? 1 : level < 3 ? level + 1 : 0);

/** 光标在代码块里（行内代码不算：行内代码外面还能套粗体、链接）。 */
const inCode = (state: EditorState) => !!state.selection.$from.parent.type.spec.code;

/** 光标 / 选区的高亮：空光标在一段高亮里 → 那一段；选区整段同一种高亮 → 选区。没有是 null。 */
export function highlightTarget(state: EditorState): HighlightRange | null {
  const { empty, from, to } = state.selection;
  if (empty) return highlightRangeAt(state.doc, from);
  const c = highlightAt(state);
  return c ? { from, to, color: c } : null;
}

const off = (): FormatButtonState => ({ active: false, disabled: true });

/** 每个按钮现在的样子。 */
export function formatBarState(editor: Editor, opts: { mention: boolean }): FormatBarState {
  const state = editor.state;
  const editable = editor.isEditable;
  const locked = titleLocked(state, state.selection.from);
  const code = inCode(state);
  const noFormat = !editable || locked || code;
  const li = listItemAt(state);
  const task = !!li && li.node.attrs.checked != null;
  const level = headingLevel(state);
  const can = editor.can();
  const safe = (f: () => boolean) => {
    try {
      return f();
    } catch {
      return false;
    }
  };
  const hl = highlightTarget(state) != null || highlightAt(state) != null;
  const b = (active: boolean, disabled: boolean): FormatButtonState => ({ active: active && !disabled, disabled });
  const buttons: Record<FormatButtonId, FormatButtonState> = {
    task: b(task, noFormat),
    bullet: b(li?.list === 'bulletList' && !task, noFormat),
    ordered: b(li?.list === 'orderedList', noFormat),
    heading: b(level > 0, noFormat || (level === 0 && !safe(() => can.setHeading({ level: 1 })))),
    bold: b(editor.isActive('bold'), noFormat),
    highlight: b(hl, noFormat || editor.isActive('code')),
    quote: b(editor.isActive('blockquote'), noFormat),
    code: b(editor.isActive('code'), noFormat),
    link: b(!!linkAtSelection(state), noFormat),
    mention: opts.mention ? b(false, !editable || code) : off(),
    indent: b(false, !editable || locked || !li || !safe(() => can.sinkListItem('listItem'))),
    outdent: b(false, !editable || locked || !li || !safe(() => can.liftListItem('listItem'))),
    up: b(false, !editable || !moveBlockTr(state, 'up')),
    down: b(false, !editable || !moveBlockTr(state, 'down')),
    undo: b(false, !editable || !safe(() => can.undo())),
  };
  return { buttons, heading: level };
}

/** 输入法正在组字（ProseMirror 的判断，加上外面自己记的）。 */
export const isComposing = (editor: Editor, extra = false) => {
  try {
    return extra || editor.view.composing;
  } catch {
    return true;
  }
};

/** 清单按钮：在清单项里 → 变回普通列表项；在普通列表 / 编号列表里或不在列表里 → 变成没勾的清单项。 */
function toggleTask(editor: Editor) {
  const state = editor.state;
  const li = listItemAt(state);
  if (li && li.node.attrs.checked != null) {
    editor.view.dispatch(setChecked(state.tr, listItemsInSelection(state), null, (n) => n.attrs.checked != null));
    return;
  }
  if (!li || li.list !== 'bulletList') {
    if (!editor.commands.toggleBulletList()) return;
  }
  const s = editor.state;
  editor.view.dispatch(setChecked(s.tr, listItemsInSelection(s), false, (n) => n.attrs.checked == null));
}

/** 列表按钮：清单项 → 普通列表项；普通列表里 → 去掉列表；别的 → 变成列表。 */
function toggleBullet(editor: Editor) {
  const state = editor.state;
  const li = listItemAt(state);
  if (li && li.list === 'bulletList' && li.node.attrs.checked != null) {
    editor.view.dispatch(setChecked(state.tr, listItemsInSelection(state), null));
    return;
  }
  editor.commands.toggleBulletList();
}

/** 光标所在那个列表（最里面一层）和它在文档里的位置。 */
function listAt(state: EditorState): { pos: number; node: PMNode } | null {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (n.type.name === 'bulletList' || n.type.name === 'orderedList') return { pos: $from.before(d), node: n };
  }
  return null;
}

/**
 * 编号列表按钮：列表换成编号列表时，整个列表去掉清单勾（编号列表里不放清单），松紧（项之间空不空一行）照原来的列表；
 * 段落包成编号列表时同 ⌘⌥7。已经是编号列表再点，去掉列表。
 */
function toggleOrdered(editor: Editor) {
  const before = listAt(editor.state);
  const was = before?.node.type.name === 'orderedList';
  const spread = before?.node.attrs.spread;
  if (!editor.commands.toggleOrderedList() || was) return;
  const s = editor.state;
  const list = listAt(s);
  if (!list || list.node.type.name !== 'orderedList') return;
  const tr = s.tr;
  if (before && spread != null && list.node.attrs.spread !== spread) tr.setNodeMarkup(list.pos, undefined, { ...list.node.attrs, spread });
  list.node.forEach((child, off) => {
    if (child.type.name === 'listItem' && child.attrs.checked != null) tr.setNodeMarkup(list.pos + 1 + off, undefined, { ...child.attrs, checked: null });
  });
  if (tr.docChanged) editor.view.dispatch(tr);
}

function cycleHeading(editor: Editor) {
  const next = nextHeading(headingLevel(editor.state));
  if (next === 0) editor.commands.setParagraph();
  else editor.commands.setHeading({ level: next as 1 | 2 | 3 });
}

/** 高亮按钮：已经在高亮里 → 交给外面弹色板；空光标带着高亮（接下来打的字）→ 去掉；别的 → 加黄色。 */
function toggleHighlight(editor: Editor): FormatResult {
  const state = editor.state;
  const target = highlightTarget(state);
  if (target) return { kind: 'palette', range: target };
  editor.view.dispatch(setHighlightTr(state, highlightAt(state) ? null : DEFAULT_HIGHLIGHT));
  return { kind: 'done' };
}

/** 在光标处打一个 @（前面紧挨着字母数字就先补个空格，不然不算 @ 提及）；返回 @ 的位置。 */
export function insertAt(editor: Editor): number | null {
  const view = editor.view;
  const { to } = view.state.selection;
  const $to = view.state.doc.resolve(to);
  if (!$to.parent.inlineContent || $to.parent.type.spec.code) return null;
  const before = view.state.doc.textBetween(Math.max($to.start(), to - 1), to, '', '\ufffc');
  const text = /[A-Za-z0-9_]$/.test(before) ? ' @' : '@';
  view.dispatch(view.state.tr.insertText(text, to, to).scrollIntoView());
  return to + text.length - 1;
}

/**
 * 点了一个按钮。组字中、灰掉的按钮什么都不做（skip）。
 * 格式在这里改好（done）；链接、@、高亮色板交给外面（见 FormatResult）。
 */
export function runFormat(editor: Editor, id: FormatButtonId, opts: { mention: boolean; composing?: boolean }): FormatResult {
  if (editor.isDestroyed || isComposing(editor, opts.composing)) return { kind: 'skip' };
  const st = formatBarState(editor, opts).buttons[id];
  if (!st || st.disabled) return { kind: 'skip' };
  const c = editor.commands;
  switch (id) {
    case 'task':
      toggleTask(editor);
      break;
    case 'bullet':
      toggleBullet(editor);
      break;
    case 'ordered':
      toggleOrdered(editor);
      break;
    case 'heading':
      cycleHeading(editor);
      break;
    case 'bold':
      c.toggleBold();
      break;
    case 'highlight':
      return toggleHighlight(editor);
    case 'quote':
      c.toggleBlockquote();
      break;
    case 'code':
      c.toggleCode();
      break;
    case 'link':
      return { kind: 'link' };
    case 'mention': {
      const at = insertAt(editor);
      return at == null ? { kind: 'skip' } : { kind: 'mention', at };
    }
    case 'indent':
      c.sinkListItem('listItem');
      break;
    case 'outdent':
      c.liftListItem('listItem');
      break;
    case 'up':
    case 'down': {
      const tr = moveBlockTr(editor.state, id);
      if (tr) editor.view.dispatch(tr);
      break;
    }
    case 'undo':
      c.undo();
      break;
  }
  return { kind: 'done' };
}
