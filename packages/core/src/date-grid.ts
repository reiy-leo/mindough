/**
 * 日期面板的月历格子（Rei 2026-11-01 方案 A：一张月历，点一下就生效）。纯函数，界面在 apps/client DateGrid。
 *
 * - 公历月：按公历月翻页，格子 = 那个月的每一天。
 * - 农历月：按农历月翻页（闰月单独一页），格子 = 那个农历月的每一天，存的还是公历日期。
 *   react-aria 的 Calendar 和 @internationalized/date 都不支持中国农历，所以格子自己排。
 * - 两种都固定 6 行 × 7 列（42 格），翻页时面板高度不跳；前后补的格子 inMonth = false。
 * - 一周从哪天开始由调用方给（weekStartsOn()，跟着界面语言）。
 */
import { addDays, daysInMonth, diffDays, parseDateKey, weekday } from './dates';
import { lunarToSolar, lunarYearMonths, solarToLunar } from './lunar/lunar';
import { LUNAR_FIRST_YEAR, LUNAR_LAST_YEAR } from './lunar/data';
import type { DateKey } from './types';

export type GridKind = 'solar' | 'lunar';

/** 月历现在显示哪个月。农历的 year 是农历年。 */
export type MonthView = { kind: 'solar'; year: number; month: number } | { kind: 'lunar'; year: number; month: number; leap: boolean };

