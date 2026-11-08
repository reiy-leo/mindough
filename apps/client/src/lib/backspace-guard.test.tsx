// @vitest-environment happy-dom
/**
 * 退格不乱跳（Rei 2026-11-08「弹窗的搜索框，backspace删除时会错误地关闭窗口并乱跳转」）：
 * WebKit 在不能打字的地方按退格会返回上一页；react-aria 的 Autocomplete 会把输入框里的按键转发到列表上（target 不是输入框）。
 * 这里查两层：兜底 installBackspaceGuard 只拦落在页面上的退格；带搜索框的弹窗里删字时，退格、Delete 不再被转发到列表。
 * 浏览器里逐个弹窗的实测在 LightVela：work/shots-tool/popup-backspace.mjs。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { taskTitle, type Store, type Task } from '@mindough/core';
import { installBackspaceGuard, keepEditKeysInInput, shouldBlockEditKey } from './backspace-guard';

vi.mock('./view', () => ({ titleOf: (_s: unknown, t: Task) => taskTitle({ body_md: t.body_md }) }));
import { TaskSearch } from '../components/task/TaskSearch';
import { CurrencySelect } from '../components/library/MoneyField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const press = (el: Element, key: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => void el.dispatchEvent(e));
  return e;
};

describe('兜底：页面上的退格不让 WebKit 返回上一页', () => {
  let off: () => void;
  beforeEach(() => (off = installBackspaceGuard(window)));
  afterEach(() => {
    off();
    document.body.innerHTML = '';
  });
  it('焦点在按钮、列表行上：Backspace、Delete 被拦下', () => {
    document.body.innerHTML = '<button id="b">x</button><div id="row" tabindex="0"></div>';
    const b = document.getElementById('b')!;
    b.focus();
    expect(press(b, 'Backspace').defaultPrevented).toBe(true);
    expect(press(b, 'Delete').defaultPrevented).toBe(true);
    expect(press(document.getElementById('row')!, 'Backspace').defaultPrevented).toBe(true);
  });
  it('输入框、文本框、编辑器里照常删字；组字时不碰；别的键不碰', () => {
    document.body.innerHTML = '<input id="i"><textarea id="t"></textarea><div id="ed" contenteditable="true"><p id="p">x</p></div><button id="b">x</button>';
    for (const id of ['i', 't', 'ed', 'p']) expect(press(document.getElementById(id)!, 'Backspace').defaultPrevented).toBe(false);
    const b = document.getElementById('b')!;
    expect(press(b, 'Backspace', { isComposing: true }).defaultPrevented).toBe(false);
    expect(press(b, 'a').defaultPrevented).toBe(false);
  });
  it('焦点在输入框、按键落在别处（Autocomplete 转发的那份）：不拦，不然输入框删不了字', () => {
    document.body.innerHTML = '<input id="i"><ul id="list" role="listbox"></ul>';
    (document.getElementById('i') as HTMLInputElement).focus();
    expect(press(document.getElementById('list')!, 'Backspace').defaultPrevented).toBe(false);
  });
  it('组件自己处理过的（比如属性胶囊上退格清除）不重复处理', () => {
    expect(shouldBlockEditKey({ key: 'Backspace', target: document.body, defaultPrevented: true, isComposing: false, keyCode: 8 }, null)).toBe(false);
  });
  it('keepEditKeysInInput：只拦输入框里的 Backspace / Delete 往下传', () => {
    const input = document.createElement('input');
    const btn = document.createElement('button');
    const ev = (key: string, target: Element) => ({ key, target, stopPropagation: vi.fn() }) as never as Parameters<typeof keepEditKeysInInput>[0] & { stopPropagation: ReturnType<typeof vi.fn> };
    for (const k of ['Backspace', 'Delete']) {
      const e = ev(k, input);
      keepEditKeysInInput(e);
      expect(e.stopPropagation).toHaveBeenCalled();
    }
    const other = ev('ArrowDown', input);
    keepEditKeysInInput(other);
    expect(other.stopPropagation).not.toHaveBeenCalled();
    const onBtn = ev('Backspace', btn);
    keepEditKeysInInput(onBtn);
    expect(onBtn.stopPropagation).not.toHaveBeenCalled();
  });
});

describe('带搜索框的弹窗：删字时退格不转发到列表', () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = '';
  });
  /** 打开后在输入框里按键：数一数有没有按键落到输入框以外的元素上（那就是转发的） */
  function forwarded(input: HTMLInputElement, keys: string[]) {
    const stray: string[] = [];
    const spy = (e: KeyboardEvent) => {
      if (e.target !== input) stray.push(`${e.key}@${(e.target as Element).getAttribute?.('role') ?? (e.target as Element).tagName}`);
    };
    document.addEventListener('keydown', spy, true);
    act(() => input.focus());
    for (const k of keys) press(input, k);
    document.removeEventListener('keydown', spy, true);
    return stray;
  }

  it('挑任务（先做完这些 / 做完后解锁 / 相关任务、新建面板的相关任务）', () => {
    const tasks = [{ id: 'a', body_md: '买菜', status: '待办', deleted: false }] as unknown as Task[];
    const store = { tasks: () => tasks, derived: () => new Map() } as unknown as Store;
    act(() => root.render(<TaskSearch store={store} exclude={new Set()} onPick={() => {}} onCreate={() => {}} />));
    const input = host.querySelector('input')!;
    const stray = forwarded(input, ['Backspace', 'Delete', 'ArrowDown', 'Backspace', 'Delete']);
    expect(stray.filter((s) => s.startsWith('Backspace') || s.startsWith('Delete'))).toEqual([]);
    // 方向键照样交给列表（Autocomplete 本来的用处）
    expect(stray.some((s) => s.startsWith('ArrowDown'))).toBe(true);
  });

  it('币种选择（资料的金额字段）', async () => {
    act(() => root.render(<CurrencySelect value="CNY" onChange={() => {}} />));
    const btn = host.querySelector('button')!;
    act(() => {
      btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
      btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerType: 'mouse' }));
      btn.click();
    });
    await act(async () => void (await new Promise((r) => setTimeout(r, 30))));
    const input = document.querySelector('.currency-search-input') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    const stray = forwarded(input!, ['Backspace', 'Delete', 'ArrowDown', 'Backspace']);
    expect(stray.filter((s) => s.startsWith('Backspace') || s.startsWith('Delete'))).toEqual([]);
  });
});
