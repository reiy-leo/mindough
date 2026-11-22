// @vitest-environment happy-dom
/**
 * 方向键跳出表格（Rei 2026-11-22「最后一行，按 ↓，光标横过来了，应该是竖着的」）。见 block-exit.ts。
 * happy-dom 量不了排版：view.endOfTextblock 换成「一格只有一行」，↓ / ↑ 在格子里都算到头。
 */
import { describe, expect, it } from 'vitest';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import { GapCursor } from '@tiptap/pm/gapcursor';
import { undo } from '@tiptap/pm/history';
import type { EditorView } from '@tiptap/pm/view';
import { createMdEditor, type MdEditorOptions } from './editor';

const setup = (md: string, extra: Partial<MdEditorOptions> = {}) => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const changes: string[] = [];
  const h = createMdEditor({ root, value: md, placeholder: '', label: 'x', onChange: (m) => changes.push(m), ...extra });
  const view = h.view();
  view.endOfTextblock = (dir) => {
    const { $head } = view.state.selection;
    if (dir === 'right') return $head.parentOffset === $head.parent.content.size;
    if (dir === 'left') return $head.parentOffset === 0;
    return true;
  };
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
/** 光标放进含 text 的那段，atStart 放开头，不然放末尾。 */
const into = (view: EditorView, text: string, atStart = false) => {
  let at = -1;
  view.state.doc.descendants((n, pos) => {
    if (at < 0 && n.isText && n.text === text) at = atStart ? pos : pos + n.nodeSize;
  });
  if (at < 0) throw new Error(`没找到 ${text}`);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
};
const type = (view: EditorView, text: string) => {
  const { from, to } = view.state.selection;
  view.dispatch(view.state.tr.insertText(text, from, to));
};
const last = (c: string[]) => c[c.length - 1];
const names = (view: EditorView) => {
  const out: string[] = [];
  view.state.doc.forEach((n) => out.push(n.type.name + (n.type.name === 'paragraph' ? `(${n.textContent})` : '')));
  return out;
};
const T = '| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |';

describe('表格在最后：↓ / → 跳出来', () => {
  it('最后一行第一格按 ↓：表格后插空段落，竖光标进去，打字接在表格后面', () => {
    const { view, changes, done } = setup(`前面\n\n${T}\n`);
    into(view, '3');
    expect(key(view, 'ArrowDown')).toBe(true);
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$head.parent.type.name).toBe('paragraph');
    expect(view.state.selection.$head.depth).toBe(1);
    expect(names(view)).toEqual(['paragraph(前面)', 'table', 'paragraph()']);
    // 空段落在最后，写回没有变化，不调 onChange
    expect(changes).toEqual([]);
    type(view, 'x');
    expect(last(changes)).toBe(`前面\n\n${T}\n\nx\n`);
    done();
  });

  it('最后一行最后一格按 ↓ 也一样', () => {
    const { view, done } = setup(`${T}\n`);
    into(view, '4');
    expect(key(view, 'ArrowDown')).toBe(true);
    expect(names(view)).toEqual(['table', 'paragraph()']);
    done();
  });

  it('最后一格末尾按 →：插空段落；不在末尾、不是最后一格的 → 不管', () => {
    const { view, done } = setup(`${T}\n`);
    into(view, '3');
    key(view, 'ArrowRight');
    expect(names(view)).toEqual(['table']);
    into(view, '4', true);
    key(view, 'ArrowRight');
    expect(names(view)).toEqual(['table']);
    into(view, '4');
    expect(key(view, 'ArrowRight')).toBe(true);
    expect(names(view)).toEqual(['table', 'paragraph()']);
    done();
  });

  it('不是最后一行按 ↓：不插（照表格原来的走到下一行）', () => {
    const { view, done } = setup(`${T}\n`);
    into(view, '1');
    key(view, 'ArrowDown');
    expect(names(view)).toEqual(['table']);
    done();
  });

  it('表格后面已经有段落：不插，照原来的跳过去', () => {
    const { view, done } = setup(`${T}\n\n后面\n`);
    into(view, '3');
    key(view, 'ArrowDown');
    expect(names(view)).toEqual(['table', 'paragraph(后面)']);
    done();
  });

  it('一次撤销撤掉插的段落，光标回表格', () => {
    const { view, done } = setup(`${T}\n`);
    into(view, '3');
    key(view, 'ArrowDown');
    undo(view.state, view.dispatch);
    expect(names(view)).toEqual(['table']);
    expect(view.state.selection.$head.parent.textContent).toBe('3');
    done();
  });

  it('Shift / ⌥ / Ctrl / ⌘ 加 ↓ 不插', () => {
    for (const mods of [{ shiftKey: true }, { metaKey: true }]) {
      const { view, done } = setup(`${T}\n`);
      into(view, '3');
      key(view, 'ArrowDown', mods);
      expect(names(view)).toEqual(['table']);
      done();
    }
  });

  it('⌥↓ / Ctrl+↓ 还是挪表格行：最后一行往下不动、也不插段落', () => {
    for (const mods of [{ altKey: true }, { ctrlKey: true }]) {
      const { view, done } = setup(`${T}\n`);
      into(view, '3');
      key(view, 'ArrowDown', mods);
      expect(names(view)).toEqual(['table']);
      done();
    }
  });

  it('回车、Shift+回车照旧加行加列', () => {
    const { view, changes, done } = setup(`${T}\n`);
    into(view, '4');
    key(view, 'Enter');
    type(view, 'r');
    expect(last(changes)).toContain('| r |');
    key(view, 'Enter', { shiftKey: true });
    expect(names(view)).toEqual(['table']);
    done();
  });

  it('多格选区、输入法组字、只读：不管', () => {
    {
      const { view, done } = setup(`${T}\n`);
      const cells: number[] = [];
      view.state.doc.descendants((n, pos) => {
        if (n.type.spec.tableRole === 'cell') cells.push(pos);
      });
      view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc, cells[0]!, cells[cells.length - 1]!)));
      key(view, 'ArrowDown');
      expect(names(view)).toEqual(['table']);
      done();
    }
    {
      const { view, done } = setup(`${T}\n`);
      into(view, '3');
      key(view, 'ArrowDown', { isComposing: true });
      expect(names(view)).toEqual(['table']);
      done();
    }
    {
      const { view, done } = setup(`${T}\n`, { readOnly: true });
      into(view, '3');
      key(view, 'ArrowDown');
      expect(names(view)).toEqual(['table']);
      done();
    }
  });
});

