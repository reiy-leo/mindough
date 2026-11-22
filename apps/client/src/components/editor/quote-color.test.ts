// @vitest-environment happy-dom
/** 引用块换颜色（Rei 2026-11-22）：markdown 往返、不该认的不认、换色一步撤销、点竖条、只读显示。 */
import { describe, expect, it, vi } from 'vitest';
import { undo } from '@tiptap/pm/history';
import type { EditorView } from '@tiptap/pm/view';
import { createMdEditor, roundTrip, type MdEditorOptions } from './editor';
import { barHitZone, inBar, quoteColorOf, type QuoteHit } from './quote-color';
import { markdownHtml } from '../../lib/markdown';

const setup = (md: string, extra: Partial<MdEditorOptions> = {}) => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const h = createMdEditor({ root, value: md, placeholder: '', label: 'x', onChange: () => {}, ...extra });
  return { h, view: h.view(), root, md: () => h.getMarkdown().trim(), done: () => (h.destroy(), root.remove()) };
};
/** 文档里每个引用块：位置和颜色。 */
const quotes = (view: EditorView) => {
  const out: { pos: number; color: string | null }[] = [];
  view.state.doc.descendants((n, pos) => {
    if (n.type.name === 'blockquote') out.push({ pos, color: n.attrs.color ?? null });
  });
  return out;
};

describe('引用块颜色：markdown 往返', () => {
  it('默认引用照旧是 > ，没有注释', () => {
    expect(roundTrip('> 一句话\n')).toBe('> 一句话\n');
  });

  it('带颜色的引用第一行是颜色注释，往返不变', () => {
    for (const md of [
      '> <!-- color: red -->\n> 一句话\n',
      '> <!-- color: blue -->\n> **粗体** 和 `代码`，[链接](https://example.com)\n>\n> 第二段\n',
      '> <!-- color: green -->\n> - 列表一\n> - 列表二\n',
      '> <!-- color: purple -->\n> ## 标题\n>\n> 正文 ==高亮== 和 <mark data-color="red">红</mark>\n',
    ])
      expect(roundTrip(md)).toBe(md);
  });

  it('嵌套引用各管各的颜色', () => {
    const md = '> <!-- color: yellow -->\n> 外层\n>\n> > <!-- color: pink -->\n> > 里层\n';
    expect(roundTrip(md)).toBe(md);
    const a = setup(md);
    expect(quotes(a.view).map((q) => q.color)).toEqual(['yellow', 'pink']);
    a.done();
  });

  it('写法宽松也认：空格、大小写、等号；写回统一成 <!-- color: red -->', () => {
    expect(roundTrip('> <!--color:RED-->\n> 字\n')).toBe('> <!-- color: red -->\n> 字\n');
    expect(roundTrip('> <!-- color = gray -->\n> 字\n')).toBe('> <!-- color: gray -->\n> 字\n');
  });

  it('不认的不动：不认识的颜色、别的注释、不在第一行、不在引用里', () => {
    for (const md of ['> <!-- color: teal -->\n> 字\n', '> <!-- 备注 -->\n> 字\n', '> 字\n>\n> <!-- color: red -->\n', '<!-- color: red -->\n\n段落\n']) {
      const a = setup(md);
      expect(quotes(a.view).every((q) => q.color == null)).toBe(true);
      a.done();
    }
  });

  it('只有注释的引用读成一个带颜色的空引用', () => {
    const a = setup('> <!-- color: red -->\n');
    expect(quotes(a.view)).toEqual([{ pos: 0, color: 'red' }]);
    a.done();
  });

  it('提示块、折叠块不受影响', () => {
    for (const md of ['> [!NOTE]\n> 提示\n', '<details>\n<summary>标题</summary>\n\n正文\n\n</details>\n']) expect(roundTrip(md)).toBe(md);
  });

  it('颜色名只认九色', () => {
    expect(quoteColorOf('Red')).toBe('red');
    expect(quoteColorOf('teal')).toBeNull();
    expect(quoteColorOf(null)).toBeNull();
  });
});

