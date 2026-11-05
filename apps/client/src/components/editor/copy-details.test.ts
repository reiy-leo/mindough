// @vitest-environment happy-dom
/**
 * 从折叠块里复制（Rei 2026-11-05）：粘贴出来不带 <details> / <summary>。
 * 走真的 copy 事件（ProseMirror 自己的复制处理：transformCopied → text/html + clipboardTextSerializer → text/plain）。
 */
import { describe, expect, it } from 'vitest';
import { AllSelection, NodeSelection, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { createMdEditor } from './editor';

const setup = (md: string) => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const h = createMdEditor({ root, value: md, placeholder: '', label: 'x', onChange: () => {} });
  const view = h.view();
  return { h, view, done: () => (h.destroy(), root.remove()) };
};

/** 在文档里找某段文字的位置（文字开头）。 */
const posOf = (view: EditorView, text: string): number => {
  let at = -1;
  view.state.doc.descendants((n, pos) => {
    if (at >= 0) return false;
    if (n.isText && n.text!.includes(text)) at = pos + n.text!.indexOf(text);
    return true;
  });
  if (at < 0) throw new Error(`找不到「${text}」`);
  return at;
};

const copy = (view: EditorView) => {
  const data: Record<string, string> = {};
  const dt = {
    clearData: () => {
      for (const k of Object.keys(data)) delete data[k];
    },
    setData: (t: string, v: string) => {
      data[t] = v;
    },
    getData: (t: string) => data[t] ?? '',
  };
  const ev = new Event('copy', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', { value: dt });
  view.dom.dispatchEvent(ev);
  return { text: data['text/plain'] ?? '', html: data['text/html'] ?? '' };
};

const select = (view: EditorView, from: number, to: number) =>
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));

const noTags = (s: string) => expect(s).not.toMatch(/<\/?(details|summary)\b/i);

const MD = '前面\n\n<details>\n<summary>标题</summary>\n\n第一段 **粗**\n\n- a\n- b\n\n</details>\n\n后面';

describe('折叠块里复制不带标签', () => {
  it('正文里一段中的几个字', () => {
    const { view, done } = setup(MD);
    const p = posOf(view, '第一段');
    select(view, p, p + 3);
    const { text, html } = copy(view);
    expect(text.trim()).toBe('第一段');
    noTags(text);
    expect(html).not.toContain('data-type="details"');
    expect(html).not.toContain('md-details-summary');
    done();
  });

  it('正文里跨好几块（段落 + 列表）', () => {
    const { view, done } = setup(MD);
    select(view, posOf(view, '第一段'), posOf(view, 'b') + 1);
    const { text, html } = copy(view);
    noTags(text);
    expect(text).toBe('第一段 **粗**\n\n- a\n- b\n');
    expect(html).not.toContain('data-type="details"');
    done();
  });

  it('标题里的字', () => {
    const { view, done } = setup(MD);
    const p = posOf(view, '标题');
    select(view, p, p + 2);
    const { text, html } = copy(view);
    noTags(text);
    expect(text.trim()).toBe('标题');
    expect(html).not.toContain('md-details-summary');
    done();
  });

  it('从标题拖到正文：标题成了普通一段', () => {
    const { view, done } = setup(MD);
    select(view, posOf(view, '标题'), posOf(view, '第一段') + 3);
    const { text } = copy(view);
    noTags(text);
    expect(text).toBe('标题\n\n第一段\n');
    done();
  });

  it('从折叠块里面拖到外面', () => {
    const { view, done } = setup(MD);
    select(view, posOf(view, 'b'), posOf(view, '后面') + 2);
    const { text } = copy(view);
    noTags(text);
    expect(text).toBe('- b\n\n后面\n');
    done();
  });

  it('从外面拖进折叠块里面', () => {
    const { view, done } = setup(MD);
    select(view, posOf(view, '前面'), posOf(view, '第一段') + 3);
    const { text } = copy(view);
    noTags(text);
    expect(text).toBe('前面\n\n标题\n\n第一段\n');
    done();
  });

  it('整块选中（点选整个折叠块）', () => {
    const { view, done } = setup(MD);
    let at = -1;
    view.state.doc.forEach((n, off) => {
      if (n.type.name === 'details') at = off;
    });
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at)));
    const { text } = copy(view);
    noTags(text);
    expect(text).toBe('标题\n\n第一段 **粗**\n\n- a\n- b\n');
    done();
  });

  it('全选：折叠块摊成标题 + 正文，前后照旧', () => {
    const { view, done } = setup(MD);
    select(view, 1, view.state.doc.content.size - 1);
    const { text } = copy(view);
    noTags(text);
    expect(text).toBe('前面\n\n标题\n\n第一段 **粗**\n\n- a\n- b\n\n后面\n');
    done();
  });

  it('套了两层的折叠块，里层正文里的字', () => {
    const { view, done } = setup('<details>\n<summary>外</summary>\n\n<details>\n<summary>内</summary>\n\n深处的字\n\n再一段\n\n</details>\n\n</details>');
    select(view, posOf(view, '深处'), posOf(view, '再一段') + 3);
    const { text, html } = copy(view);
    noTags(text);
    expect(text).toBe('深处的字\n\n再一段\n');
    expect(html).not.toContain('data-type="details"');
    done();
  });

  it('普通内容（没有折叠块）复制照旧是 markdown', () => {
    const { view, done } = setup('**粗** 和 `码`\n\n- a');
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
    expect(copy(view).text).toBe('**粗** 和 `码`\n\n- a\n');
    done();
  });

  it('整块复制再粘回编辑器：还是折叠块（text/html 里留着）', () => {
    const { view, h, done } = setup(MD);
    let at = -1;
    view.state.doc.forEach((n, off) => {
      if (n.type.name === 'details') at = off;
    });
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at)));
    const { html, text } = copy(view);
    const target = setup('');
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clipboardData', {
      value: { getData: (t: string) => (t === 'text/html' ? html : t === 'text/plain' ? text : ''), files: [], types: ['text/html', 'text/plain'], items: [] },
    });
    target.view.dom.dispatchEvent(ev);
    let n = 0;
    target.view.state.doc.descendants((x) => void (x.type.name === 'details' && n++));
    expect(n).toBe(1);
    expect(target.h.getMarkdown()).toContain('<summary>标题</summary>');
    target.done();
    void h;
    done();
  });
});
