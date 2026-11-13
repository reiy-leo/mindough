/** 日历格子撑满、放不下收成「+N」、年视图挑列数（Rei 2026-11-13 09:44，lib/cal-fit）。 */
import { describe, expect, it } from 'vitest';
import { CAL_LANE_H, cutLanes, fitLanes, yearLayout } from './cal-fit';

describe('fitLanes', () => {
  it('没量到尺寸时不限', () => {
    expect(fitLanes(0, 26)).toBe(Infinity);
    expect(fitLanes(NaN, 26)).toBe(Infinity);
  });
  it('按一条 24px 算，日期那行和底下留白扣掉', () => {
    expect(CAL_LANE_H).toBe(24);
    expect(fitLanes(26 + 6 + 24 * 3, 26)).toBe(3);
    expect(fitLanes(26 + 6 + 24 * 3 - 1, 26)).toBe(2);
    expect(fitLanes(20, 26)).toBe(0);
  });
});

describe('cutLanes', () => {
  const at = (col: number, lane: number, span = 1) => ({ col, span, lane, id: `${col}-${lane}` });
  it('放得下：原样，没有 +N', () => {
    const placed = [at(0, 0), at(0, 1), at(1, 0)];
    const r = cutLanes(placed, 7, 2);
    expect(r.shown).toHaveLength(3);
    expect(r.more).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(r.moreLane).toBe(-1);
  });
  it('放不下：前 fit−1 条照画，最后一条位置换成 +N，按天数被收起的', () => {
    const placed = [at(0, 0), at(0, 1), at(0, 2), at(0, 3), at(1, 0)];
    const r = cutLanes(placed, 7, 3);
    expect(r.shown.map((x) => x.id)).toEqual(['0-0', '0-1', '1-0']);
    expect(r.more).toEqual([2, 0, 0, 0, 0, 0, 0]);
    expect(r.moreLane).toBe(2);
  });
  it('跨天横条压在被收起的道上：它覆盖的每天都算一件', () => {
    const placed = [at(0, 0), at(1, 1, 3), at(0, 2), at(2, 2)];
    const r = cutLanes(placed, 7, 2);
    expect(r.shown.map((x) => x.id)).toEqual(['0-0']);
    expect(r.more).toEqual([1, 1, 2, 1, 0, 0, 0]);
  });
  it('跨天横条在最后一条道上、覆盖的几天都放得下：照画', () => {
    const placed = [at(0, 0), at(0, 1), at(1, 1, 3), at(0, 2)];
    const r = cutLanes(placed, 7, 2);
    expect(r.shown.map((x) => x.id)).toEqual(['0-0', '1-1']);
    expect(r.more).toEqual([2, 0, 0, 0, 0, 0, 0]);
  });
  it('只多到最后一条的那天照画，不出「+1」；别的天放不下才收', () => {
    // 第 0 天 4 件（放不下），第 3 天正好 3 件（放得下）
    const placed = [at(0, 0), at(0, 1), at(0, 2), at(0, 3), at(3, 0), at(3, 1), at(3, 2)];
    const r = cutLanes(placed, 7, 3);
    expect(r.shown.map((x) => x.id)).toEqual(['0-0', '0-1', '3-0', '3-1', '3-2']);
    expect(r.more).toEqual([2, 0, 0, 0, 0, 0, 0]);
  });
  it('最后一条道上的横条只要碰到放不下的那天，就整条收起', () => {
    const placed = [at(0, 0), at(0, 1), at(0, 2, 2), at(0, 3)];
    const r = cutLanes(placed, 7, 3);
    expect(r.shown.map((x) => x.id)).toEqual(['0-0', '0-1']);
    expect(r.more).toEqual([2, 1, 0, 0, 0, 0, 0]);
  });
  it('一条都放不下：全收起，+N 在第 0 道', () => {
    const r = cutLanes([at(2, 0), at(2, 1)], 7, 0);
    expect(r.shown).toEqual([]);
    expect(r.more[2]).toBe(2);
    expect(r.moreLane).toBe(0);
  });
  it('周、多日一行占满（Rei 2026-11-13 10:24「周视图如果任务很多也收」）：高行放得下很多条，多出来的同样收成 +N', () => {
    // 1366×768 周视图一行约 600px：放 23 条
    const fit = fitLanes(600, 26);
    expect(fit).toBe(23);
    const placed = [...Array.from({ length: 30 }, (_, i) => at(1, i)), ...Array.from({ length: 23 }, (_, i) => at(4, i))];
    const r = cutLanes(placed, 7, fit);
    // 第 1 天 30 件：画 22 件，+8；第 4 天正好 23 件：全画
    expect(r.more).toEqual([0, 8, 0, 0, 0, 0, 0]);
    expect(r.moreLane).toBe(22);
    expect(r.shown.filter((x) => x.col === 1)).toHaveLength(22);
    expect(r.shown.filter((x) => x.col === 4)).toHaveLength(23);
  });
});

describe('yearLayout', () => {
  const opt = { gapX: 24, gapY: 12, titleH: 22 };
  it('没量到尺寸时返回 null（退回 CSS auto-fill）', () => {
    expect(yearLayout(0, 600, opt)).toBeNull();
  });
  it('宽屏横长：4 或 6 列', () => {
    const r = yearLayout(1100, 640, opt)!;
    expect([4, 6]).toContain(r.cols);
    expect(r.cols * r.rows).toBe(12);
  });
  it('手机竖长：3 列 4 行，格子不小于 14px', () => {
    const r = yearLayout(358, 640, { gapX: 12, gapY: 8, titleH: 18 })!;
    expect(r.cols).toBe(3);
    expect(r.rows).toBe(4);
    expect(Math.min(r.dayW, r.dayH)).toBeGreaterThanOrEqual(14);
  });
  it('排出来的总高不超过给的高度', () => {
    for (const [W, H] of [[1100, 640], [1700, 900], [358, 600], [800, 1000]] as const) {
      const r = yearLayout(W, H, opt)!;
      expect(r.rows * (opt.titleH + 7 * r.dayH) + (r.rows - 1) * opt.gapY).toBeLessThanOrEqual(H);
      expect(r.cols * 7 * r.dayW + (r.cols - 1) * opt.gapX).toBeLessThanOrEqual(W);
    }
  });
});
