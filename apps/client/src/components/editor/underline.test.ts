// @vitest-environment happy-dom
/**
 * 粗体 / 斜体 / 下划线三种（Rei 2026-11-03）：快捷键、markdown 往返、组字时不动。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextSelection } from '@tiptap/pm/state';
import { undo } from '@tiptap/pm/history';
import { createMdEditor, roundTrip } from './editor';
import { nextUnderline, UNDERLINE_COMBO_MS } from './underline';

const setup = (md: string) => {
  const root = document.createElement('div');
  root.className = 'md-editor-root';
  document.body.appendChild(root);
  const changes: string[] = [];
  const h = createMdEditor({ root, value: md, placeholder: '', label: 'x', onChange: (v) => changes.push(v) });
  const view = h.view();
  const done = () => {
    h.destroy();
    root.remove();
  };
  return { h, view, root, done };
};
type Init = KeyboardEventInit & { keyCode?: number };
const key = (el: HTMLElement, k: string, init: Init = {}) => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  if (init.keyCode != null) Object.defineProperty(ev, 'keyCode', { get: () => init.keyCode });
  el.dispatchEvent(ev);
  return ev;
};
const keyup = (el: HTMLElement, k: string) => el.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
const cmd = { metaKey: true };
/** 选中文档里第一处 text。 */
const select = (view: ReturnType<typeof setup>['view'], text: string) => {
  let at = -1;
  view.state.doc.descendants((n, pos) => {
    if (at < 0 && n.isText && n.text!.includes(text)) at = pos + n.text!.indexOf(text);
  });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at, at + text.length)));
};
const type = (view: ReturnType<typeof setup>['view'], s: string) => view.dispatch(view.state.tr.insertText(s));

afterEach(() => vi.useRealTimers());

describe('markdown 往返', () => {
  const same = (md: string, expected = md) => expect(roundTrip(md)).toBe(expected.replace(/\s+$/, '') + '\n');
  it('三种下划线照原样', () => {
    same('这是<u>直线</u>下划线');
    same('这是<u class="wavy">波浪线</u>下划线');
    same('这是<u class="double">双线</u>下划线');
  });
  it('粗体、斜体存成 ** / *', () => {
    same('**粗** *斜* __粗__ _斜_');
  });
  it('和粗体、斜体、链接、删除线、代码叠着用', () => {
    same('这是<u>**重点**</u>内容');
    same('<u class="wavy">*斜* 和 ~~删~~</u>');
    // 链接里的下划线写成套在链接外面（意思一样）
    same('[<u>链接</u>](https://x.com)', '<u>[链接](https://x.com)</u>');
    same('<u>`code`</u>');
  });
  it('标题、列表、清单、表格格子里', () => {
    same('## 标题<u>下划线</u>');
    same('- [ ] <u class="double">清单</u>\n- 列表 <u>一</u>');
    same('| a        | b |\n| -------- | - |\n| <u>1</u> | 2 |');
  });
  it('不成对的、带别的属性的标签：原样留着', () => {
    same('只有开头<u>没有结尾');
    same('<u style="color:red">别的属性</u>');
    same('跨段<u>开头\n\n结尾</u>');
  });
  it('单引号、大写也认，写回统一成双引号小写', () => {
    same("<u class='wavy'>x</u>", '<u class="wavy">x</u>');
    same('<U>x</U>', '<u>x</u>');
  });
  it('普通文字里打的 <u> 不会变成下划线（写出去转义）', () => {
    const { view, done, h } = setup('');
    type(view, '写 <u>x</u> 字面');
    expect(h.getMarkdown()).toBe('写 \\<u>x\\</u> 字面\n');
    expect(roundTrip(h.getMarkdown())).toBe(h.getMarkdown());
    done();
  });
  it('两遍稳定', () => {
    for (const md of ['a<u>b**c**d</u>e', '<u class="wavy">x</u><u class="double">y</u>', '***<u>x</u>***']) expect(roundTrip(roundTrip(md))).toBe(roundTrip(md));
  });
});

describe('⌘B / ⌘I', () => {
  // 测试环境不是 Mac：Tiptap 的 Mod 是 Ctrl（Mac 上是 ⌘）
  it('选中文字：Ctrl/⌘ + B 粗体、+ I 斜体', () => {
    const a = setup('一二三');
    select(a.view, '一');
    key(a.view.dom, 'b', { ctrlKey: true });
    select(a.view, '三');
    key(a.view.dom, 'i', { ctrlKey: true });
    expect(a.h.getMarkdown()).toBe('**一**二*三*\n');
    a.done();
  });
});

