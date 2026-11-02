// @vitest-environment happy-dom
/**
 * 中文输入法组字（Rei 2026-11-02「选择任何一个，就立马新建一行新的todo」）：组字中、选词时都不拆行、不新建清单项。
 * 真实的 WebKit 事件顺序在 e2e/ime/run.mjs（Playwright webkit）里测；这里测兜底和回车两层的逻辑。
 */
import { describe, expect, it } from 'vitest';
import { TextSelection } from '@tiptap/pm/state';
import { createMdEditor } from './editor';
import { insertedText, skeleton } from './ime-guard';

const setup = (md: string) => {
  const root = document.createElement('div');
  root.className = 'md-editor-root';
  document.body.appendChild(root);
  const h = createMdEditor({ root, value: md, placeholder: '', label: 'x', onChange: () => {} });
  const view = h.view();
  const done = () => {
    h.destroy();
    root.remove();
  };
  return { h, view, done };
};
const comp = (el: HTMLElement, type: string, data = '') => {
  const ev = new CompositionEvent(type, { bubbles: true, data });
  // happy-dom 的 CompositionEvent 不带 data
  if (ev.data !== data) Object.defineProperty(ev, 'data', { get: () => data });
  el.dispatchEvent(ev);
};
const enter = (el: HTMLElement, init: KeyboardEventInit & { keyCode?: number } = {}) => {
  const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });
  if (init.keyCode != null) Object.defineProperty(ev, 'keyCode', { get: () => init.keyCode });
  el.dispatchEvent(ev);
  return ev;
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const items = (md: string) => md.split('\n').filter((l) => /^\s*- /.test(l)).length;

describe('骨架', () => {
  it('只看节点和属性，不看文字', () => {
    const a = setup('- [ ] 一');
    const s1 = skeleton(a.view.state.doc);
    a.view.dispatch(a.view.state.tr.insertText('如何', a.view.state.doc.content.size - 3));
    expect(skeleton(a.view.state.doc)).toBe(s1);
    a.done();
  });
});

describe('多出来的字', () => {
  it('前后一样的去掉，换行不算', () => {
    const a = setup('- [ ] 第一条\n- [ ] 第二条');
    const before = a.view.state.doc;
    a.h.setMarkdown('- [ ] 第一条\n- [ ] \n- [ ] 如何第二条');
    expect(insertedText(before, a.view.state.doc)).toBe('如何');
    a.done();
  });
});

describe('组字结束后结构变了：改回「原来的 + 上屏的词」', () => {
  it('空清单项被 WebKit 换成普通列表项、词另起一行：还是原来那条清单', async () => {
    const { h, view, done } = setup('- [ ] 第一条\n- [ ] ');
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    comp(view.dom, 'compositionstart');
    // 模拟 WebKit 删节点后 ProseMirror 读回来的样子：最后一项变成没勾的普通项
    const { state } = view;
    let liPos = -1;
    state.doc.descendants((n, pos) => {
      if (n.type.name === 'listItem') liPos = pos;
    });
    const li = state.doc.nodeAt(liPos)!;
    expect(li.attrs.checked).toBe(false);
    view.dispatch(state.tr.setNodeMarkup(liPos, undefined, { ...li.attrs, checked: null }).insertText('如何', liPos + 2));
    expect(h.getMarkdown().trim()).toBe('- [ ] 第一条\n- 如何');
    comp(view.dom, 'compositionend', '如何');
    await wait(80);
    expect(h.getMarkdown().trim()).toBe('- [ ] 第一条\n- [ ] 如何');
    done();
  });

  it('多出一行：合回去', async () => {
    const { h, view, done } = setup('- [ ] 第一条');
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    comp(view.dom, 'compositionstart');
    // 模拟：词进了新的一项
    const at = view.state.doc.content.size - 3;
    view.dispatch(view.state.tr.split(at, 2, [{ type: view.state.schema.nodes.listItem!, attrs: { checked: false } }]).insertText('如何'));
    expect(items(h.getMarkdown())).toBe(2);
    // compositionend 不带 data 也认得出上屏的词
    comp(view.dom, 'compositionend', '');

    await wait(80);
    expect(h.getMarkdown().trim()).toBe('- [ ] 第一条如何');
    done();
  });

  it('结构没变：不动（正常组字）', async () => {
    const { h, view, done } = setup('- [ ] 第一条');
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    comp(view.dom, 'compositionstart');
    view.dispatch(view.state.tr.insertText('如何'));
    const before = view.state.doc;
    comp(view.dom, 'compositionend', '如何');
    await wait(80);
    expect(view.state.doc).toBe(before);
    expect(h.getMarkdown().trim()).toBe('- [ ] 第一条如何');
    done();
  });

  it('组字期间外面整篇换掉了（setMarkdown）：不改回去', async () => {
    const { h, view, done } = setup('- [ ] 第一条');
    comp(view.dom, 'compositionstart');
    h.setMarkdown('别处改的\n\n另一段');
    comp(view.dom, 'compositionend', '如何');
    await wait(80);
    expect(h.getMarkdown().trim()).toBe('别处改的\n\n另一段');
    done();
  });
});

describe('回车', () => {
  it('组字中、229、组字刚结束的回车不拆清单项；过一会儿的回车照常新建', async () => {
    const { h, view, done } = setup('- [ ] 第一条');
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    comp(view.dom, 'compositionstart');
    enter(view.dom, { isComposing: true });
    enter(view.dom); // 组字中，ProseMirror 自己猜出来的那种回车
    comp(view.dom, 'compositionend', '');
    enter(view.dom, { keyCode: 229 });
    enter(view.dom, { keyCode: 13 }); // WebKit：compositionend 之后紧跟的回车
    expect(items(h.getMarkdown())).toBe(1);
    await wait(150);
    enter(view.dom, { keyCode: 13 });
    expect(items(h.getMarkdown())).toBe(2);
    done();
  });
});