describe('引用块颜色：换色', () => {
  it('换色、换回默认，各是一步撤销', () => {
    const a = setup('> 一句话\n\n后面\n');
    const pos = quotes(a.view)[0]!.pos;
    a.h.recolorQuote(pos, 'orange');
    expect(a.md()).toBe('> <!-- color: orange -->\n> 一句话\n\n后面');
    a.h.recolorQuote(pos, 'blue');
    expect(a.md()).toBe('> <!-- color: blue -->\n> 一句话\n\n后面');
    undo(a.view.state, a.view.dispatch);
    expect(a.md()).toBe('> <!-- color: orange -->\n> 一句话\n\n后面');
    a.h.recolorQuote(pos, null);
    expect(a.md()).toBe('> 一句话\n\n后面');
    undo(a.view.state, a.view.dispatch);
    expect(a.md()).toBe('> <!-- color: orange -->\n> 一句话\n\n后面');
    a.done();
  });

  it('位置不是引用块、颜色没变：什么都不做', () => {
    const a = setup('段落\n\n> 引用\n');
    const before = a.view.state.doc;
    a.h.recolorQuote(0, 'red');
    a.h.recolorQuote(quotes(a.view)[0]!.pos, null);
    expect(a.view.state.doc).toBe(before);
    a.done();
  });

  it('编辑器里画成 data-color', () => {
    const a = setup('> <!-- color: green -->\n> 字\n');
    expect(a.view.dom.querySelector('blockquote')?.getAttribute('data-color')).toBe('green');
    a.done();
  });
});

describe('引用块颜色：点竖条', () => {
  it('点击区：电脑往外 4 往里 12，手机往外 12 往里 16', () => {
    expect(barHitZone(false)).toEqual({ out: 4, inside: 12 });
    expect(barHitZone(true)).toEqual({ out: 12, inside: 16 });
    expect(inBar(100, 100, false)).toBe(true);
    expect(inBar(112, 100, false)).toBe(true);
    expect(inBar(113, 100, false)).toBe(false);
    expect(inBar(95, 100, false)).toBe(false);
    expect(inBar(88, 100, true)).toBe(true);
    expect(inBar(116, 100, true)).toBe(true);
  });

  const press = (a: ReturnType<typeof setup>, el: Element, clientX: number) => {
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX, clientY: 20 });
    el.dispatchEvent(ev);
    return ev;
  };

  it('点竖条报上引用块的位置和颜色、不挪光标；点字不报', () => {
    const hits: QuoteHit[] = [];
    const a = setup('段落\n\n> <!-- color: red -->\n> 引用的字\n', { onQuoteBarClick: (h) => hits.push(h) });
    const bq = a.view.dom.querySelector('blockquote')!;
    vi.spyOn(bq, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 10, right: 400, bottom: 40, width: 300, height: 30, x: 100, y: 10, toJSON: () => ({}) } as DOMRect);
    const sel = a.view.state.selection.from;
    const ev = press(a, bq, 104);
    expect(ev.defaultPrevented).toBe(true);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.pos).toBe(quotes(a.view)[0]!.pos);
    expect(hits[0]!.color).toBe('red');
    expect(a.view.state.selection.from).toBe(sel);
    // 点在字上（离左边远）不算
    press(a, bq.querySelector('p')!, 200);
    expect(hits).toHaveLength(1);
    a.done();
  });

  it('只读时点竖条不报', () => {
    const hits: QuoteHit[] = [];
    const a = setup('> 字\n', { onQuoteBarClick: (h) => hits.push(h), readOnly: true });
    const bq = a.view.dom.querySelector('blockquote')!;
    vi.spyOn(bq, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 10, right: 400, bottom: 40, width: 300, height: 30, x: 100, y: 10, toJSON: () => ({}) } as DOMRect);
    press(a, bq, 104);
    expect(hits).toHaveLength(0);
    a.done();
  });
});

describe('引用块颜色：只读显示', () => {
  it('带颜色的引用画成 data-color，注释不出现；默认引用照旧', () => {
    const html = markdownHtml('> <!-- color: blue -->\n> **一句** 话\n');
    expect(html).toContain('<blockquote data-color="blue">');
    expect(html).toContain('<strong>一句</strong>');
    expect(html).not.toContain('color: blue');
    expect(markdownHtml('> 字\n')).toBe('<blockquote>\n<p>字</p>\n</blockquote>\n');
  });

  it('不认识的颜色不加 data-color', () => {
    expect(markdownHtml('> <!-- color: teal -->\n> 字\n')).not.toContain('data-color');
  });
});