describe('表格在最前：↑ / ← 跳出来（日记、备注；任务第一行是标题，碰不到）', () => {
  it('第一行（表头）按 ↑：表格前插空段落；空着不写回，打了字才写', () => {
    const { view, changes, done } = setup(`${T}\n\n后面\n`);
    into(view, 'b');
    expect(key(view, 'ArrowUp')).toBe(true);
    expect(names(view)).toEqual(['paragraph()', 'table', 'paragraph(后面)']);
    expect(view.state.selection.$head.depth).toBe(1);
    expect(changes).toEqual([]);
    expect(view.state.doc.firstChild?.content.size).toBe(0);
    // 别处改了字：写回里也没有 <br />
    into(view, '后面');
    type(view, '！');
    expect(last(changes)).toBe(`${T}\n\n后面！\n`);
    // 回到空段落打字：照常写
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    type(view, '前');
    expect(last(changes)).toBe(`前\n\n${T}\n\n后面！\n`);
    done();
  });

  it('第一格开头按 ←：插空段落；不在开头不管', () => {
    const { view, done } = setup(`${T}\n\n后面\n`);
    into(view, 'a');
    expect(key(view, 'ArrowLeft')).toBe(false);
    into(view, 'a', true);
    expect(key(view, 'ArrowLeft')).toBe(true);
    expect(names(view)[0]).toBe('paragraph()');
    done();
  });

  it('任务正文（第一行是标题）：表格前面是标题，↑ 不插', () => {
    const { view, done } = setup(`标题\n\n${T}\n`, { plainTitle: true });
    into(view, 'a');
    key(view, 'ArrowUp');
    expect(names(view)).toEqual(['paragraph(标题)', 'table']);
    done();
  });
});

describe('别的块', () => {
  it('表格后面是分割线、再没有字：↓ 在表格和分割线之间插段落，空着不写回', () => {
    const { view, changes, done } = setup(`${T}\n\n---\n`);
    into(view, '3');
    expect(key(view, 'ArrowDown')).toBe(true);
    expect(names(view)).toEqual(['table', 'paragraph()', 'horizontalRule']);
    expect(changes).toEqual([]);
    done();
  });

  it('选中最后的分割线按 ↓：后面插段落', () => {
    const { view, done } = setup('前面\n\n---\n');
    let hr = -1;
    view.state.doc.forEach((n, pos) => {
      if (n.type.name === 'horizontalRule') hr = pos;
    });
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, hr)));
    expect(key(view, 'ArrowDown')).toBe(true);
    expect(names(view)).toEqual(['paragraph(前面)', 'horizontalRule', 'paragraph()']);
    done();
  });

  it('引用、列表最后一段按 ↓：不插（本来就没有空隙光标）', () => {
    for (const md of ['> 引用\n', '- 列表\n']) {
      const { view, done } = setup(md);
      into(view, md.includes('引用') ? '引用' : '列表');
      expect(key(view, 'ArrowDown')).toBe(false);
      expect(view.state.doc.childCount).toBe(1);
      done();
    }
  });

  it('表格在引用里、引用在最后：↓ 插在引用后面', () => {
    const { view, done } = setup(`> ${T.split('\n').join('\n> ')}\n`);
    into(view, '3');
    expect(key(view, 'ArrowDown')).toBe(true);
    expect(names(view)).toEqual(['blockquote', 'paragraph()']);
    done();
  });

  it('空隙光标本身按方向键：不管', () => {
    const { view, done } = setup(`${T}\n`);
    view.dispatch(view.state.tr.setSelection(new GapCursor(view.state.doc.resolve(view.state.doc.content.size))));
    expect(key(view, 'ArrowRight')).toBe(false);
    done();
  });
});
