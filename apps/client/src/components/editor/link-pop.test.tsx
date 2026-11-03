// @vitest-environment happy-dom
/**
 * 链接小浮层（Rei 2026-11-03「链接的popover中不显示链接，只显示访问、编辑、去掉链接」）：
 * 鼠标移到链接上，浮层只有三个按钮，不显示网址；网址在「访问」的悬停提示里，点「访问」打开链接。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const opened = vi.hoisted(() => [] as string[]);
vi.mock('../../lib/external', async (orig) => ({
  ...(await orig<typeof import('../../lib/external')>()),
  openExternal: async (url: string) => void opened.push(url),
}));

import { MdEditor } from './MdEditor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  opened.length = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const wait = () => act(() => new Promise((r) => setTimeout(r, 20)));

describe('链接小浮层', () => {
  it('只有「访问」「编辑」「去掉链接」，不显示网址；点「访问」打开链接', async () => {
    act(() => root.render(<MdEditor value="看 [文档](https://a.com/x) 吧" onChange={() => {}} label="内容" />));
    await wait();
    const a = host.querySelector('.md-editor-content a') as HTMLElement;
    expect(a).toBeTruthy();
    act(() => void a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    await wait();
    const pop = host.querySelector('.md-link-pop') as HTMLElement;
    expect(pop).toBeTruthy();
    const buttons = [...pop.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['访问', '编辑', '去掉链接']);
    expect(pop.textContent).not.toContain('https://a.com/x');
    expect(pop.querySelector('a')).toBeNull();
    const visit = buttons[0]!;
    expect(visit.closest('[title]')?.getAttribute('title')).toBe('https://a.com/x');
    expect(visit.getAttribute('aria-label')).toBe('访问 https://a.com/x');
    expect(visit.querySelector('svg')).toBeTruthy();
    act(() => visit.click());
    await wait();
    expect(opened).toEqual(['https://a.com/x']);
  });
});
