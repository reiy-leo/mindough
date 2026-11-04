// @vitest-environment happy-dom
/**
 * ⌘K 加链接读剪贴板（Rei 2026-11-04「选中文本后，cmd+k后自动添加剪贴板中的链接到链接input中」）：
 * 选了字按 ⌘K，剪贴板是链接就填进「链接」；已有链接不覆盖；不是链接留空；读回来之前用户打了字不覆盖。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TextSelection } from '@tiptap/pm/state';

const clip = vi.hoisted(() => ({ text: null as string | null, calls: 0, gate: null as Promise<void> | null }));
vi.mock('../../lib/clip-link', async (orig) => {
  const real = await orig<typeof import('../../lib/clip-link')>();
  return {
    ...real,
    readClipboardLink: async () => {
      clip.calls++;
      if (clip.gate) await clip.gate;
      return real.clipLink(clip.text);
    },
  };
});

import { MdEditor } from './MdEditor';
import type { MdEditorHandle } from './editor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  clip.text = null;
  clip.calls = 0;
  clip.gate = null;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const wait = (ms = 30) => act(() => new Promise((r) => setTimeout(r, ms)));

async function mount(md: string) {
  const ref = createRef<MdEditorHandle | null>() as { current: MdEditorHandle | null };
  act(() => root.render(<MdEditor value={md} onChange={() => {}} label="内容" handleRef={ref} />));
  await wait();
  return ref.current!;
}
function select(h: MdEditorHandle, text: string) {
  const v = h.view();
  let from = -1;
  v.state.doc.descendants((n, pos) => {
    if (from < 0 && n.isText && n.text?.includes(text)) from = pos + n.text.indexOf(text);
  });
  v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, from, from + text.length)));
  v.focus();
}
const cmdK = () => {
  const pm = host.querySelector('.ProseMirror') as HTMLElement;
  act(() => void pm.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true })));
};
const hrefInput = () => host.querySelectorAll<HTMLInputElement>('.md-link-dialog input')[1]!;

describe('⌘K 读剪贴板', () => {
  it('选了字，剪贴板是链接：填进「链接」', async () => {
    clip.text = '  https://example.com/a \n';
    const h = await mount('看文档吧');
    select(h, '文档');
    cmdK();
    await wait();
    expect(clip.calls).toBe(1);
    expect(hrefInput().value).toBe('https://example.com/a');
  }, 30_000);

  it('www. 开头补 https://', async () => {
    clip.text = 'www.a.cn/x';
    const h = await mount('看文档吧');
    select(h, '文档');
    cmdK();
    await wait();
    expect(hrefInput().value).toBe('https://www.a.cn/x');
  }, 30_000);

  it('不是链接（一段话、javascript:）：留空', async () => {
    for (const t of ['看看 https://a.com', 'javascript:alert(1)']) {
      clip.text = t;
      const h = await mount('看文档吧');
      select(h, '文档');
      cmdK();
      await wait();
      expect(hrefInput().value, t).toBe('');
      act(() => root.render(<></>));
      await wait();
    }
  }, 30_000);

  it('已有链接：保留原来的网址，不读剪贴板', async () => {
    clip.text = 'https://other.com';
    const h = await mount('看 [文档](https://a.com/x) 吧');
    select(h, '文档');
    cmdK();
    await wait();
    expect(clip.calls).toBe(0);
    expect(hrefInput().value).toBe('https://a.com/x');
  }, 30_000);

  it('读回来之前已经在框里打了字：不覆盖', async () => {
    clip.text = 'https://example.com';
    let open!: () => void;
    clip.gate = new Promise<void>((r) => (open = r));
    const h = await mount('看文档吧');
    select(h, '文档');
    cmdK();
    await wait();
    const input = hrefInput();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(input, 'https://typed.com');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => open());
    await wait();
    expect(hrefInput().value).toBe('https://typed.com');
  }, 30_000);
});
