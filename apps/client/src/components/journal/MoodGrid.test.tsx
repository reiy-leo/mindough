// @vitest-environment happy-dom
/** 选心情改成一行横滑（Rei 2026-11-16）：31 个排一行，键盘 ← → / Home / End 挪，竖着滚的滚轮横着走。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MOOD_IDS } from '@mindough/core';
import { MoodGrid } from './MoodGrid';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
});

const grid = () => host.querySelector('.jmood-grid') as HTMLDivElement;
const opts = () => [...host.querySelectorAll<HTMLButtonElement>('.jmood-opt')];
const key = (k: string) => act(() => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })));

describe('MoodGrid', () => {
  it('31 个按 MOOD_IDS 的顺序排成一行，已选的标出来', () => {
    act(() => root.render(<MoodGrid value="sick" onPick={() => {}} />));
    expect(opts()).toHaveLength(31);
    expect(opts().map((b) => b.querySelector('svg')!.getAttribute('class')!.match(/mood-(?!icon\b)([a-z]+)/)![1])).toEqual([...MOOD_IDS]);
    expect(opts().filter((b) => b.classList.contains('is-selected'))).toHaveLength(1);
    expect(opts()[30]!.classList.contains('is-selected')).toBe(true);
    expect(opts()[30]!.textContent).toBe('生病');
  });

  it('键盘：→ 下一个，← 上一个，End 最后，Home 第一个', () => {
    act(() => root.render(<MoodGrid value={null} onPick={() => {}} />));
    act(() => opts()[0]!.focus());
    key('ArrowRight');
    expect(document.activeElement).toBe(opts()[1]);
    key('ArrowLeft');
    expect(document.activeElement).toBe(opts()[0]);
    key('ArrowLeft');
    expect(document.activeElement).toBe(opts()[0]);
    key('End');
    expect(document.activeElement).toBe(opts()[30]);
    key('Home');
    expect(document.activeElement).toBe(opts()[0]);
  });

  it('竖着滚的滚轮让这一行横着走，并且不再往外传', () => {
    act(() => root.render(<MoodGrid value={null} onPick={() => {}} />));
    const g = grid();
    Object.defineProperty(g, 'scrollWidth', { configurable: true, value: 2100 });
    Object.defineProperty(g, 'clientWidth', { configurable: true, value: 340 });
    const ev = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    const spy = vi.spyOn(ev, 'preventDefault');
    act(() => void g.dispatchEvent(ev));
    expect(g.scrollLeft).toBe(120);
    expect(spy).toHaveBeenCalled();
  });

  it('点已选的那个 = 取消', () => {
    const onPick = vi.fn();
    act(() => root.render(<MoodGrid value="hopeful" onPick={onPick} />));
    const b = opts()[12]!;
    act(() => {
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, pointerId: 1, isPrimary: true }));
      b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, pointerId: 1, isPrimary: true }));
      b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail: 1 }));
    });
    expect(onPick).toHaveBeenCalledWith(null);
  });
});
