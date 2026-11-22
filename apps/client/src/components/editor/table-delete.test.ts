// @vitest-environment happy-dom
/**
 * 表格里退格删空行、Shift+退格删空列（Rei 2026-11-22 21:04「任务编辑器中 怎么删除空行 空列？」，见 table-delete.ts）。
 */
import { describe, expect, it } from 'vitest';
import { TextSelection } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import { undo } from '@tiptap/pm/history';
import type { EditorView } from '@tiptap/pm/view';
import { createMdEditor, type MdEditorOptions } from './editor';

const setup = (md: string, extra: Partial<MdEditorOptions> = {}) => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const changes: string[] = [];
  const h = createMdEditor({ root, value: md, placeholder: '', label: 'x', onChange: (m) => changes.push(m), ...extra });
  const view = h.view();
  const done = () => {
    h.destroy();
    root.remove();
  };
  return { h, view, changes, done };
};
const key = (view: EditorView, k: string, mods: KeyboardEventInit = {}) => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods });
  view.dom.dispatchEvent(ev);
  return ev.defaultPrevented;
};
const bs = (view: EditorView, mods: KeyboardEventInit = {}) => key(view, 'Backspace', mods);
const sbs = (view: EditorView) => key(view, 'Backspace', { shiftKey: true });
/** 第 r 行第 c 列格子的位置（表格是第 n 块）。 */
const cellPos = (view: EditorView, r: number, c: number, block = 0) => {
  const doc = view.state.doc;
  let pos = 0;
  for (let i = 0; i < block; i++) pos += doc.child(i).nodeSize;
  const table = doc.child(block);
  pos += 1;
  for (let i = 0; i < r; i++) pos += table.child(i).nodeSize;
  pos += 1;
  for (let i = 0; i < c; i++) pos += table.child(r).child(i).nodeSize;
  return pos;
};
/** 光标放进第 r 行第 c 列（格子开头）。 */
const at = (view: EditorView, r: number, c: number, block = 0) => {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cellPos(view, r, c, block) + 2)));
};
/** 光标在第几行第几列、格子里的偏移。 */
const where = (view: EditorView) => {
  const $f = view.state.selection.$from;
  let d = $f.depth;
  while (d > 0 && !/^table(Cell|Header)$/.test($f.node(d).type.name)) d--;
  if (!d) return null;
  return { row: $f.index(d - 2), col: $f.index(d - 1), offset: $f.parentOffset, text: $f.parent.textContent };
};
const type = (view: EditorView, text: string) => {
  const { from, to } = view.state.selection;
  view.dispatch(view.state.tr.insertText(text, from, to));
};
const last = (c: string[]) => c[c.length - 1];
/** 写回的表格去掉格子里补齐用的空格和分隔行补齐用的横线，只比内容和对齐。 */
const cells = (md: string | undefined) => (md ?? '').trim().split('\n').map((l) => l.split('|').map((x) => x.trim().replace(/^(:?)-+(:?)$/, '$1-$2')).join('|'));

// 第 2 行（数据第 2 行）全空，第 1 列（b）只有表头有字
const T = '| a | b |\n| - | - |\n| 1 | 2 |\n|   |   |\n| 3 | 4 |';

describe('退格删空行', () => {
  it('整行都空：删掉这一行，光标去上一行同一列的末尾', () => {
    const { view, changes, done } = setup(T);
    at(view, 2, 1);
    expect(bs(view)).toBe(true);
    expect(cells(last(changes))).toEqual(cells('| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |'));
    expect(where(view)).toEqual({ row: 1, col: 1, offset: 1, text: '2' });
    done();
  });

  it('删的是第一行数据：光标去下一行（格子开头）', () => {
    const { view, changes, done } = setup('| a | b |\n| - | - |\n|   |   |\n| 3 | 4 |');
    at(view, 1, 0);
    bs(view);
    expect(cells(last(changes))).toEqual(cells('| a | b |\n| - | - |\n| 3 | 4 |'));
    expect(where(view)).toEqual({ row: 1, col: 0, offset: 0, text: '3' });
    done();
  });

  it('删完没数据行了：光标停在表头同一列', () => {
    const { view, changes, done } = setup('| a | b |\n| - | - |\n|   |   |');
    at(view, 1, 1);
    bs(view);
    expect(cells(last(changes))).toEqual(cells('| a | b |\n| - | - |'));
    expect(where(view)).toEqual({ row: 0, col: 1, offset: 1, text: 'b' });
    done();
  });

  it('这一行还有字：不删，退格照常', () => {
    const { view, changes, done } = setup('| a | b |\n| - | - |\n|   | 2 |');
    at(view, 1, 0);
    expect(bs(view)).toBe(false);
    expect(changes).toEqual([]);
    done();
  });

  it('格子里有字：退格照常删字', () => {
    const { view, changes, done } = setup(T);
    at(view, 1, 0);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cellPos(view, 1, 0) + 3)));
    expect(bs(view)).toBe(false);
    expect(changes).toEqual([]);
    done();
  });

  it('表头行不删（表头空着、下面还有数据行）', () => {
    const { view, changes, done } = setup('|   |   |\n| - | - |\n| 1 | 2 |');
    at(view, 0, 0);
    expect(bs(view)).toBe(false);
    expect(changes).toEqual([]);
    done();
  });

  it('只剩表头、表头全空：整张表删掉，换成空段落', () => {
    const { view, changes, done } = setup('前\n\n|   |   |\n| - | - |\n\n后');
    at(view, 0, 1, 1);
    expect(bs(view)).toBe(true);
    expect(view.state.doc.child(1).type.name).toBe('paragraph');
    expect(view.state.doc.child(1).content.size).toBe(0);
    expect(view.state.selection.$from.parent).toBe(view.state.doc.child(1));
    expect(last(changes)!.includes('|')).toBe(false);
    done();
  });

  it('只剩表头、表头有字：不删', () => {
    const { view, changes, done } = setup('| a |   |\n| - | - |');
    at(view, 0, 1);
    expect(bs(view)).toBe(false);
    expect(changes).toEqual([]);
    done();
  });

  it('一次撤销整行回来', () => {
    const { view, changes, done } = setup(T);
    at(view, 2, 0);
    bs(view);
    undo(view.state, view.dispatch);
    expect(cells(last(changes))).toEqual(cells(T));
    done();
  });

  it('CellSelection 选了两行都空：一起删', () => {
    const { view, changes, done } = setup('| a | b |\n| - | - |\n| 1 | 2 |\n|   |   |\n|   |   |\n| 3 | 4 |');
    view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc, cellPos(view, 2, 0), cellPos(view, 3, 1))));
    expect(bs(view)).toBe(true);
    expect(cells(last(changes))).toEqual(cells('| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |'));
    expect(where(view)).toEqual({ row: 1, col: 0, offset: 1, text: '1' });
    done();
  });

  it('CellSelection 选的行有字：不删行，照常清空格子', () => {
    const { view, changes, done } = setup(T);
    view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc, cellPos(view, 1, 0), cellPos(view, 2, 1))));
    bs(view);
    expect(cells(last(changes))).toEqual(cells('| a | b |\n| - | - |\n|   |   |\n|   |   |\n| 3 | 4 |'));
    done();
  });
});

