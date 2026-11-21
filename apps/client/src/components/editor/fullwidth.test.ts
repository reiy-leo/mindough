// @vitest-environment happy-dom
/**
 * 全角写法（Rei 2026-11-21 方案 B）：中文输入法不切英文，行首打「》 」「》》 」「【】 」「1。 」「··· 」也变格式。
 * 每条都测：变了、存的是标准 markdown、退格变回原字、正文中间不变、第一行标题不变；另外测代码块里、组字中不变。
 */
import { describe, expect, it } from 'vitest';
import { TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { createMdEditor, type MdEditorOptions } from './editor';

const setup = (md: string, extra: Partial<MdEditorOptions> = {}) => {
  const root = document.createElement('div');
  root.className = 'md-editor-root';
  document.body.appendChild(root);
  const h = createMdEditor({ root, value: md, placeholder: '', label: 'x', onChange: () => {}, ...extra });
  const view = h.view();
  view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
  const done = () => {
    h.destroy();
    root.remove();
  };
  return { h, view, done };
};
const type = (view: EditorView, text: string) => {
  for (const ch of text) {
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
};
const key = (view: EditorView, k: string) => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  view.dom.dispatchEvent(ev);
  return ev.defaultPrevented;
};
const comp = (el: HTMLElement, t: string) => el.dispatchEvent(new CompositionEvent(t, { bubbles: true, data: '' }));
const md = (h: { getMarkdown(): string }) => h.getMarkdown().trim();
const names = (view: EditorView) => {
  const out: string[] = [];
  view.state.doc.descendants((n) => {
    if (!n.isText) out.push(n.type.name);
  });
  return out;
};

/** 每条规则：打的字、变成的块（names 里要有）、接着打「字」后存的 markdown。 */
const cases: [string, string, string][] = [
  ['》 ', 'blockquote', '> 字'],
  ['》》 ', 'details', '<details>\n<summary>字</summary>\n\n</details>'],
  ['【】 ', 'listItem', '- [ ] 字'],
  ['【 】 ', 'listItem', '- [ ] 字'],
  ['1。 ', 'orderedList', '1. 字'],
  ['3。 ', 'orderedList', '3. 字'],
  ['··· ', 'codeBlock', '```\n字\n```'],
];

describe('全角写法：行首打完再打空格', () => {
  it.each(cases)('「%s」', (s, block, out) => {
    const { h, view, done } = setup('');
    type(view, s);
    expect(names(view)).toContain(block);
    type(view, '字');
    expect(md(h)).toBe(out);
    done();
  });

  it('清单：「【】」在中间（输入法自动补的「】」）、光标停在「【」后面打空格，也变清单，「】」去掉', () => {
    const { h, view, done } = setup('');
    type(view, '【】');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2))); // 「【|】」
    type(view, ' ');
    type(view, '买菜');
    expect(md(h)).toBe('- [ ] 买菜');
    done();
  });

  it('清单：「【 】」光标在空格后、「】」前，打空格也算', () => {
    const { h, view, done } = setup('');
    type(view, '【 】');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3))); // 「【 |】」
    type(view, ' ');
    type(view, 'a');
    expect(md(h)).toBe('- [ ] a');
    done();
  });

  it('清单：只有「【」后面没有「】」，空格就是空格', () => {
    const { h, view, done } = setup('');
    type(view, '【 ');
    expect(names(view)).not.toContain('listItem');
    expect(md(h)).toBe('【');
    done();
  });

  it('清单：已经在普通列表项开头打「【】 」，这一项变清单（同 `- [ ] `）', () => {
    const { h, view, done } = setup('');
    type(view, '- 【】 a');
    expect(md(h)).toBe('- [ ] a');
    done();
  });

  it('清单：列表项里「【|】」打空格也算', () => {
    const { h, view, done } = setup('');
    type(view, '- 【】');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.selection.from - 1)));
    type(view, ' a');
    expect(md(h)).toBe('- [ ] a');
    done();
  });

  it('编号列表：接在「2. 」列表后面打「3。 」并进同一个列表', () => {
    const { h, view, done } = setup('1. 一\n2. 二');
    key(view, 'Enter');
    key(view, 'Enter'); // 空项回车出列表
    type(view, '3。 三');
    expect(md(h)).toBe('1. 一\n2. 二\n3. 三');
    done();
  });

  it('代码块：「···js 」带语言', () => {
    const { h, view, done } = setup('');
    type(view, '···js ');
    type(view, 'x');
    expect(md(h)).toBe('```js\nx\n```');
    done();
  });

  it('折叠块：「》》 」后面的字当标题（同 `>> `）', () => {
    const { h, view, done } = setup('标题');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    type(view, '》》 ');
    expect(names(view)).toContain('details');
    expect(md(h)).toBe('<details>\n<summary>标题</summary>\n\n</details>');
    done();
  });

  it('折叠块：「》 」变成空引用后再打「》 」变折叠块，不嵌套引用', () => {
    const { view, done } = setup('');
    type(view, '》 》 ');
    expect(names(view)).toContain('details');
    expect(names(view)).not.toContain('blockquote');
    done();
  });

  it('折叠块：`> ` 的空引用里打「》 」、「》 」的空引用里打 `> ` 都变折叠块', () => {
    for (const s of ['> 》 ', '》 > ']) {
      const { view, done } = setup('');
      type(view, s);
      expect(names(view), s).toContain('details');
      done();
    }
  });

  it('引用里已经有字，下一行开头打「》 」是嵌套引用（同 `> `）', () => {
    const { h, view, done } = setup('> a');
    key(view, 'Enter');
    type(view, '》 b');
    expect(md(h)).toBe('> a\n>\n> > b');
    done();
  });
});