describe('⌘U', () => {
  it('选中文字加直线，再按去掉', () => {
    const a = setup('一二三');
    select(a.view, '二');
    key(a.view.dom, 'u', cmd);
    expect(a.h.getMarkdown()).toBe('一<u>二</u>三\n');
    key(a.view.dom, 'u', cmd);
    expect(a.h.getMarkdown()).toBe('一二三\n');
    a.done();
  });

  it('⌘U 后 ⌘ 没松、1 秒内按 1 / 2：换成波浪线 / 双线；一次撤销回到原样', () => {
    const a = setup('一二三');
    select(a.view, '二');
    key(a.view.dom, 'u', cmd);
    key(a.view.dom, '1', { ...cmd, code: 'Digit1' });
    expect(a.h.getMarkdown()).toBe('一<u class="wavy">二</u>三\n');
    key(a.view.dom, '2', { ...cmd, code: 'Digit2' });
    expect(a.h.getMarkdown()).toBe('一<u class="double">二</u>三\n');
    undo(a.view.state, a.view.dispatch);
    expect(a.h.getMarkdown()).toBe('一二三\n');
    a.done();
  });

  it('再按同样的组合去掉', () => {
    const a = setup('一<u class="wavy">二</u>三');
    select(a.view, '二');
    key(a.view.dom, 'u', cmd);
    key(a.view.dom, '1', cmd);
    expect(a.h.getMarkdown()).toBe('一二三\n');
    // 波浪线上按 ⌘U+2：换成双线
    const b = setup('<u class="wavy">二</u>');
    select(b.view, '二');
    key(b.view.dom, 'u', cmd);
    key(b.view.dom, '2', cmd);
    expect(b.h.getMarkdown()).toBe('<u class="double">二</u>\n');
    a.done();
    b.done();
  });

  it('松开 ⌘、超过 1 秒、中间按了别的键：1 / 2 不算，照常往外传', () => {
    const outside = vi.fn();
    window.addEventListener('keydown', outside);
    const a = setup('一二三');
    select(a.view, '二');
    key(a.view.dom, 'u', cmd);
    keyup(a.view.dom, 'Meta');
    const ev = key(a.view.dom, '1', cmd);
    expect(ev.defaultPrevented).toBe(false);
    expect(a.h.getMarkdown()).toBe('一<u>二</u>三\n');

    vi.useFakeTimers({ toFake: ['Date'] });
    key(a.view.dom, 'u', cmd); // 去掉
    key(a.view.dom, 'u', cmd); // 再加
    vi.setSystemTime(Date.now() + UNDERLINE_COMBO_MS + 50);
    key(a.view.dom, '2', cmd);
    expect(a.h.getMarkdown()).toBe('一<u>二</u>三\n');
    vi.useRealTimers();

    key(a.view.dom, 'u', cmd);
    key(a.view.dom, 'u', cmd);
    key(a.view.dom, 'ArrowLeft', { ...cmd, shiftKey: true });
    key(a.view.dom, '1', cmd);
    expect(a.h.getMarkdown()).toBe('一<u>二</u>三\n');
    expect(outside).toHaveBeenCalled();
    window.removeEventListener('keydown', outside);
    a.done();
  });

  it('时间窗里的 ⌘1 不往外传（类型页的 ⌘1 / ⌘2 不跟着动）', () => {
    const outside = vi.fn();
    window.addEventListener('keydown', outside);
    const a = setup('一二三');
    select(a.view, '二');
    key(a.view.dom, 'u', cmd);
    outside.mockClear();
    const ev = key(a.view.dom, '1', cmd);
    expect(ev.defaultPrevented).toBe(true);
    expect(outside).not.toHaveBeenCalled();
    window.removeEventListener('keydown', outside);
    a.done();
  });

  it('没选字：作用于接下来打的字', () => {
    const a = setup('一');
    a.view.dispatch(a.view.state.tr.setSelection(TextSelection.atEnd(a.view.state.doc)));
    key(a.view.dom, 'u', cmd);
    key(a.view.dom, '2', cmd);
    type(a.view, '二');
    key(a.view.dom, 'u', cmd);
    type(a.view, '三');
    expect(a.h.getMarkdown()).toBe('一<u class="double">二</u>三\n');
    a.done();
  });

  it('组字中（输入法）按键不算', () => {
    const a = setup('一二三');
    select(a.view, '二');
    const ev = key(a.view.dom, 'u', { ...cmd, isComposing: true });
    expect(ev.defaultPrevented).toBe(false);
    key(a.view.dom, 'u', { ...cmd, keyCode: 229 });
    expect(a.h.getMarkdown()).toBe('一二三\n');
    a.done();
  });

  it('nextUnderline', () => {
    expect(nextUnderline(null, 'u')).toBe('solid');
    expect(nextUnderline('wavy', 'u')).toBe(null);
    expect(nextUnderline(null, '1')).toBe('wavy');
    expect(nextUnderline('solid', '1')).toBe('wavy');
    expect(nextUnderline('wavy', '1')).toBe(null);
    expect(nextUnderline('wavy', '2')).toBe('double');
    expect(nextUnderline('double', '2')).toBe(null);
  });
});
