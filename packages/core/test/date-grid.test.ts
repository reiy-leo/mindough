import { describe, expect, it } from 'vitest';
import { canStep, clickDay, dragRange, gridRows, LUNAR_GRID_RANGE, monthCells, shiftFocus, stepView, stepViewYear, viewContains, viewOf, type MonthView } from '../src/index';

const inMonth = (v: MonthView, ws: 0 | 1 = 1) => monthCells(v, ws).filter((c) => c.inMonth).map((c) => c.date);

describe('公历月历格子', () => {
  it('固定 6 行 × 7 列；周一开头时 2026 年 10 月从 9 月 28 日排起', () => {
    const cells = monthCells({ kind: 'solar', year: 2026, month: 10 }, 1);
    expect(cells).toHaveLength(42);
    expect(gridRows(cells)).toHaveLength(6);
    expect(cells[0]).toEqual({ date: '2026-09-28', inMonth: false });
    expect(cells[3]).toEqual({ date: '2026-10-01', inMonth: true });
    expect(cells[41]).toEqual({ date: '2026-11-08', inMonth: false });
    expect(inMonth({ kind: 'solar', year: 2026, month: 10 })).toHaveLength(31);
  });

  it('周日开头：2026 年 11 月 1 日是周日，排在第一格', () => {
    expect(monthCells({ kind: 'solar', year: 2026, month: 11 }, 0)[0]).toEqual({ date: '2026-11-01', inMonth: true });
    expect(monthCells({ kind: 'solar', year: 2026, month: 11 }, 1)[0]!.date).toBe('2026-10-26');
  });

  it('闰年二月 29 天', () => {
    expect(inMonth({ kind: 'solar', year: 2028, month: 2 })).toHaveLength(29);
    expect(inMonth({ kind: 'solar', year: 2026, month: 2 })).toHaveLength(28);
  });

  it('翻月跨年', () => {
    expect(stepView({ kind: 'solar', year: 2026, month: 12 }, 1)).toEqual({ kind: 'solar', year: 2027, month: 1 });
    expect(stepView({ kind: 'solar', year: 2026, month: 1 }, -1)).toEqual({ kind: 'solar', year: 2025, month: 12 });
    expect(stepViewYear({ kind: 'solar', year: 2026, month: 3 }, -1)).toEqual({ kind: 'solar', year: 2025, month: 3 });
  });
});

describe('农历月历格子', () => {
  it('2026-10-29 在农历九月那页；九月初一 = 10 月 10 日（周六），30 天', () => {
    const v = viewOf('2026-10-29', 'lunar');
    expect(v).toEqual({ kind: 'lunar', year: 2026, month: 9, leap: false });
    const days = inMonth(v);
    expect(days[0]).toBe('2026-10-10');
    expect(days).toHaveLength(30);
    expect(days[29]).toBe('2026-11-08');
    // 周一开头：10 月 10 日是周六，前面补 5 格
    expect(monthCells(v, 1).findIndex((c) => c.inMonth)).toBe(5);
    expect(viewContains(v, '2026-11-08')).toBe(true);
    expect(viewContains(v, '2026-11-09')).toBe(false);
  });

  it('闰月单独一页：2025 年 六月 → 闰六月 → 七月', () => {
    const june: MonthView = { kind: 'lunar', year: 2025, month: 6, leap: false };
    const leap = stepView(june, 1)!;
    expect(leap).toEqual({ kind: 'lunar', year: 2025, month: 6, leap: true });
    expect(inMonth(leap)[0]).toBe('2025-07-25');
    expect(inMonth(leap)).toHaveLength(29);
    expect(stepView(leap, 1)).toEqual({ kind: 'lunar', year: 2025, month: 7, leap: false });
    expect(stepView(leap, -1)).toEqual(june);
    expect(viewOf('2025-08-01', 'lunar')).toEqual(leap);
  });

  it('翻过年：正月往前是上一年腊月；腊月往后是下一年正月', () => {
    expect(stepView({ kind: 'lunar', year: 2026, month: 1, leap: false }, -1)).toEqual({ kind: 'lunar', year: 2025, month: 12, leap: false });
    expect(stepView({ kind: 'lunar', year: 2025, month: 12, leap: false }, 1)).toEqual({ kind: 'lunar', year: 2026, month: 1, leap: false });
    // 2025 年有 13 个月：往后翻 13 页是下一年同一个月
    expect(stepView({ kind: 'lunar', year: 2025, month: 3, leap: false }, 13)).toEqual({ kind: 'lunar', year: 2026, month: 3, leap: false });
  });

  it('按年翻：那年没这个闰月就落到同一个月', () => {
    expect(stepViewYear({ kind: 'lunar', year: 2025, month: 6, leap: true }, 1)).toEqual({ kind: 'lunar', year: 2026, month: 6, leap: false });
  });

  it('到了 1900 / 2100 的头不能再翻', () => {
    expect(canStep({ kind: 'lunar', year: 1900, month: 1, leap: false }, -1)).toBe(false);
    expect(canStep({ kind: 'lunar', year: 1900, month: 1, leap: false }, 1)).toBe(true);
    expect(canStep({ kind: 'lunar', year: 2100, month: 12, leap: false }, 1)).toBe(false);
    expect(LUNAR_GRID_RANGE.first).toBe('1900-01-31');
    // 范围外退回公历
    expect(viewOf('1899-06-01', 'lunar')).toEqual({ kind: 'solar', year: 1899, month: 6 });
  });
});

