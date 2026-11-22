/**
 * Ctrl+↑ / Ctrl+↓（Mac 是 ⌥↑ / ⌥↓）上下移动当前行（Rei 2026-11-20「任务+日期编辑器中 Ctrl+上下箭头移动当前行」，12:36 Mac 改 Option）。
 * 所有系统都是 Ctrl，不是 ⌘。任务正文、新建面板、日记输入框、资料备注都是这个编辑器，都能用。
 *
 * 挪的是哪一块：
 * - 在列表里：光标所在的列表项，连同它下面缩进的子项，只在同一个列表的兄弟之间挪。
 * - 不在列表里：光标所在的顶层块（段落、标题、引用、代码块、表格、折叠块、提示块……），光标在引用、表格、折叠块里面也是整块挪。
 * - 选区跨了好几块：这几块一起挪。选区跨出列表时按顶层块算（整个列表和别的块一起挪）。
 * - 和上一个 / 下一个兄弟换位置；到头了不动（按键照样吃掉，光标不跳）。
 * - 光标、选区跟着挪；一次移动是一步撤销（不和前面打的字合成一步）。
 * - 任务正文开着纯文字标题（title.ts）时，第一行标题不动，别的块也不能挪到它上面。
 * - 输入法组字时不管；只读的编辑器不管。
 *
 * 表格数据行（Rei 2026-11-22「opt + 上下箭头 也可以移动表格的数据行」，见 tableRowMove）：
 * - 光标在表格的数据行里：同一个键改成把这一行和上一行 / 下一行对调，光标跟着走，还在同一列同一位置。
 * - 选了几格跨几行（格子选区，或文字选区从一格拖到另一格）：这几行一起挪。
 * - 最上一条数据行再往上、最下一行再往下：不动，按键照样吃掉，不把整个表格挪走；数据行挪不到表头上面。
 * - 表头不参与（代定）：光标或选区碰到表头那行，还是整个表格一起挪。
 */
