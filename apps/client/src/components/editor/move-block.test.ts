// @vitest-environment happy-dom
/** Ctrl+↑ / Ctrl+↓（Mac ⌥↑↓）上下移动当前行（Rei 2026-11-20）：顶层块、列表项连子项、多块选区、到头不动、光标跟着走、一步撤销、标题不动、组字不管。 */
import { describe, expect, it } from 'vitest';
import { TextSelection } from '@tiptap/pm/state';
import { undo } from '@tiptap/pm/history';
import type { EditorView } from '@tiptap/pm/view';
import { createMdEditor, type MdEditorOptions } from './editor';
import { moveKeyDir } from './move-block';

const setup = (md: string, extra: Partial<MdEditorOptions> = {}) => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const h = createMdEditor({ root, value: md, placeholder: '', label: 'x', onChange: () => {}, ...extra });
  const view = h.view();
  return { h, view, md: () => h.getMarkdown().trim(), done: () => (h.destroy(), root.remove()) };
};
const key = (view: EditorView, k: string, mods: KeyboardEventInit & { keyCode?: number } = { ctrlKey: true }) => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods });
  if (mods.keyCode != null) Object.defineProperty(ev, 'keyCode', { get: () => mods.keyCode });
  view.dom.dispatchEvent(ev);
  return ev.defaultPrevented;
};
const up = (view: EditorView) => key(view, 'ArrowUp');
const down = (view: EditorView) => key(view, 'ArrowDown');
/** 光标放到某段文字里（第 n 个字后面）。 */
const caretIn = (view: EditorView, text: string, offset = 1) => {
  let pos = -1;
  view.state.doc.descendants((n, p) => {
    if (pos < 0 && n.isText && n.text!.includes(text)) pos = p + n.text!.indexOf(text) + offset;
  });
  if (pos < 0) throw new Error(`没找到 ${text}`);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
  return pos;
};
/** 顶层块：类型名 + 文字。 */
const blocks = (view: EditorView) => {
  const out: string[] = [];
  view.state.doc.forEach((n) => out.push(`${n.type.name}:${n.textContent}`));
  return out;
};
const caretText = (view: EditorView) => {
  const { $from } = view.state.selection;
  return $from.parent.textContent.slice(0, $from.parentOffset);
};

describe('按键识别', () => {
  it('别的系统只认 Ctrl+↑ / Ctrl+↓，带别的修饰键不算', () => {
    const k = (key: string, m: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>>) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...m });
    expect(moveKeyDir(k('ArrowUp', { ctrlKey: true }), false)).toBe('up');
    expect(moveKeyDir(k('ArrowDown', { ctrlKey: true }), false)).toBe('down');
    expect(moveKeyDir(k('ArrowUp', { metaKey: true }), false)).toBeNull();
    expect(moveKeyDir(k('ArrowUp', { altKey: true }), false)).toBeNull();
    expect(moveKeyDir(k('ArrowUp', { ctrlKey: true, shiftKey: true }), false)).toBeNull();
    expect(moveKeyDir(k('ArrowUp', { ctrlKey: true, altKey: true }), false)).toBeNull();
    expect(moveKeyDir(k('ArrowLeft', { ctrlKey: true }), false)).toBeNull();
  });
  it('Mac 只认 ⌥↑ / ⌥↓，⌃↑↓ 不算', () => {
    const k = (key: string, m: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>>) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...m });
    expect(moveKeyDir(k('ArrowUp', { altKey: true }), true)).toBe('up');
    expect(moveKeyDir(k('ArrowDown', { altKey: true }), true)).toBe('down');
    expect(moveKeyDir(k('ArrowUp', { ctrlKey: true }), true)).toBeNull();
    expect(moveKeyDir(k('ArrowUp', { altKey: true, shiftKey: true }), true)).toBeNull();
    expect(moveKeyDir(k('ArrowUp', { altKey: true, metaKey: true }), true)).toBeNull();
  });
});

describe('顶层块', () => {
  it('段落、标题、代码块、表格、引用换位置，光标跟着走', () => {
    const a = setup('一\n\n# 二\n\n三');
    caretIn(a.view, '三');
    expect(up(a.view)).toBe(true);
    expect(a.md()).toBe('一\n\n三\n\n# 二');
    expect(caretText(a.view)).toBe('三');
    up(a.view);
    expect(a.md()).toBe('三\n\n一\n\n# 二');
    expect(caretText(a.view)).toBe('三');
    down(a.view);
    down(a.view);
    expect(a.md()).toBe('一\n\n# 二\n\n三');
    a.done();

    const b = setup('甲\n\n```js\nx = 1\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n> 引用');
    caretIn(b.view, '引用');
    up(b.view);
    expect(blocks(b.view)).toEqual(['paragraph:甲', 'codeBlock:x = 1', 'blockquote:引用', 'table:ab12']);
    // 光标在表格格子里：整个表格挪
    caretIn(b.view, '2', 0);
    up(b.view);
    expect(blocks(b.view)).toEqual(['paragraph:甲', 'codeBlock:x = 1', 'table:ab12', 'blockquote:引用']);
    // 光标在代码块里：整块挪
    caretIn(b.view, 'x = 1');
    up(b.view);
    expect(blocks(b.view)).toEqual(['codeBlock:x = 1', 'paragraph:甲', 'table:ab12', 'blockquote:引用']);
    expect(caretText(b.view)).toBe('x');
    b.done();
  });

  it('到头不动，按键照样吃掉', () => {
    const a = setup('一\n\n二');
    caretIn(a.view, '一');
    expect(up(a.view)).toBe(true);
    expect(a.md()).toBe('一\n\n二');
    caretIn(a.view, '二');
    expect(down(a.view)).toBe(true);
    expect(a.md()).toBe('一\n\n二');
    a.done();
  });

  it('选区跨几块：一起挪，选区跟着走', () => {
    const a = setup('一\n\n二\n\n三\n\n四');
    const from = caretIn(a.view, '二', 0);
    const to = caretIn(a.view, '三', 1);
    a.view.dispatch(a.view.state.tr.setSelection(TextSelection.create(a.view.state.doc, from, to)));
    up(a.view);
    expect(a.md()).toBe('二\n\n三\n\n一\n\n四');
    expect(a.view.state.doc.textBetween(a.view.state.selection.from, a.view.state.selection.to, '|')).toBe('二|三');
    down(a.view);
    down(a.view);
    expect(a.md()).toBe('一\n\n四\n\n二\n\n三');
    a.done();
  });
});

