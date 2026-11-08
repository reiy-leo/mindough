// @vitest-environment happy-dom
/** 详情顶栏心情按钮（Rei 2026-11-08 23:44「任务详情 顶部工具栏添加一个心情按钮，点击后可以换心情」）。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryAdapter, Store } from '@mindough/core';

vi.mock('../../ui/primitives', () => ({ Tip: ({ children }: { children: ReactNode }) => <>{children}</> }));

import { MoodQuickButton } from './MoodQuickButton';
import { canHaveMood } from '../../lib/prop-chips';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let store: Store;
beforeEach(async () => {
  store = await Store.open(new MemoryAdapter(), { deviceId: 'd' });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

const render = (id: string, isDisabled = false) => act(() => root.render(<MoodQuickButton store={store} task={store.get('task', id)!} isDisabled={isDisabled} />));
const btn = () => host.querySelector('.mood-quick') as HTMLButtonElement;
function click(el: Element) {
  act(() => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, pointerId: 1, isPrimary: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, pointerId: 1, isPrimary: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail: 1 }));
  });
}

describe('详情顶栏心情按钮', () => {
  it('没心情：暗淡的加号笑脸，读作「设置心情」；点开选一张就记上', () => {
    const t = store.createTask({ body_md: 'a' }, { joinMyDay: false });
    render(t.id);
    expect(btn().getAttribute('aria-label')).toBe('设置心情');
    expect(btn().classList.contains('is-set')).toBe(false);
    click(btn());
    const opts = document.querySelectorAll('.jmood-opt');
    expect(opts.length).toBe(12);
    click(opts[0]!);
    expect(store.get('task', t.id)!.mood).toBeTruthy();
  });

  it('有心情：显示那张脸，读作「心情：名字」；点已选的那张取消', () => {
    const t = store.createTask({ body_md: 'a' }, { joinMyDay: false });
    store.updateTask(t.id, { mood: 'happy' });
    render(t.id);
    expect(btn().getAttribute('aria-label')).toMatch(/^心情：/);
    expect(btn().classList.contains('is-set')).toBe(true);
    // 心情色（Rei 23:49）：按钮的 color 是这个心情的令牌，淡底在 CSS 里按 currentColor 混
    expect(btn().style.color).toBe('var(--mood-happy)');
    click(btn());
    const sel = document.querySelector('.jmood-opt.is-selected')!;
    click(sel);
    expect(store.get('task', t.id)!.mood ?? null).toBeNull();
  });

  it('锁住时灰掉', () => {
    const t = store.createTask({ body_md: 'a' }, { joinMyDay: false });
    render(t.id, true);
    expect(btn().disabled || btn().hasAttribute('data-disabled')).toBe(true);
  });

  it('只给能有心情的任务：重复、倒数日没有', () => {
    expect(canHaveMood({ recurrence: null, completion_mode: 'once' })).toBe(true);
    expect(canHaveMood({ recurrence: null, completion_mode: 'count' })).toBe(true);
    expect(canHaveMood({ recurrence: null, completion_mode: 'timer' })).toBe(true);
    expect(canHaveMood({ recurrence: 'FREQ=DAILY', completion_mode: 'count' })).toBe(false);
    expect(canHaveMood({ recurrence: null, completion_mode: 'countdown' })).toBe(false);
  });
});
