// @vitest-environment happy-dom
/**
 * 表格里回车加行、Shift+回车加列（Rei 2026-11-22「在任何单元格 回车 下方添加一行空行；shift+回车 右侧添加一列空列」）。
 */
import { describe, expect, it } from 'vitest';
import { TextSelection } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
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
/** 光标放进第 n 个（从 0 数）含 text 的格子末尾。 */
const into = (view: EditorView, text: string) => {
  let at = -1;
  view.state.doc.descendants((n, pos) => {
    if (at < 0 && n.isText && n.text === text) at = pos + n.nodeSize;
  });
  if (at < 0) throw new Error(`没找到 ${text}`);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
};
const type = (view: EditorView, text: string) => {
  const { from, to } = view.state.selection;
  view.dispatch(view.state.tr.insertText(text, from, to));
};
const last = (c: string[]) => c[c.length - 1];
/** 写回的表格去掉格子里补齐用的空格，只比内容和分隔行。 */
const cells = (md: string | undefined) => (md ?? '').split('\n').map((l) => l.split('|').map((x) => x.trim()).join('|'));
const T = '| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |';

describe('表格回车加一行', () => {
  it('数据格回车：下面加一行空行，光标进新行同一列', () => {
    const { view, changes, done } = setup(T);
    into(view, '2');
    expect(key(view, 'Enter')).toBe(true);
    type(view, 'x');
    expect(last(changes)).toBe('| a | b |\n| - | - |\n| 1 | 2 |\n|   | x |\n| 3 | 4 |\n');
    done();
  });

  it('表头回车：插在表头下面，成为第一行数据', () => {
    const { view, changes, done } = setup(T);
    into(view, 'a');
    key(view, 'Enter');
    type(view, 'y');
    expect(last(changes)).toBe('| a | b |\n| - | - |\n| y |   |\n| 1 | 2 |\n| 3 | 4 |\n');
    done();
  });

  it('最后一行回车：加在表格末尾；空行写回也是合法表格', () => {
    const { view, changes, done } = setup(T);
    into(view, '4');
    key(view, 'Enter');
    expect(last(changes)).toBe('| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n|   |   |\n');
    done();
  });

  it('新行跟着这一列的对齐', () => {
    const { view, changes, done } = setup('| a | b |\n| :-: | --: |\n| 1 | 2 |');
    into(view, '1');
    key(view, 'Enter');
    type(view, 'z');
    expect(cells(last(changes))).toEqual(cells('| a | b |\n| :-: | -: |\n| 1 | 2 |\n| z |   |\n'));
    const row = view.state.doc.firstChild!.child(2);
    expect(row.child(0).attrs.align).toBe('center');
    expect(row.child(1).attrs.align).toBe('right');
    done();
  });

  it('选了几格：插在选区最下面一行下面，光标进选区最左一列', () => {
    const { view, changes, done } = setup(T);
    const table = view.state.doc.firstChild!;
    // 1 那格到 4 那格（两行两列）
    const cellPos = (r: number, c: number) => {
      let pos = 1;
      for (let i = 0; i < r; i++) pos += table.child(i).nodeSize;
      pos += 1;
      for (let i = 0; i < c; i++) pos += table.child(r).child(i).nodeSize;
      return pos;
    };
    view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc, cellPos(1, 0), cellPos(2, 1))));
    key(view, 'Enter');
    type(view, 'w');
    expect(last(changes)).toBe('| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n| w |   |\n');
    done();
  });
});

describe('表格 Shift+回车加一列', () => {
  it('右边加一列空列，光标进当前行的新格；新列不设对齐', () => {
    const { view, changes, done } = setup('| a | b |\n| :-: | - |\n| 1 | 2 |');
    into(view, '1');
    expect(key(view, 'Enter', { shiftKey: true })).toBe(true);
    type(view, 'q');
    expect(cells(last(changes))).toEqual(cells('| a |   | b |\n| :-: | - | - |\n| 1 | q | 2 |\n'));
    done();
  });

  it('表头格 Shift+回车：新列表头是空的，光标在新表头格', () => {
    const { view, changes, done } = setup(T);
    into(view, 'b');
    key(view, 'Enter', { shiftKey: true });
    type(view, 'c');
    expect(last(changes)).toBe('| a | b | c |\n| - | - | - |\n| 1 | 2 |   |\n| 3 | 4 |   |\n');
    done();
  });
});

describe('别的回车不受影响', () => {
  it('⌘ / Ctrl+回车在表格里照样交给 onModEnter，不加行', () => {
    let sent = 0;
    const { view, changes, done } = setup(T, { onModEnter: () => sent++ });
    into(view, '2');
    key(view, 'Enter', { metaKey: true });
    key(view, 'Enter', { ctrlKey: true });
    expect(sent).toBe(2);
    expect(changes).toEqual([]);
    done();
  });

  it('输入法组字的回车不加行', () => {
    const { view, changes, done } = setup(T);
    into(view, '2');
    key(view, 'Enter', { isComposing: true });
    expect(changes).toEqual([]);
    done();
  });

  it('表格外的回车、Shift+回车照旧', () => {
    const { view, changes, done } = setup('段落\n\n' + T);
    into(view, '段落');
    key(view, 'Enter', { shiftKey: true });
    type(view, '续');
    expect(last(changes)!.startsWith('段落\\\n续\n\n| a | b |')).toBe(true);
    done();
  });

  it('只读不动', () => {
    const { view, changes, done } = setup(T, { readOnly: true });
    into(view, '2');
    expect(key(view, 'Enter')).toBe(false);
    expect(key(view, 'Enter', { shiftKey: true })).toBe(false);
    expect(changes).toEqual([]);
    done();
  });
});
