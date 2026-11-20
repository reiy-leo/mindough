// @vitest-environment happy-dom
/** 高亮（Rei 2026-11-20 12:15 / 12:16）：markdown 往返、不该认的不认、输入规则、⌘⇧H、点高亮换颜色、第一行标题、只读显示。 */
import { describe, expect, it, vi } from 'vitest';
import { TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { createMdEditor, roundTrip, type MdEditorOptions } from './editor';
import { escapeEquals, highlightRangeAt, type HighlightRange } from './highlight';
import { renderMarkdown } from '../../lib/markdown';

const setup = (md: string, extra: Partial<MdEditorOptions> = {}) => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const changes: string[] = [];
  const h = createMdEditor({ root, value: md, placeholder: '', label: 'x', onChange: (m) => changes.push(m), ...extra });
  return { h, view: h.view(), root, changes, md: () => h.getMarkdown().trim(), done: () => (h.destroy(), root.remove()) };
};
/** 带高亮的字和颜色。 */
const marks = (view: EditorView) => {
  const out: string[] = [];
  view.state.doc.descendants((n) => {
    const m = n.marks.find((x) => x.type.name === 'highlight');
    if (n.isText && m) out.push(`${m.attrs.color}:${n.text}`);
  });
  return out;
};
const type = (view: EditorView, text: string) => {
  for (const ch of text) {
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
};
const select = (view: EditorView, text: string) => {
  let at = -1;
  view.state.doc.descendants((n, pos) => {
    if (at < 0 && n.isText && n.text!.includes(text)) at = pos + n.text!.indexOf(text);
  });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at, at + text.length)));
};
const key = (view: EditorView, init: KeyboardEventInit) => {
  const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  view.dom.dispatchEvent(ev);
  return ev.defaultPrevented;
};
const cmdShiftH = { key: 'H', code: 'KeyH', metaKey: true, shiftKey: true };

describe('markdown 往返', () => {
  it('==字== 是黄色，<mark data-color> 是别的颜色，写回不变', () => {
    for (const md of ['重点 ==这句== 看', '==**粗**和字==', '<mark data-color="red">红的</mark>和 ==黄的==', '- ==清单里==', '==[链接里](https://a.com)==', '# 标题 <mark data-color="blue">蓝</mark>'])
      expect(roundTrip(md).trim(), md).toBe(md);
    // 链接里整段高亮：高亮写在链接外面（和下划线一样放最外层），意思不变，再读再写也不变
    expect(roundTrip('[==链接里==](https://a.com)').trim()).toBe('==[链接里](https://a.com)==');
    const a = setup('<mark data-color="green">绿</mark> ==黄==');
    expect(marks(a.view)).toEqual(['green:绿', 'yellow:黄']);
    expect(a.changes).toEqual([]);
    a.done();
  });

  it('<mark> 不带颜色、颜色不认识的读成黄色', () => {
    const a = setup('<mark>甲</mark> <mark data-color="teal">乙</mark>');
    expect(marks(a.view)).toEqual(['yellow:甲', 'yellow:乙']);
    a.done();
  });

  it('不该认的不认：空白贴着、三个等号、转义、行内代码、代码块', () => {
    for (const md of ['a == b == c', '中 ===三个=== 间', '\\=\\=转义\\=\\=', '`==代码==`', '```\n==代码块==\n```']) {
      const a = setup(md);
      expect(marks(a.view), md).toEqual([]);
      expect(a.md(), md).toBe(md);
      a.done();
    }
  });

  it('写出时文字里像高亮记号的 == 加反斜杠，读回来还是字', () => {
    expect(escapeEquals('a==b')).toBe('a\\=\\=b');
    expect(escapeEquals('a == b')).toBe('a == b');
    expect(escapeEquals('a === b')).toBe('a === b');
    const a = setup('');
    a.view.dispatch(a.view.state.tr.insertText('x==y==z', 1));
    expect(a.md()).toBe('x\\=\\=y\\=\\=z');
    expect(roundTrip(a.md()).trim()).toBe('x\\=\\=y\\=\\=z');
    a.done();
  });
});