describe('Shift+退格删空列', () => {
  const C = '| a |   | c |\n| :-: | - | --: |\n| 1 |   | 3 |\n| 4 |   | 6 |';

  it('整列（连表头）都空：删掉这一列，光标去左边一列同一行的末尾；别的列对齐不变', () => {
    const { view, changes, done } = setup(C);
    at(view, 2, 1);
    expect(sbs(view)).toBe(true);
    expect(cells(last(changes))).toEqual(cells('| a | c |\n| :-: | -: |\n| 1 | 3 |\n| 4 | 6 |'));
    expect(where(view)).toEqual({ row: 2, col: 0, offset: 1, text: '4' });
    done();
  });

  it('删的是最左一列：光标去右边（格子开头）', () => {
    const { view, changes, done } = setup('|   | b |\n| - | - |\n|   | 2 |');
    at(view, 1, 0);
    sbs(view);
    expect(cells(last(changes))).toEqual(cells('| b |\n| - |\n| 2 |'));
    expect(where(view)).toEqual({ row: 1, col: 0, offset: 0, text: '2' });
    done();
  });

  it('在表头格里也能删', () => {
    const { view, changes, done } = setup(C);
    at(view, 0, 1);
    sbs(view);
    expect(cells(last(changes))).toEqual(cells('| a | c |\n| :-: | -: |\n| 1 | 3 |\n| 4 | 6 |'));
    expect(where(view)).toEqual({ row: 0, col: 0, offset: 1, text: 'a' });
    done();
  });

  it('表头有字：不删', () => {
    const { view, changes, done } = setup(T);
    at(view, 2, 1);
    expect(sbs(view)).toBe(false);
    expect(changes).toEqual([]);
    done();
  });

  it('只剩一列：不删', () => {
    const { view, changes, done } = setup('|   |\n| - |\n|   |');
    at(view, 1, 0);
    expect(sbs(view)).toBe(false);
    expect(changes).toEqual([]);
    done();
  });

  it('CellSelection 选了两列都空：一起删；一次撤销都回来', () => {
    const md = '| a |   |   | d |\n| - | - | - | - |\n| 1 |   |   | 4 |';
    const { view, changes, done } = setup(md);
    view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc, cellPos(view, 0, 1), cellPos(view, 1, 2))));
    expect(sbs(view)).toBe(true);
    expect(cells(last(changes))).toEqual(cells('| a | d |\n| - | - |\n| 1 | 4 |'));
    undo(view.state, view.dispatch);
    expect(cells(last(changes))).toEqual(cells(md));
    done();
  });
});

describe('别的退格不受影响', () => {
  it('输入法组字、⌘ / Ctrl / Alt 加退格：不删', () => {
    const { view, changes, done } = setup(T);
    at(view, 2, 0);
    bs(view, { isComposing: true });
    bs(view, { metaKey: true });
    bs(view, { ctrlKey: true });
    bs(view, { altKey: true });
    expect(view.state.doc.firstChild!.childCount).toBe(4);
    expect(changes).toEqual([]);
    done();
  });

  it('只读不动', () => {
    const { view, changes, done } = setup(T, { readOnly: true });
    at(view, 2, 0);
    expect(bs(view)).toBe(false);
    expect(changes).toEqual([]);
    done();
  });

  it('删完还能接着打字', () => {
    const { view, changes, done } = setup(T);
    at(view, 2, 0);
    bs(view);
    type(view, 'x');
    expect(cells(last(changes))).toEqual(cells('| a | b |\n| - | - |\n| 1x | 2 |\n| 3 | 4 |'));
    done();
  });
});
