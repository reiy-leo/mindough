/**
 * 手指长按的共用判断（Rei 2026-11-05「安卓：滑动任务列表会触发右键菜单」）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { isTouchContextMenu, longPressStillValid, movedTooFar, noteScroll, recentlyScrolled, resetLongPressGuard, scrolledSince, SCROLL_QUIET_MS } from './long-press';

beforeEach(() => resetLongPressGuard());

describe('long-press', () => {
  it('挪动阈值 10px', () => {
    expect(movedTooFar({ x: 0, y: 0 }, { x: 6, y: 8 })).toBe(false);
    expect(movedTooFar({ x: 0, y: 0 }, { x: 0, y: 11 })).toBe(true);
  });
  it('按下以后滚过：长按作废', () => {
    noteScroll(1000);
    expect(scrolledSince(900)).toBe(true);
    expect(scrolledSince(1100)).toBe(false);
    expect(longPressStillValid(900, 2000)).toBe(false);
  });
  it('刚滚完不认长按，静下来以后认', () => {
    noteScroll(1000);
    expect(recentlyScrolled(1000 + SCROLL_QUIET_MS - 1)).toBe(true);
    expect(longPressStillValid(1100, 1100 + 100)).toBe(false);
    expect(longPressStillValid(1100, 1000 + SCROLL_QUIET_MS + 500)).toBe(true);
  });
  it('没滚过：认', () => {
    expect(longPressStillValid(0, 500)).toBe(true);
  });
  it('contextmenu 是不是手指发的', () => {
    expect(isTouchContextMenu({ pointerType: 'touch' } as unknown as Event)).toBe(true);
    expect(isTouchContextMenu({ pointerType: 'mouse' } as unknown as Event, 'touch')).toBe(false);
    expect(isTouchContextMenu({ nativeEvent: { sourceCapabilities: { firesTouchEvents: true } } })).toBe(true);
    expect(isTouchContextMenu({ nativeEvent: {} }, 'touch')).toBe(true);
    expect(isTouchContextMenu({ nativeEvent: {} }, 'mouse')).toBe(false);
    // 键盘菜单键：没按过
    expect(isTouchContextMenu({ nativeEvent: {} }, null)).toBe(false);
  });
});