describe('输入', () => {
  it('手打 ==字== 当场变黄色高亮，记号去掉', () => {
    const a = setup('');
    type(a.view, '看 ==重点==');
    expect(marks(a.view)).toEqual(['yellow:重点']);
    expect(a.md()).toBe('看 ==重点==');
    a.done();
  });

  it('⌘⇧H / Ctrl+Shift+H 切换黄色高亮：选了字改选中的，再按去掉', () => {
    const a = setup('一句话');
    select(a.view, '一句');
    expect(key(a.view, cmdShiftH)).toBe(true);
    expect(marks(a.view)).toEqual(['yellow:一句']);
    key(a.view, { ...cmdShiftH, metaKey: false, ctrlKey: true });
    expect(marks(a.view)).toEqual([]);
    a.done();
  });

  it('没选字：接下来打的字带高亮', () => {
    const a = setup('甲');
    a.view.dispatch(a.view.state.tr.setSelection(TextSelection.atEnd(a.view.state.doc)));
    key(a.view, cmdShiftH);
    type(a.view, '乙');
    expect(marks(a.view)).toEqual(['yellow:乙']);
    a.done();
  });

  it('组字时不管', () => {
    const a = setup('一句话');
    select(a.view, '一句');
    expect(key(a.view, { ...cmdShiftH, isComposing: true })).toBe(false);
    expect(marks(a.view)).toEqual([]);
    a.done();
  });

  it('任务第一行纯文字标题：手打 ==字== 不变、⌘⇧H 不起作用，存的时候转义', () => {
    const a = setup('', { plainTitle: true });
    type(a.view, '==标题==');
    expect(marks(a.view)).toEqual([]);
    select(a.view, '标题');
    key(a.view, cmdShiftH);
    expect(marks(a.view)).toEqual([]);
    expect(a.md()).toBe('\\=\\=标题\\=\\=');
    a.done();
  });
});

describe('点高亮换颜色', () => {
  it('点 <mark>：报出整段和颜色；换色、去掉', () => {
    const onHighlightClick = vi.fn<(r: HighlightRange) => void>();
    const a = setup('前 ==一**段**高亮== 后', { onHighlightClick });
    const mark = a.root.querySelector('mark') as HTMLElement;
    expect(mark).toBeTruthy();
    const at = a.view.posAtDOM(mark, 0);
    a.view.someProp('handleClick', (f) => f(a.view, at + 1, { button: 0, target: mark } as unknown as MouseEvent));
    expect(onHighlightClick).toHaveBeenCalledTimes(1);
    const r = onHighlightClick.mock.calls[0]![0];
    expect(a.view.state.doc.textBetween(r.from, r.to)).toBe('一段高亮');
    expect(r.color).toBe('yellow');
    a.h.recolorHighlight(r, 'red');
    expect(a.md()).toBe('前 <mark data-color="red">一**段**高亮</mark> 后');
    a.h.recolorHighlight(highlightRangeAt(a.view.state.doc, r.from + 1)!, null);
    expect(a.md()).toBe('前 一**段**高亮 后');
    a.done();
  });

  it('只读时点了不弹', () => {
    const onHighlightClick = vi.fn();
    const a = setup('==字==', { onHighlightClick, readOnly: true });
    const mark = a.root.querySelector('mark') as HTMLElement;
    a.view.someProp('handleClick', (f) => f(a.view, 2, { button: 0, target: mark } as unknown as MouseEvent));
    expect(onHighlightClick).not.toHaveBeenCalled();
    a.done();
  });
});

describe('只读 Markdown', () => {
  it('==字== 画成黄色 mark，<mark data-color> 原样留着，转义的不算', () => {
    expect(renderMarkdown('看 ==重点==')).toContain('<mark class="md-highlight" data-color="yellow">重点</mark>');
    expect(renderMarkdown('<mark data-color="red">红</mark>')).toContain('<mark data-color="red">红</mark>');
    expect(renderMarkdown('\\=\\=字\\=\\=')).not.toContain('<mark');
    expect(renderMarkdown('`==码==`')).not.toContain('<mark');
  });
});