describe('键盘翻页：焦点落在上 / 下一页的同一天', () => {
  it('公历：1 月 31 日 PageDown → 2 月 28 日', () => {
    expect(shiftFocus('2026-01-31', { kind: 'solar', year: 2026, month: 1 }, 1, 'month')).toEqual({ date: '2026-02-28', view: { kind: 'solar', year: 2026, month: 2 } });
    expect(shiftFocus('2026-10-29', { kind: 'solar', year: 2026, month: 10 }, -1, 'year')!.date).toBe('2025-10-29');
  });

  it('农历：九月三十 PageDown → 十月三十（十月 30 天）；闰六月廿九往前 → 六月廿九', () => {
    const r = shiftFocus('2026-11-08', { kind: 'lunar', year: 2026, month: 9, leap: false }, 1, 'month')!;
    expect(r.view).toEqual({ kind: 'lunar', year: 2026, month: 10, leap: false });
    expect(inMonth(r.view).indexOf(r.date)).toBe(29);
    const back = shiftFocus('2025-08-22', { kind: 'lunar', year: 2025, month: 6, leap: true }, -1, 'month')!;
    expect(back.view).toEqual({ kind: 'lunar', year: 2025, month: 6, leap: false });
    expect(inMonth(back.view).indexOf(back.date)).toBe(28);
  });
});

describe('点格子的规则', () => {
  const R = { canRange: true };
  it('没日期 / 不能选段：点哪天就是哪天，选完', () => {
    expect(clickDay({ start: null, end: null }, '2026-10-29', R)).toEqual({ start: '2026-10-29', end: null, done: true });
    expect(clickDay({ start: '2026-10-20', end: '2026-10-25' }, '2026-10-29', { canRange: false })).toEqual({ start: '2026-10-29', end: null, done: true });
  });

  it('单日普通点：换成那天', () => {
    expect(clickDay({ start: '2026-10-29', end: null }, '2026-11-02', R)).toEqual({ start: '2026-11-02', end: null, done: true });
  });

  it('点了「+ 结束日」：之后的日子当结束；之前的日子当开始、原来的开始当结束；点开始本身还是单日', () => {
    const s = { start: '2026-10-29', end: null, waitingEnd: true };
    expect(clickDay(s, '2026-11-08', R)).toEqual({ start: '2026-10-29', end: '2026-11-08', done: true });
    expect(clickDay(s, '2026-10-20', R)).toEqual({ start: '2026-10-20', end: '2026-10-29', done: true });
    expect(clickDay(s, '2026-10-29', R)).toEqual({ start: '2026-10-29', end: null, done: true });
  });

  it('Shift 点和「+ 结束日」一样', () => {
    expect(clickDay({ start: '2026-10-29', end: null }, '2026-11-08', { canRange: true, shift: true })).toEqual({ start: '2026-10-29', end: '2026-11-08', done: true });
  });

  it('已经是日期段：开始之前改开始，开始之后（含段里）改结束，点开始不变', () => {
    const s = { start: '2026-10-29', end: '2026-11-08' };
    expect(clickDay(s, '2026-10-20', R)).toEqual({ start: '2026-10-20', end: '2026-11-08', done: true });
    expect(clickDay(s, '2026-11-02', R)).toEqual({ start: '2026-10-29', end: '2026-11-02', done: true });
    expect(clickDay(s, '2026-11-20', R)).toEqual({ start: '2026-10-29', end: '2026-11-20', done: true });
    expect(clickDay(s, '2026-10-29', R)).toEqual({ start: '2026-10-29', end: '2026-11-08', done: true });
    expect(clickDay(s, '2026-11-02', { canRange: true, shift: true })).toEqual({ start: '2026-10-29', end: '2026-11-02', done: true });
  });

  it('拖选：两头排好，同一天是单日', () => {
    expect(dragRange('2026-11-08', '2026-10-29')).toEqual({ start: '2026-10-29', end: '2026-11-08' });
    expect(dragRange('2026-10-29', '2026-10-29')).toEqual({ start: '2026-10-29', end: null });
  });
});