describe('列表', () => {
  it('列表项连同子项一起挪，只在兄弟间挪，到头不动', () => {
    const a = setup('- 甲\n- 乙\n  - 乙一\n  - 乙二\n- 丙');
    caretIn(a.view, '乙', 1);
    up(a.view);
    expect(a.md()).toBe('- 乙\n  - 乙一\n  - 乙二\n- 甲\n- 丙');
    expect(caretText(a.view)).toBe('乙');
    up(a.view);
    expect(a.md()).toBe('- 乙\n  - 乙一\n  - 乙二\n- 甲\n- 丙');
    a.done();
  });

  it('子项只在自己那层挪，不跑出父项', () => {
    const a = setup('- 甲\n  - 甲一\n  - 甲二\n- 乙');
    caretIn(a.view, '甲二');
    up(a.view);
    expect(a.md()).toBe('- 甲\n  - 甲二\n  - 甲一\n- 乙');
    up(a.view);
    expect(a.md()).toBe('- 甲\n  - 甲二\n  - 甲一\n- 乙');
    caretIn(a.view, '甲一');
    down(a.view);
    expect(a.md()).toBe('- 甲\n  - 甲二\n  - 甲一\n- 乙');
    a.done();
  });

  it('清单项、编号列表也一样', () => {
    const a = setup('- [ ] 买菜\n- [x] 做饭');
    caretIn(a.view, '做饭');
    up(a.view);
    expect(a.md()).toBe('- [x] 做饭\n- [ ] 买菜');
    a.done();
    const b = setup('1. 一\n2. 二');
    caretIn(b.view, '一');
    down(b.view);
    expect(b.md()).toBe('1. 二\n2. 一');
    b.done();
  });

  it('选区跨出列表：按顶层块整段挪', () => {
    const a = setup('甲\n\n- 一\n- 二\n\n乙');
    const from = caretIn(a.view, '二', 0);
    const to = caretIn(a.view, '乙', 1);
    a.view.dispatch(a.view.state.tr.setSelection(TextSelection.create(a.view.state.doc, from, to)));
    up(a.view);
    expect(a.md()).toBe('- 一\n- 二\n\n乙\n\n甲');
    a.done();
  });
});

describe('撤销、标题、组字、只读', () => {
  it('一次移动是一步撤销，不和前面打的字合在一起', () => {
    const a = setup('一\n\n二');
    caretIn(a.view, '二');
    a.view.dispatch(a.view.state.tr.insertText('x'));
    up(a.view);
    expect(a.md()).toBe('二x\n\n一');
    undo(a.view.state, a.view.dispatch);
    expect(a.md()).toBe('一\n\n二x');
    a.done();
  });

  it('纯文字标题：第一行不动，别的块也挪不到它上面', () => {
    const a = setup('标题\n\n一\n\n二', { plainTitle: true });
    caretIn(a.view, '标题');
    expect(down(a.view)).toBe(true);
    expect(a.md()).toBe('标题\n\n一\n\n二');
    caretIn(a.view, '一');
    up(a.view);
    expect(a.md()).toBe('标题\n\n一\n\n二');
    caretIn(a.view, '二');
    up(a.view);
    expect(a.md()).toBe('标题\n\n二\n\n一');
    // 选区从标题跨到正文：不动
    a.view.dispatch(a.view.state.tr.setSelection(TextSelection.create(a.view.state.doc, 1, a.view.state.doc.content.size - 1)));
    down(a.view);
    expect(a.md()).toBe('标题\n\n二\n\n一');
    a.done();
  });

  it('没开纯文字标题（日记）：第一行也能挪', () => {
    const a = setup('一\n\n二');
    caretIn(a.view, '二');
    up(a.view);
    expect(a.md()).toBe('二\n\n一');
    a.done();
  });

  it('组字时、只读时不管', () => {
    const a = setup('一\n\n二');
    caretIn(a.view, '二');
    expect(key(a.view, 'ArrowUp', { ctrlKey: true, isComposing: true })).toBe(false);
    expect(key(a.view, 'ArrowUp', { ctrlKey: true, keyCode: 229 })).toBe(false);
    expect(a.md()).toBe('一\n\n二');
    a.done();
    const b = setup('一\n\n二', { readOnly: true });
    caretIn(b.view, '二');
    expect(up(b.view)).toBe(false);
    expect(b.md()).toBe('一\n\n二');
    b.done();
  });
});