describe('退格：变回原来的字', () => {
  it.each(cases.map(([s]) => s))('「%s」', (s) => {
    const { h, view, done } = setup('');
    type(view, s);
    expect(key(view, 'Backspace')).toBe(true);
    expect(names(view)).toEqual(['paragraph']);
    expect(view.state.doc.textContent).toBe(s);
    done();
    void h;
  });

  it('「【|】」打空格变清单后退格：变回「【 】」', () => {
    const { view, done } = setup('');
    type(view, '【】');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    type(view, ' ');
    expect(names(view)).toContain('listItem');
    expect(key(view, 'Backspace')).toBe(true);
    expect(names(view)).toEqual(['paragraph']);
    expect(view.state.doc.textContent).toBe('【 】');
    done();
  });
});

describe('不该变的地方', () => {
  it.each(cases.map(([s]) => s))('正文中间「字%s」不变', (s) => {
    const { h, view, done } = setup('');
    type(view, `字${s}`);
    expect(names(view)).toEqual(['paragraph']);
    expect(view.state.doc.textContent).toBe(`字${s}`);
    done();
    void h;
  });

  it.each(cases.map(([s]) => s))('任务第一行（纯文字标题）「%s」不变', (s) => {
    const { view, done } = setup('', { plainTitle: true });
    type(view, s);
    expect(names(view)).toEqual(['paragraph']);
    expect(view.state.doc.textContent).toBe(s);
    done();
  });

  it.each(cases.map(([s]) => s))('任务第二行「%s」照常变', (s) => {
    const { view, done } = setup('标题', { plainTitle: true });
    key(view, 'Enter');
    type(view, s);
    expect(names(view)).not.toEqual(['paragraph', 'paragraph']);
    done();
  });

  it.each(cases.map(([s]) => s))('代码块里「%s」不变', (s) => {
    const { view, done } = setup('```\nx\n```');
    // 光标在代码块里 x 后面，另起一行
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    type(view, '\n');
    type(view, s);
    expect(names(view)).toEqual(['codeBlock']);
    expect(view.state.doc.textContent).toBe(`x\n${s}`);
    done();
  });

  it.each(cases.map(([s]) => s))('输入法组字中「%s」不变', async (s) => {
    const { view, done } = setup('');
    comp(view.dom, 'compositionstart');
    expect(view.composing).toBe(true);
    type(view, s);
    expect(names(view)).toEqual(['paragraph']);
    expect(view.state.doc.textContent).toBe(s);
    comp(view.dom, 'compositionend');
    await new Promise((r) => setTimeout(r, 100));
    done();
  });

  it('全角句号不跟数字（「好。 」）、两个中点（「·· 」）不变', () => {
    for (const s of ['好。 ', '·· ', '》》》 ']) {
      const { view, done } = setup('');
      type(view, s);
      expect(names(view), s).toEqual(['paragraph']);
      done();
    }
  });
});
