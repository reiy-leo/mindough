// @vitest-environment happy-dom
/** 一行横滑的小工具（Rei 2026-11-16 心情选择改成一行）。 */
import { describe, expect, it } from 'vitest';
import { markMore, wheelDelta } from './hscroll';

const el = (scrollLeft: number, scrollWidth = 1000, clientWidth = 300) => ({ scrollLeft, scrollWidth, clientWidth });
const wheel = (deltaY: number, deltaX = 0, extra: Partial<WheelEvent> = {}) => ({ deltaX, deltaY, deltaMode: 0, ctrlKey: false, ...extra });

describe('wheelDelta：竖着滚的滚轮让这一行横着走', () => {
  it('竖向滚：往下 = 往后，往上 = 往前', () => {
    expect(wheelDelta(wheel(100), el(0))).toBe(100);
    expect(wheelDelta(wheel(-100), el(200))).toBe(-100);
  });
  it('触控板横滑（横向分量大）、Ctrl 缩放、放得下不用滑：不接手', () => {
    expect(wheelDelta(wheel(10, 40), el(0))).toBe(0);
    expect(wheelDelta(wheel(100, 0, { ctrlKey: true }), el(0))).toBe(0);
    expect(wheelDelta(wheel(100), el(0, 300, 300))).toBe(0);
  });
  it('滚到头了再往那头滚，交给外面', () => {
    expect(wheelDelta(wheel(-100), el(0))).toBe(0);
    expect(wheelDelta(wheel(100), el(700))).toBe(0);
  });
  it('按行、按页滚换成像素', () => {
    expect(wheelDelta(wheel(3, 0, { deltaMode: 1 }), el(0))).toBe(48);
    expect(wheelDelta(wheel(1, 0, { deltaMode: 2 }), el(0))).toBe(300);
  });
  it('从右往左的语言：scrollLeft 是负的，往下滚 = 往左', () => {
    expect(wheelDelta(wheel(100), el(0), true)).toBe(-100);
    expect(wheelDelta(wheel(-100), el(0), true)).toBe(0);
    expect(wheelDelta(wheel(100), el(-700), true)).toBe(0);
  });
});

describe('markMore：两头还有没有藏着的', () => {
  it('按滚动位置打 data-more-start / data-more-end', () => {
    const d = document.createElement('div');
    Object.defineProperty(d, 'scrollWidth', { value: 1000 });
    Object.defineProperty(d, 'clientWidth', { value: 300 });
    d.scrollLeft = 0;
    markMore(d);
    expect([d.hasAttribute('data-more-start'), d.hasAttribute('data-more-end')]).toEqual([false, true]);
    d.scrollLeft = 300;
    markMore(d);
    expect([d.hasAttribute('data-more-start'), d.hasAttribute('data-more-end')]).toEqual([true, true]);
    d.scrollLeft = 700;
    markMore(d);
    expect([d.hasAttribute('data-more-start'), d.hasAttribute('data-more-end')]).toEqual([true, false]);
  });
});
