import { describe, expect, it } from 'vitest';
import { installSelectAllGuard, isEditable, isSelectAllKey, selectableBlock } from './no-select';

/** 假元素：认 tag、class、contenteditable、data-selectable，够测 closest。 */
interface FakeEl {
  tag: string;
  cls: string[];
  attrs: Record<string, string>;
  parentElement: FakeEl | null;
  closest(selector: string): unknown;
}
function el(tag: string, opts: { cls?: string[]; attrs?: Record<string, string> } = {}, parent: FakeEl | null = null): FakeEl {
  const node: FakeEl = {
    tag,
    cls: opts.cls ?? [],
    attrs: opts.attrs ?? {},
    parentElement: parent,
    closest(selector: string): unknown {
      for (let n: FakeEl | null = node; n; n = n.parentElement) if (matches(n, selector)) return n;
      return null;
    },
  };
  return node;
}
function matches(n: FakeEl, selector: string): boolean {
  if (selector.includes('input')) {
    if (['input', 'textarea', 'select'].includes(n.tag)) return true;
    return 'contenteditable' in n.attrs && n.attrs.contenteditable !== 'false';
  }
  return n.cls.includes('md') || n.cls.includes('ProseMirror') || 'data-selectable' in n.attrs;
}
const key = (k: Partial<KeyboardEvent>) => ({ key: 'a', code: 'KeyA', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...k });

describe('界面不能选（Rei 2026-11-04）', () => {
  it('能打字的地方', () => {
    expect(isEditable(el('input'))).toBe(true);
    expect(isEditable(el('p', {}, el('div', { attrs: { contenteditable: 'true' } })))).toBe(true);
    expect(isEditable(el('div', { attrs: { contenteditable: 'false' } }))).toBe(false);
    expect(isEditable(el('button'))).toBe(false);
  });
  it('只读能选的内容块', () => {
    const post = el('div', { cls: ['md', 'jpost-body'] });
    expect(selectableBlock(el('p', {}, post))).toBe(post);
    expect(selectableBlock({ parentElement: el('p', {}, post) })).toBe(post); // 文字节点
    expect(selectableBlock(el('span', {}, el('nav')))).toBe(null);
    expect(selectableBlock(null)).toBe(null);
  });
  it('⌘A / Ctrl+A', () => {
    expect(isSelectAllKey(key({ metaKey: true }))).toBe(true);
    expect(isSelectAllKey(key({ ctrlKey: true, key: 'A' }))).toBe(true);
    expect(isSelectAllKey(key({ metaKey: true, shiftKey: true }))).toBe(false);
    expect(isSelectAllKey(key({}))).toBe(false);
    expect(isSelectAllKey(key({ metaKey: true, key: 'b', code: 'KeyB' }))).toBe(false);
  });

  function setup(active: unknown, anchor: unknown) {
    let handler: ((e: Event) => void) | null = null;
    const target = {
      addEventListener: (_t: string, h: (e: Event) => void) => (handler = h),
      removeEventListener: () => (handler = null),
    } as unknown as Window;
    const picked: unknown[] = [];
    const doc = { activeElement: active, getSelection: () => ({ anchorNode: anchor, selectAllChildren: (n: unknown) => picked.push(n) }) };
    const off = installSelectAllGuard(target, doc);
    const fire = (tgt: unknown) => {
      let prevented = false;
      handler?.({ ...key({ metaKey: true }), target: tgt, defaultPrevented: false, preventDefault: () => (prevented = true) } as unknown as Event);
      return prevented;
    };
    return { fire, picked, off };
  }
  it('焦点不在输入框：不选整页', () => {
    const body = el('body');
    const s = setup(body, el('span', {}, el('nav')));
    expect(s.fire(body)).toBe(true);
    expect(s.picked).toEqual([]);
  });
  it('选区在日记正文里：只选这一段', () => {
    const body = el('body');
    const post = el('div', { cls: ['md'] });
    const s = setup(body, el('p', {}, post));
    expect(s.fire(body)).toBe(true);
    expect(s.picked).toEqual([post]);
  });
  it('输入框里照常全选', () => {
    const input = el('input');
    const s = setup(input, null);
    expect(s.fire(input)).toBe(false);
    s.off();
  });
});
