/**
 * 表格里删空行、空列（Rei 2026-11-22 21:04「任务编辑器中 怎么删除空行 空列？」，21:05 同意方案）。
 * 和 extensions.ts tableKeys（回车加行、Shift+回车加列）对称：
 * - 退格：光标所在的数据行每格都空，删掉这一行。光标去上一行同一列（格子末尾）；删的是第一行数据就去下一行（格子开头）；没有数据行了就停在表头。
 * - Shift+退格：光标所在的列每格（连表头）都空，删掉这一列。光标去左边一列同一行（格子末尾）；删的是最左一列就去右边（格子开头）。只剩一列不删。
 * - 有字（或别的内容，比如 @ 提及、换行）的格子不算空，这时退格照常删字。
 * - 表头那行不删；但表格只剩表头、表头每格都空时，退格删掉整张表，换成一个空段落（代定）。
 * - 选了好几格（CellSelection）：选中的那几行（不算表头）/ 那几列每格都空，就一起删；不全空就照常清空选中的格子。
 * - 一次删除一个事务，一次撤销就回来。输入法组字时不管；⌘ / Ctrl / Alt 加退格不管。
 */
import { CellSelection, isInTable, removeColumn, removeRow, selectedRect, TableMap, type TableRect } from '@tiptap/pm/tables';
import type { Node as PMNode } from '@tiptap/pm/model';
import { TextSelection, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

/** 空格子：只有一个空段落（没有字、没有提及、没有换行）。 */
export function isEmptyCell(cell: PMNode | null | undefined): boolean {
  if (!cell) return false;
  const first = cell.firstChild;
  return cell.childCount === 1 && !!first && first.isTextblock && first.content.size === 0;
}

const cellAt = (rect: TableRect, row: number, col: number) => rect.table.nodeAt(rect.map.map[row * rect.map.width + col]!);

const rowEmpty = (rect: TableRect, row: number) => {
  for (let c = 0; c < rect.map.width; c++) if (!isEmptyCell(cellAt(rect, row, c))) return false;
  return true;
};

const colEmpty = (rect: TableRect, col: number) => {
  for (let r = 0; r < rect.map.height; r++) if (!isEmptyCell(cellAt(rect, r, col))) return false;
  return true;
};

/** 删完以后重新量表格（removeRow / removeColumn 要用最新的 table 和 map）。 */
const refresh = (tr: Transaction, rect: TableRect): TableRect => {
  const table = tr.doc.nodeAt(rect.tableStart - 1)!;
  return { ...rect, table, map: TableMap.get(table) };
};

/** 光标放进第 row 行第 col 列的格子：atEnd 放末尾，不然放开头。 */
const putCursor = (tr: Transaction, rect: TableRect, row: number, col: number, atEnd: boolean) => {
  const pos = rect.tableStart + rect.map.map[row * rect.map.width + col]!;
  const cell = tr.doc.nodeAt(pos)!;
  const inside = atEnd ? pos + cell.nodeSize - 1 : pos + 1;
  tr.setSelection(TextSelection.near(tr.doc.resolve(inside), atEnd ? -1 : 1));
};

/** 光标 / 选区落在哪些行、哪些列；只认空光标和 CellSelection。 */
function target(view: EditorView): TableRect | null {
  const { state } = view;
  const sel = state.selection;
  if (sel instanceof CellSelection) return selectedRect(state);
  if (!(sel instanceof TextSelection) || !sel.empty) return null;
  const rect = selectedRect(state);
  // 光标得在空格子里（有字时退格照常删字）
  if (!isEmptyCell(cellAt(rect, rect.top, rect.left))) return null;
  return rect;
}

function deleteRows(view: EditorView, rect: TableRect): boolean {
  const { map } = rect;
  // 表头不删：选区里去掉第 0 行
  const top = Math.max(rect.top, 1);
  const bottom = rect.bottom;
  if (top >= bottom) {
    // 只剩表头、表头全空：整张表换成空段落
    if (map.height === 1 && rect.top === 0 && rowEmpty(rect, 0)) return deleteTable(view, rect);
    return false;
  }
  for (let r = top; r < bottom; r++) if (!rowEmpty(rect, r)) return false;
  const tr = view.state.tr;
  let cur = rect;
  for (let r = bottom - 1; r >= top; r--) {
    removeRow(tr, cur, r);
    cur = refresh(tr, cur);
  }
  // 上一行有数据就去上一行；删的是第一行数据，下面还有就去下一行；都没有就回表头
  let row: number;
  let atEnd: boolean;
  if (top - 1 >= 1) [row, atEnd] = [top - 1, true];
  else if (cur.map.height > 1) [row, atEnd] = [1, false];
  else [row, atEnd] = [0, true];
  putCursor(tr, cur, row, rect.left, atEnd);
  view.dispatch(tr.scrollIntoView());
  return true;
}

function deleteCols(view: EditorView, rect: TableRect): boolean {
  const { map } = rect;
  // 只剩一列（或要把列全删光）不删
  if (rect.right - rect.left >= map.width) return false;
  for (let c = rect.left; c < rect.right; c++) if (!colEmpty(rect, c)) return false;
  const tr = view.state.tr;
  let cur = rect;
  for (let c = rect.right - 1; c >= rect.left; c--) {
    removeColumn(tr, cur, c);
    cur = refresh(tr, cur);
  }
  const [col, atEnd] = rect.left > 0 ? [rect.left - 1, true] : [0, false];
  putCursor(tr, cur, rect.top, col, atEnd);
  view.dispatch(tr.scrollIntoView());
  return true;
}

function deleteTable(view: EditorView, rect: TableRect): boolean {
  const { state } = view;
  const para = state.schema.nodes.paragraph;
  if (!para) return false;
  const from = rect.tableStart - 1;
  const tr = state.tr.replaceWith(from, from + rect.table.nodeSize, para.create());
  tr.setSelection(TextSelection.create(tr.doc, from + 1));
  view.dispatch(tr.scrollIntoView());
  return true;
}

/** 退格删空行、Shift+退格删空列；处理了返回 true（并拦下按键）。 */
export function tableDeleteKeys(view: EditorView, event: KeyboardEvent): boolean {
  if (event.key !== 'Backspace' || event.metaKey || event.ctrlKey || event.altKey || event.isComposing || event.keyCode === 229 || view.composing) return false;
  if (!view.editable || !isInTable(view.state)) return false;
  const rect = target(view);
  if (!rect) return false;
  const done = event.shiftKey ? deleteCols(view, rect) : deleteRows(view, rect);
  if (done) event.preventDefault();
  return done;
}