import { Extension } from '@tiptap/core';
import { Fragment, type Node as PMNode, type NodeRange } from '@tiptap/pm/model';
import { Plugin, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { CellSelection } from '@tiptap/pm/tables';
import type { EditorView } from '@tiptap/pm/view';
import { titleMode } from './title';
import { isAppleKeyboard } from './shortcuts';

export type MoveDir = 'up' | 'down';

const isList = (n: PMNode) => n.type.name === 'bulletList' || n.type.name === 'orderedList';

/** 要挪的那几块：父节点是列表（挪列表项）或者文档（挪顶层块）。 */
export function movableRange(state: EditorState): NodeRange | null {
  const { $from, $to } = state.selection;
  return $from.blockRange($to, (n) => isList(n) || n.type.name === 'doc');
}

/** 选区整体挪 delta：文字、整块、表格格子、空隙光标都按 JSON 平移；读不回来就放在附近。 */
function shiftSelection(tr: Transaction, sel: Selection, delta: number): Selection {
  const json = sel.toJSON() as Record<string, unknown>;
  for (const k of ['anchor', 'head', 'pos']) if (typeof json[k] === 'number') json[k] = (json[k] as number) + delta;
  try {
    return Selection.fromJSON(tr.doc, json);
  } catch {
    return TextSelection.near(tr.doc.resolve(Math.max(0, Math.min(tr.doc.content.size, sel.head + delta))));
  }
}

/** 光标 / 选区在哪个表格的哪几行；两头不在同一个表格里返回 null。 */
function tableRows(state: EditorState): { table: PMNode; start: number; top: number; bottom: number } | null {
  // 格子选区的 $from / $to / $anchor / $head 都只是其中一格，两头那两格要看 $anchorCell / $headCell
  const sel = state.selection;
  const [$a, $h] = sel instanceof CellSelection ? [sel.$anchorCell, sel.$headCell] : [sel.$anchor, sel.$head];
  for (let d = $a.depth; d > 0; d--) {
    if ($a.node(d).type.spec.tableRole !== 'table') continue;
    if ($h.depth < d || $h.before(d) !== $a.before(d)) return null;
    if ($a.depth <= d || $h.depth <= d) return null;
    const [x, y] = [$a.index(d), $h.index(d)];
    return { table: $a.node(d), start: $a.start(d), top: Math.min(x, y), bottom: Math.max(x, y) };
  }
  return null;
}

const isHeaderRow = (row: PMNode) => row.childCount > 0 && row.firstChild!.type.spec.tableRole === 'header_cell';

/**
 * 表格数据行上移 / 下移（Rei 2026-11-22）。
 * 不归它管（不在表格里、碰到表头）返回 null，按原来的整块挪；到头了返回 'stuck'（吃掉按键、不动）。
 */
export function tableRowMoveTr(state: EditorState, dir: MoveDir): Transaction | 'stuck' | null {
  const at = tableRows(state);
  if (!at) return null;
  const { table, start, top, bottom } = at;
  for (let i = top; i <= bottom; i++) if (isHeaderRow(table.child(i))) return null;
  let rowPos = start;
  for (let i = 0; i < top; i++) rowPos += table.child(i).nodeSize;
  const moved: PMNode[] = [];
  let end = rowPos;
  for (let i = top; i <= bottom; i++) {
    moved.push(table.child(i));
    end += table.child(i).nodeSize;
  }
  let from: number;
  let to: number;
  let content: PMNode[];
  let delta: number;
  if (dir === 'up') {
    const sib = top > 0 ? table.child(top - 1) : null;
    if (!sib || isHeaderRow(sib)) return 'stuck';
    from = rowPos - sib.nodeSize;
    to = end;
    content = [...moved, sib];
    delta = -sib.nodeSize;
  } else {
    if (bottom + 1 >= table.childCount) return 'stuck';
    const sib = table.child(bottom + 1);
    from = rowPos;
    to = end + sib.nodeSize;
    content = [sib, ...moved];
    delta = sib.nodeSize;
  }
  const tr = state.tr.replaceWith(from, to, Fragment.fromArray(content));
  tr.setSelection(shiftSelection(tr, state.selection, delta));
  return closeHistory(tr).scrollIntoView();
}

/**
 * 上移 / 下移的那一步；挪不动（到头、碰到标题、没有能挪的块）返回 null。
 * 一次 replaceWith 把「兄弟 + 这几块」整段换成换好顺序的样子，所以是一步。
 */
export function moveBlockTr(state: EditorState, dir: MoveDir): Transaction | null {
  const range = movableRange(state);
  if (!range) return null;
  const parent = range.parent;
  const { startIndex, endIndex } = range;
  if (startIndex >= endIndex) return null;
  // 纯文字标题：第一块不动，别的块也不能挪到第一块上面
  const atTop = parent.type.name === 'doc' && titleMode(state);
  if (atTop && startIndex === 0) return null;
  const moved: PMNode[] = [];
  for (let i = startIndex; i < endIndex; i++) moved.push(parent.child(i));
  let from: number;
  let to: number;
  let content: PMNode[];
  let delta: number;
  if (dir === 'up') {
    if (startIndex === 0 || (atTop && startIndex === 1)) return null;
    const sib = parent.child(startIndex - 1);
    from = range.start - sib.nodeSize;
    to = range.end;
    content = [...moved, sib];
    delta = -sib.nodeSize;
  } else {
    if (endIndex >= parent.childCount) return null;
    const sib = parent.child(endIndex);
    from = range.start;
    to = range.end + sib.nodeSize;
    content = [sib, ...moved];
    delta = sib.nodeSize;
  }
  const tr = state.tr.replaceWith(from, to, Fragment.fromArray(content));
  tr.setSelection(shiftSelection(tr, state.selection, delta));
  return closeHistory(tr).scrollIntoView();
}

/** 键盘事件是不是移动行的键：Mac 只按 ⌥（Rei 2026-11-20 12:36「mac上的快捷键换成option+↑↓」，⌃↑↓ 被调度中心占着），别的系统只按 Ctrl；是就返回方向。 */
export function moveKeyDir(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, mac = isAppleKeyboard()): MoveDir | null {
  const ok = mac ? e.altKey && !e.ctrlKey : e.ctrlKey && !e.altKey;
  if (!ok || e.metaKey || e.shiftKey) return null;
  return e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down' : null;
}

const composing = (view: EditorView, e: KeyboardEvent) => e.isComposing || e.keyCode === 229 || view.composing;

/** 挂键的扩展。优先级 1700：低于输入法守卫（2000）和纯文字标题（1800），高于列表、表格自带的方向键处理。 */
export function moveBlockExtension() {
  return Extension.create({
    name: 'mindoughMoveBlock',
    priority: 1700,
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            handleKeyDown(view, event) {
              const dir = moveKeyDir(event);
              if (!dir || !view.editable || composing(view, event)) return false;
              // 刚用方向键挪的光标，ProseMirror 可能还没从 DOM 读进来：先读一下
              (view as unknown as { domObserver?: { flush?: () => void } }).domObserver?.flush?.();
              event.preventDefault();
              const row = tableRowMoveTr(view.state, dir);
              const tr = row === 'stuck' ? null : (row ?? moveBlockTr(view.state, dir));
              if (tr) view.dispatch(tr);
              return true;
            },
          },
        }),
      ];
    },
  });
}
