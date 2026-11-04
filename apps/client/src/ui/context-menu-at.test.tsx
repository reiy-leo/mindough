// @vitest-environment happy-dom
/**
 * useContextMenuAt：默认右键 / 长按都出菜单；longPress: false 时手指长按不出、也不拦系统菜单（发出的日记正文长按走系统拷贝，Rei 2026-11-04），鼠标右键照常。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useContextMenuAt } from './primitives';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

function Probe({ longPress }: { longPress?: boolean }) {
  const m = useContextMenuAt(longPress === undefined ? undefined : { longPress });
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
  it('longPress: false：鼠标右键照常出菜单', () => {
    act(() => root.render(<Probe longPress={false} />));
    down('mouse');
    const e = ctx();
    expect(e.defaultPrevented).toBe(true);
    expect(open()).toBe(true);
  });
});
