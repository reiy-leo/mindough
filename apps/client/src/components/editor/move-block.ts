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
 */
import { Extension } from '@tiptap/core';
import { Fragment, type Node as PMNode, type NodeRange } from '@tiptap/pm/model';
import { Plugin, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
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
              const tr = moveBlockTr(view.state, dir);
              if (tr) view.dispatch(tr);
              return true;
            },
          },
        }),
      ];
    },
  });
}
