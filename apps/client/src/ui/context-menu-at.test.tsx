// @vitest-environment happy-dom
/**
 * useContextMenuAt：默认右键 / 长按都出菜单；longPress: false 时手指长按不出、也不拦系统菜单（发出的日记正文长按走系统拷贝，Rei 2026-11-04），鼠标右键照常。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useContextMenuAt } from './primitives';
import { resetLongPressGuard } from '../lib/long-press';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

let lastConsume: (() => boolean) | null = null;
function Probe({ longPress, systemTouchMenu }: { longPress?: boolean; systemTouchMenu?: boolean }) {
  const m = useContextMenuAt(longPress === undefined ? undefined : { longPress, ...(systemTouchMenu === undefined ? {} : { systemTouchMenu }) });
  lastConsume = m.consumeLongPress;
  return <div id="t" data-open={m.at ? '1' : '0'} {...m.props} />;
}
const el = () => host.querySelector<HTMLElement>('#t')!;
const open = () => el().dataset.open === '1';
const down = (pointerType: string) =>
  act(() => void el().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType, clientX: 5, clientY: 5 })));
const ctx = () => {
  const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 });
  act(() => void el().dispatchEvent(e));
  return e;
};

beforeEach(() => {
  resetLongPressGuard();
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe('useContextMenuAt', () => {
  it('默认：手指长按 480ms 出菜单', () => {
    act(() => root.render(<Probe />));
    down('touch');
    act(() => void vi.advanceTimersByTime(500));
    expect(open()).toBe(true);
  });
  it('longPress: false：手指长按不出菜单，contextmenu 不拦（系统拷贝出得来）', () => {
    act(() => root.render(<Probe longPress={false} />));
    down('touch');
    act(() => void vi.advanceTimersByTime(500));
    expect(open()).toBe(false);
    const e = ctx();
    expect(e.defaultPrevented).toBe(false);
    expect(open()).toBe(false);
  });
  // Rei 2026-11-13 01:37「安卓端 长按任务还是会显示右键菜单，更改成不显示」
  it('longPress: false + systemTouchMenu: false（任务卡片）：手指长按不出菜单，系统菜单也拦掉', () => {
    act(() => root.render(<Probe longPress={false} systemTouchMenu={false} />));
    down('touch');
    act(() => void vi.advanceTimersByTime(800));
    expect(open()).toBe(false);
    const e = ctx();
    expect(e.defaultPrevented).toBe(true);
    expect(open()).toBe(false);
    // 认出了长按：松手那次点按要吞掉，不打开详情；只吞一次
    expect(lastConsume!()).toBe(true);
    expect(lastConsume!()).toBe(false);
  });
  it('longPress: false + systemTouchMenu: false：轻点不算长按', () => {
    act(() => root.render(<Probe longPress={false} systemTouchMenu={false} />));
    down('touch');
    act(() => void vi.advanceTimersByTime(200));
    act(() => void el().dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', clientX: 5, clientY: 5 })));
    act(() => void vi.advanceTimersByTime(600));
    expect(lastConsume!()).toBe(false);
  });
  it('longPress: false + systemTouchMenu: false：鼠标右键照常出菜单', () => {
    act(() => root.render(<Probe longPress={false} systemTouchMenu={false} />));
    down('mouse');
    const e = ctx();
    expect(e.defaultPrevented).toBe(true);
    expect(open()).toBe(true);
  });
  it('longPress: false：鼠标右键照常出菜单', () => {
    act(() => root.render(<Probe longPress={false} />));
    down('mouse');
    const e = ctx();
    expect(e.defaultPrevented).toBe(true);
    expect(open()).toBe(true);
  });

  // Rei 2026-11-05「安卓：滑动任务列表会触发右键菜单」
  const move = (pointerType: string, x: number, y: number) =>
    act(() => void el().dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType, clientX: x, clientY: y })));
  it('手指发的 contextmenu（Android 滑动时会发）：拦掉，不开菜单', () => {
    act(() => root.render(<Probe />));
    down('touch');
    const e = ctx();
    expect(e.defaultPrevented).toBe(true);
    expect(open()).toBe(false);
  });
  it('contextmenu 自己带 pointerType: touch：也不开', () => {
    act(() => root.render(<Probe />));
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 });
    Object.defineProperty(e, 'pointerType', { value: 'touch' });
    act(() => void el().dispatchEvent(e));
    expect(open()).toBe(false);
  });
  it('手指挪动超过 10px：长按作废', () => {
    act(() => root.render(<Probe />));
    down('touch');
    move('touch', 5, 20);
    act(() => void vi.advanceTimersByTime(600));
    expect(open()).toBe(false);
  });
  it('挪动不到 10px：还算长按', () => {
    act(() => root.render(<Probe />));
    down('touch');
    move('touch', 9, 9);
    act(() => void vi.advanceTimersByTime(500));
    expect(open()).toBe(true);
  });
  it('按着时列表滚动了：不开', () => {
    act(() => root.render(<Probe />));
    down('touch');
    act(() => void vi.advanceTimersByTime(200));
    act(() => void el().dispatchEvent(new Event('scroll')));
    act(() => void vi.advanceTimersByTime(400));
    expect(open()).toBe(false);
  });
  it('pointercancel（浏览器接手去滚）：不开', () => {
    act(() => root.render(<Probe />));
    down('touch');
    act(() => void el().dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerType: 'touch' })));
    act(() => void vi.advanceTimersByTime(600));
    expect(open()).toBe(false);
  });
  it('touchmove 挪远了（pointer 事件已经停了）：不开', () => {
    act(() => root.render(<Probe />));
    down('touch');
    const t = new Event('touchmove', { bubbles: true }) as TouchEvent;
    Object.defineProperty(t, 'touches', { value: [{ clientX: 5, clientY: 40 }] });
    act(() => void el().dispatchEvent(t));
    act(() => void vi.advanceTimersByTime(600));
    expect(open()).toBe(false);
  });
  it('鼠标右键照常出菜单', () => {
    act(() => root.render(<Probe />));
    down('mouse');
    const e = ctx();
    expect(e.defaultPrevented).toBe(true);
    expect(open()).toBe(true);
  });
});
