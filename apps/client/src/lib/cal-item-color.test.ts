import { describe, expect, it } from 'vitest';
import type { Task } from '@mindough/core';
import { calItemColors, calItemHex, CAL_ITEM_DEFAULT, CAL_ITEM_PLAIN } from './cal-item-color';
import { chipColors, contrastRatio, parseHex } from './chip-colors';

const groups: Record<string, { id: string; color: string | null }> = { g1: { id: 'g1', color: '#259d3c' } };
const cats: Record<string, { color: string }> = { c1: { color: '#dd6517' } };
const store = {
  get: (t: string, id: string) => (t === 'group' ? groups[id] : undefined),
  categoryOf: (t: { category_id: string | null }) => (t.category_id ? cats[t.category_id] : undefined),
} as never;
const task = (x: Partial<Task>) => ({ id: 't', group_id: null, category_id: null, card_color: null, ...x }) as Task;

describe('日历条目底色（Rei 2026-11-12）', () => {
  it('先项目、再类型、都没有用默认蓝；素净档一律灰', () => {
    expect(calItemHex(store, task({ group_id: 'g1', category_id: 'c1' }), 'standard')).toBe('#259d3c');
    expect(calItemHex(store, task({ category_id: 'c1' }), 'standard')).toBe('#dd6517');
    expect(calItemHex(store, task({}), 'standard')).toBe(CAL_ITEM_DEFAULT);
    expect(calItemHex(store, task({ group_id: 'g1' }), 'plain')).toBe(CAL_ITEM_PLAIN);
  });
  it('底色是实色（不靠 color-mix），字和底对比 ≥ 4.5:1，亮暗都是', () => {
    for (const theme of ['light', 'dark'] as const) {
      const c = calItemColors(store, task({ category_id: 'c1' }), false, theme, 'standard');
      expect(c.bg).toBe(chipColors('#dd6517', theme)!.bg);
      expect(contrastRatio(parseHex(c.fg)!, parseHex(c.bg)!)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('倒数日设了卡片颜色就用卡片颜色', () => {
    const a = calItemColors(store, task({ card_color: 'pink' }), true, 'light', 'standard');
    const b = calItemColors(store, task({ card_color: 'pink' }), false, 'light', 'standard');
    expect(a.bg).not.toBe(b.bg);
  });
});