export interface GridCell {
  date: DateKey;
  /** 是不是这一页那个月的日子（前后补的是 false，显示成淡色）。 */
  inMonth: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const solarKey = (y: number, m: number, d: number): DateKey => `${y}-${pad(m)}-${pad(d)}`;

/** 从 first 那天所在的那一周排起，排满 42 格；[first, last] 之间的是 inMonth。 */
function cellsFrom(first: DateKey, last: DateKey, weekStart: 0 | 1): GridCell[] {
  const lead = (weekday(first) - weekStart + 7) % 7;
  const begin = addDays(first, -lead);
  return Array.from({ length: 42 }, (_, i) => {
    const date = addDays(begin, i);
    return { date, inMonth: date >= first && date <= last };
  });
}

/** 这一页的第一天和最后一天（公历）；农历范围外 null。 */
export function viewBounds(view: MonthView): { first: DateKey; last: DateKey } | null {
  if (view.kind === 'solar') return { first: solarKey(view.year, view.month, 1), last: solarKey(view.year, view.month, daysInMonth(view.year, view.month)) };
  const m = lunarYearMonths(view.year)?.find((x) => x.month === view.month && x.leap === view.leap);
  const first = m ? lunarToSolar({ year: view.year, month: view.month, day: 1, leap: view.leap }) : null;
  return m && first ? { first, last: addDays(first, m.days - 1) } : null;
}

/** 一页的 42 个格子；农历范围外返回空数组。 */
export function monthCells(view: MonthView, weekStart: 0 | 1): GridCell[] {
  const b = viewBounds(view);
  return b ? cellsFrom(b.first, b.last, weekStart) : [];
}

/** 把 42 格切成 6 行。 */
export function gridRows<T>(cells: readonly T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/** 某天所在的那一页；农历范围外（1900 年前、2100 年后）退回公历。 */
export function viewOf(date: DateKey, kind: GridKind): MonthView {
  if (kind === 'lunar') {
    const l = solarToLunar(date);
    if (l) return { kind: 'lunar', year: l.year, month: l.month, leap: l.leap };
  }
  const { y, m } = parseDateKey(date);
  return { kind: 'solar', year: y, month: m };
}

/** 这一页有没有这天（只算 inMonth 的）。 */
export function viewContains(view: MonthView, date: DateKey): boolean {
  const b = viewBounds(view);
  return !!b && date >= b.first && date <= b.last;
}

/** 往前 / 往后翻 n 个月。农历一个闰月算一页（六月 → 闰六月 → 七月）；翻出 1900–2100 返回 null。 */
export function stepView(view: MonthView, n: number): MonthView | null {
  if (view.kind === 'solar') {
    const idx = view.year * 12 + (view.month - 1) + n;
    const year = Math.floor(idx / 12);
    return { kind: 'solar', year, month: (idx % 12) + 1 };
  }
  let { year } = view;
  let months = lunarYearMonths(year);
  if (!months) return null;
  let i = months.findIndex((m) => m.month === view.month && m.leap === view.leap);
  if (i < 0) return null;
  i += n;
  while (i < 0 || i >= months.length) {
    if (i < 0) {
      year -= 1;
      const prev = lunarYearMonths(year);
      if (!prev) return null;
      i += prev.length;
      months = prev;
    } else {
      i -= months.length;
      year += 1;
      const next = lunarYearMonths(year);
      if (!next) return null;
      months = next;
    }
  }
  const m = months[i]!;
  return { kind: 'lunar', year, month: m.month, leap: m.leap };
}

/** 往前 / 往后翻 n 年：公历同一个月；农历同一个月，那年没这个闰月就落到同一个（非闰）月。 */
export function stepViewYear(view: MonthView, n: number): MonthView | null {
  if (view.kind === 'solar') return { ...view, year: view.year + n };
  const year = view.year + n;
  const months = lunarYearMonths(year);
  if (!months) return null;
  const leap = view.leap && months.some((m) => m.month === view.month && m.leap);
  return { kind: 'lunar', year, month: view.month, leap };
}

/** 能不能翻到上一页 / 下一页（农历到了 1900 / 2100 的头就不能）。 */
export function canStep(view: MonthView, n: number): boolean {
  const next = stepView(view, n);
  return !!next && !!viewBounds(next);
}

/**
 * 键盘 PageUp / PageDown（加 Shift 换年）：焦点挪到上 / 下一页的「同一天」。
 * 公历是同一个日子（31 号碰上小月取月末）；农历是同一个农历日子（三十碰上小月取廿九）。
 */
export function shiftFocus(date: DateKey, view: MonthView, n: number, unit: 'month' | 'year'): { date: DateKey; view: MonthView } | null {
  const next = unit === 'month' ? stepView(view, n) : stepViewYear(view, n);
  const b = next ? viewBounds(next) : null;
  if (!next || !b) return null;
  const cur = viewBounds(view);
  // 这一页的第几天（焦点可能在前后补的格子上，那就按最近的那头算）
  const idx = cur ? Math.max(0, Math.min(diffDays(cur.first, date), diffDays(cur.first, cur.last))) : 0;
  const len = diffDays(b.first, b.last);
  return { date: addDays(b.first, Math.min(idx, len)), view: next };
}

/** 农历能用的范围（公历）：1900-01-31 到 2100 年除夕。 */
export const LUNAR_GRID_RANGE = {
  first: lunarToSolar({ year: LUNAR_FIRST_YEAR, month: 1, day: 1, leap: false })!,
  last: (() => {
    const months = lunarYearMonths(LUNAR_LAST_YEAR)!;
    const lastM = months[months.length - 1]!;
    return lunarToSolar({ year: LUNAR_LAST_YEAR, month: lastM.month, day: lastM.days, leap: lastM.leap })!;
  })(),
};

// ───────── 点格子：单日、日期段（Rei 2026-11-01 方案 A，待确认第 1–3 条按建议）─────────

export interface DayClickState {
  start: DateKey | null;
  end: DateKey | null;
  /** 点了「+ 结束日」，正在等结束那天。 */
  waitingEnd?: boolean;
}

export interface DayClickResult {
  start: DateKey | null;
  end: DateKey | null;
  /** 选完了，弹层可以收起。 */
  done: boolean;
}

/**
 * 点了一天：
 * - 不能选日期段（canRange = false）或还没日期：就是这一天，选完。
 * - 单日、普通点：换成这一天，选完（第 1 条：点一下就存并收起）。
 * - 等结束日（点过「+ 结束日」）或按住 Shift 点：和开始日连成一段，早于开始日就把这天当开始、原来的开始当结束；点开始日本身还是单日。
 * - 已经是日期段、普通点或 Shift 点（第 3 条）：点在开始之前改开始；点在开始之后（段里面也算）改结束；点开始日本身不变。
 * 结果都是选完（done = true）。
 */
export function clickDay(state: DayClickState, day: DateKey, opts: { canRange: boolean; shift?: boolean }): DayClickResult {
  const { start, end } = state;
  if (!opts.canRange || !start) return { start: day, end: null, done: true };
  const ranged = !!end && end > start;
  if (ranged) {
    if (day < start) return { start: day, end, done: true };
    if (day > start) return { start, end: day, done: true };
    return { start, end, done: true };
  }
  if (state.waitingEnd || opts.shift) {
    if (day > start) return { start, end: day, done: true };
    if (day < start) return { start: day, end: start, done: true };
    return { start, end: null, done: true };
  }
  return { start: day, end: null, done: true };
}

/** 从 a 拖到 b（桌面拖选，第 2 条）：两头排好；同一天就是单日。 */
export function dragRange(a: DateKey, b: DateKey): { start: DateKey; end: DateKey | null } {
  if (a === b) return { start: a, end: null };
  return a < b ? { start: a, end: b } : { start: b, end: a };
}
