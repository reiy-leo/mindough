import { describe, expect, it } from 'vitest';
import { swipeAxis, swipeOffset, swipeShouldClose } from './drawer-swipe';

describe('抽屉向左滑关掉（Rei 2026-11-15）', () => {
  it('挪得少不认方向；横着多是横滑，竖着多是滚动', () => {
    expect(swipeAxis(4, 3)).toBeNull();
    expect(swipeAxis(-20, 5)).toBe('x');
    expect(swipeAxis(-8, 30)).toBe('y');
  });
  it('只能往左跟手，不超过抽屉宽', () => {
    expect(swipeOffset(30, 300)).toBe(0);
    expect(swipeOffset(-50, 300)).toBe(-50);
    expect(swipeOffset(-500, 300)).toBe(-300);
  });
  it('拖过三成或甩得快就关，不然弹回', () => {
    expect(swipeShouldClose(-100, 0, 300)).toBe(true);
    expect(swipeShouldClose(-40, -0.1, 300)).toBe(false);
    expect(swipeShouldClose(-40, -0.8, 300)).toBe(true);
    expect(swipeShouldClose(-5, -0.8, 300)).toBe(false);
  });
});
