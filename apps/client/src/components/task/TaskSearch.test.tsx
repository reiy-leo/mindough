// @vitest-environment happy-dom
/**
 * 挑任务的搜索框（「先做完这些 / 做完后解锁」弹层，Rei 2026-11-02）：
 * 搜标题（正文第一行去掉 markdown）+ 拼音；组字时不过滤、选词回车不新建；退格只删字，不触发全局快捷键、不选中、不新建。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { taskTitle, type Store, type Task } from '@mindough/core';

vi.mock('../../lib/view', () => ({ titleOf: (_s: unknown, t: Task) => taskTitle({ body_md: t.body_md }) }));

import { TaskSearch } from './TaskSearch';
import { typingKey } from '../../lib/ime';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mk = (id: string, body_md: string, status: Task['status'] = '待办'): Task => ({ id, body_md, status, deleted: false } as unknown as Task);
const tasks = [mk('a', '# **买菜**'), mk('b', '- [ ] 读书 30 页'), mk('c', '写 [周报](https://x.cn)'), mk('d', '旧事', '完成')];
const store = { tasks: () => tasks, derived: () => new Map() } as unknown as Store;

let root: Root;
let host: HTMLDivElement;
const onPick = vi.fn();
const onCreate = vi.fn();

function render(props: { hideFinished?: boolean } = {}) {
  act(() => root.render(<TaskSearch store={store} exclude={new Set()} onPick={onPick} onCreate={onCreate} {...props} />));
}
const input = () => host.querySelector('input')!;
const titles = () => [...host.querySelectorAll('[role="option"]')].map((o) => o.textContent);
const setNative = (v: string) => Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), v);
function type(v: string, inputType = 'insertText') {
  act(() => {
    input().dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType, data: v }));
    setNative(v);
    input().dispatchEvent(new InputEvent('input', { bubbles: true, inputType, data: v }));
  });
}
const key = (k: string, init: KeyboardEventInit = {}) => act(() => void input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })));
const compose = (kind: 'compositionstart' | 'compositionend', data = '') => act(() => void input().dispatchEvent(new CompositionEvent(kind, { bubbles: true, data })));

beforeEach(() => {
  onPick.mockReset();
  onCreate.mockReset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('挑任务：搜标题', () => {
  it('标题带 markdown（# ** - [ ] 链接）也搜得到', () => {
    render();
    type('买菜');
    expect(titles()).toEqual(['买菜']);
    type('周报');
    expect(titles()).toEqual(['写 周报']);
    type('读书');
    expect(titles()).toEqual(['读书 30 页']);
  });
  it('拼音首字母、不分大小写', () => {
    render();
    type('MC');
    expect(titles()).toEqual(['买菜']);
    type('ds');
    expect(titles()).toEqual(['读书 30 页']);
  });
  it('hideFinished 时已完成的不列出来', () => {
    render({ hideFinished: true });
    expect(titles().some((x) => x?.startsWith('旧事'))).toBe(false);
    act(() => root.unmount());
    root = createRoot(host);
    render();
    expect(titles()).toContain('旧事已结束');
  });
});

describe('挑任务：中文输入法', () => {
  it('组字时（框里是拼音）不过滤，上屏后才过滤', () => {
    render();
    const all = titles().length;
    compose('compositionstart');
    type('shu', 'insertCompositionText');
    expect(input().value).toBe('shu');
    expect(titles().length).toBe(all);
    expect(host.querySelector('.pick-create')?.classList.contains('is-idle')).toBe(true);
    type('书', 'insertFromComposition');
    compose('compositionend', '书');
    expect(titles()).toEqual(['读书 30 页']);
  });
  it('选词的回车（组字中 / 229）不新建', () => {
    render();
    compose('compositionstart');
    type('xyz', 'insertCompositionText');
    key('Enter', { isComposing: true } as KeyboardEventInit);
    key('Enter', { keyCode: 229 } as KeyboardEventInit);
    expect(onCreate).not.toHaveBeenCalled();
  });
  it('上屏之后过一会儿的回车：搜不到就新建', async () => {
    render();
    type('完全没有的事');
    await new Promise((r) => setTimeout(r, 120));
    key('Enter');
    expect(onCreate).toHaveBeenCalledWith('完全没有的事');
  });
});

describe('挑任务：退格', () => {
  it('退格只删字：焦点留在框里，不选中、不新建，全局快捷键都让路', () => {
    render();
    act(() => input().focus());
    const seen: boolean[] = [];
    const spy = (e: KeyboardEvent) => seen.push(typingKey(e));
    window.addEventListener('keydown', spy);
    type('买菜');
    key('Backspace');
    type('买');
    key('Backspace');
    type('');
    window.removeEventListener('keydown', spy);
    expect(document.activeElement).toBe(input());
    expect(onPick).not.toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
    // 2026-11-08 起退格、Delete 停在搜索框里（lib/backspace-guard.ts keepEditKeysInInput），根本到不了全局监听；到了的也都让路
    expect(seen.every(Boolean)).toBe(true);
    expect(titles().length).toBe(4);
  });
});
