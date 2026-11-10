/**
 * 日历页的视图（Rei 2026-11-10，docs/CALENDAR.md）：周、月、年、多日（2–14 天）、多周（1–6 周）。
 * 这里只算「看哪几天、怎么翻页、任务怎么排进格子」，不碰 DOM。
 */
import { addDays, compareDateKey, daysInMonth, diffDays, parseDateKey, startOfWeek } from '../dates';
import type { DateKey } from '../types';

export type CalViewKind = 'week' | 'month' | 'year' | 'days' | 'weeks';
export const CAL_VIEW_KINDS: readonly CalViewKind[] = ['week', 'month', 'year', 'days', 'weeks'];

export interface CalView {
  kind: CalViewKind;
  /** 多日的天数（2–14）。 */
  days: number;
  /** 多周的周数（1–6）。 */
  weeks: number;
}

export const DAYS_MIN = 2;
export const DAYS_MAX = 14;
export const WEEKS_MIN = 1;
export const WEEKS_MAX = 6;
/** 默认「周」（Rei 2026-11-11 定；之前是月）。已经记住视图的设备照旧。 */
export const DEFAULT_CAL_VIEW: CalView = { kind: 'week', days: 3, weeks: 2 };

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : dflt;
  return Math.min(hi, Math.max(lo, n));
};

/** 本机存的视图读回来（坏值回默认）。 */
export function normalizeCalView(v: unknown): CalView {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<CalView>;
  return {
    kind: CAL_VIEW_KINDS.includes(o.kind as CalViewKind) ? (o.kind as CalViewKind) : DEFAULT_CAL_VIEW.kind,
    days: clampInt(o.days, DAYS_MIN, DAYS_MAX, DEFAULT_CAL_VIEW.days),
    weeks: clampInt(o.weeks, WEEKS_MIN, WEEKS_MAX, DEFAULT_CAL_VIEW.weeks),
  };
}

export interface CalRange {
  /** 画出来的第一天、最后一天（含）。月视图排满整周，含上下月的几天。 */
  from: DateKey;
  to: DateKey;
  /** 按行分好的天（周、月、多周每行 7 天；多日一行 N 天；年视图为空，另用 yearMonths）。 */
  rows: DateKey[][];
  /** 「这一段」真正的范围（月视图 = 这个月的 1 号到月底），格子外的天淡显。 */
  coreFrom: DateKey;
  coreTo: DateKey;
}

const firstOfMonth = (d: DateKey) => `${d.slice(0, 7)}-01`;
const lastOfMonth = (d: DateKey) => {
  const { y, m } = parseDateKey(d);
  return `${d.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
};

function chunk(from: DateKey, n: number, size: number): DateKey[][] {
  const rows: DateKey[][] = [];
  for (let i = 0; i < n; i += size) {
    const row: DateKey[] = [];
    for (let j = i; j < Math.min(n, i + size); j++) row.push(addDays(from, j));
    rows.push(row);
  }
  return rows;
}

/** 某个视图在 anchor（翻到的那天）时画哪些天。weekStart：0 周日开始、1 周一开始。 */
export function calRange(view: CalView, anchor: DateKey, weekStart: 0 | 1): CalRange {
  switch (view.kind) {
    case 'week': {
      const from = startOfWeek(anchor, weekStart);
      const to = addDays(from, 6);
      return { from, to, rows: chunk(from, 7, 7), coreFrom: from, coreTo: to };
    }
    case 'weeks': {
      const from = startOfWeek(anchor, weekStart);
      const n = view.weeks * 7;
      const to = addDays(from, n - 1);
      return { from, to, rows: chunk(from, n, 7), coreFrom: from, coreTo: to };
    }
    case 'days': {
      const to = addDays(anchor, view.days - 1);
      return { from: anchor, to, rows: chunk(anchor, view.days, view.days), coreFrom: anchor, coreTo: to };
    }
    case 'month': {
      const first = firstOfMonth(anchor);
      const last = lastOfMonth(anchor);
      const from = startOfWeek(first, weekStart);
      const to = addDays(startOfWeek(last, weekStart), 6);
      const n = diffDays(from, to) + 1;
      return { from, to, rows: chunk(from, n, 7), coreFrom: first, coreTo: last };
    }
    case 'year': {
      const y = anchor.slice(0, 4);
      return { from: `${y}-01-01`, to: `${y}-12-31`, rows: [], coreFrom: `${y}-01-01`, coreTo: `${y}-12-31` };
    }
  }
}

function addMonths(d: DateKey, n: number): DateKey {
  const { y, m, d: day } = parseDateKey(d);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  const dd = Math.min(day, daysInMonth(ny, nm));
  return `${ny}-${String(nm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/** 往前 / 往后翻一段：周一周、月一月、年一年、多日 N 天、多周 N 周。 */
export function stepCalAnchor(view: CalView, anchor: DateKey, dir: 1 | -1): DateKey {
  switch (view.kind) {
    case 'week':
      return addDays(anchor, 7 * dir);
    case 'weeks':
      return addDays(anchor, 7 * view.weeks * dir);
    case 'days':
      return addDays(anchor, view.days * dir);
    case 'month':
      return addMonths(anchor, dir);
    case 'year':
      return addMonths(anchor, 12 * dir);
  }
}

/** 年视图：12 个月，每个月排满整周的格子（null = 空位）。 */
export function yearMonths(year: number, weekStart: 0 | 1): Array<{ month: number; cells: Array<DateKey | null> }> {
  const out: Array<{ month: number; cells: Array<DateKey | null> }> = [];
  for (let m = 1; m <= 12; m++) {
    const first = `${year}-${String(m).padStart(2, '0')}-01`;
    const lead = diffDays(startOfWeek(first, weekStart), first);
    const cells: Array<DateKey | null> = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= daysInMonth(year, m); d++) cells.push(`${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    while (cells.length % 7) cells.push(null);
    out.push({ month: m, cells });
  }
  return out;
}

/** 一件要排进格子的东西：任务或订阅事件，start / end 是日期（含）。 */
export interface CalSpanItem {
  id: string;
  start: DateKey;
  end: DateKey;
}

export interface CalPlaced<T extends CalSpanItem> {
  item: T;
  /** 这一行里从第几格到第几格（含，0 起）。 */
  col: number;
  span: number;
  /** 第几条道（从上往下，0 起）。 */
  lane: number;
  /** 这一段之前 / 之后还有（跨行断开时画缺口）。 */
  contLeft: boolean;
  contRight: boolean;
}

/**
 * 把一行（连续的几天）里的东西排成道：多天的先排、长的先排，同一条道不重叠。
 * 返回每件的位置，和每格（按列）一共压了多少件（「还有 N 件」用）。
 */
export function layoutRow<T extends CalSpanItem>(row: readonly DateKey[], items: readonly T[]): { placed: CalPlaced<T>[]; perDay: number[] } {
  const first = row[0];
  const last = row[row.length - 1];
  const perDay = row.map(() => 0);
  if (!first || !last) return { placed: [], perDay };
  const inRow = items
    .filter((it) => compareDateKey(it.start, last) <= 0 && compareDateKey(it.end, first) >= 0)
    .map((it) => {
      const s = compareDateKey(it.start, first) < 0 ? first : it.start;
      const e = compareDateKey(it.end, last) > 0 ? last : it.end;
      return { it, col: diffDays(first, s), span: diffDays(s, e) + 1, total: diffDays(it.start, it.end) + 1 };
    })
    .sort((a, b) => a.col - b.col || b.total - a.total || (a.it.id < b.it.id ? -1 : 1));
  const lanes: number[][] = []; // 每条道已占的列
  const placed: CalPlaced<T>[] = [];
  for (const x of inRow) {
    let lane = 0;
    for (; ; lane++) {
      const used = lanes[lane] ?? (lanes[lane] = []);
      let free = true;
      for (let c = x.col; c < x.col + x.span; c++) if (used.includes(c)) free = false;
      if (free) {
        for (let c = x.col; c < x.col + x.span; c++) used.push(c);
        break;
      }
    }
    for (let c = x.col; c < x.col + x.span; c++) perDay[c]! += 1;
    placed.push({ item: x.it, col: x.col, span: x.span, lane, contLeft: compareDateKey(x.it.start, first) < 0, contRight: compareDateKey(x.it.end, last) > 0 });
  }
  return { placed, perDay };
}

/** 某天有哪些（按开始日、长短排）。 */
export function itemsOnDay<T extends CalSpanItem>(day: DateKey, items: readonly T[]): T[] {
  return items.filter((it) => compareDateKey(it.start, day) <= 0 && compareDateKey(it.end, day) >= 0);
}

/** 月视图格子里的一件：任务、打卡、倒数日、订阅事件。 */
export type CalItemRole = 'countdown' | 'task' | 'checkin' | 'event';
export interface CalCellItem extends CalSpanItem {
  role: CalItemRole;
  /** 订阅事件：全天的排在带时间的前面，带时间的按开始时间。 */
  allDay?: boolean;
  startMs?: number | null;
}

/**
 * 月视图一格（Rei 2026-11-11「每个格子只显示一个任务；当天有倒数日时优先显示倒数日；另显示当天任务+打卡+倒数日的个数」）：
 * - 只挑一件：倒数日 → 任务（那天开始的在前，再按短的在前）→ 订阅事件（全天在前，再按时间）。打卡不挑（每天都有的话会占满整月）。
 * - count：这天的任务 + 打卡 + 倒数日，订阅事件不算。
 * 同一档里保持传进来的顺序。
 */
export function monthCell<T extends CalCellItem>(day: DateKey, items: readonly T[]): { shown: T | null; count: number } {
  const on = itemsOnDay(day, items);
  const count = on.filter((it) => it.role !== 'event').length;
  const rank = (it: T) => (it.role === 'countdown' ? 0 : it.role === 'task' ? 1 : it.role === 'event' ? 2 : 9);
  const pickable = on
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => rank(it) < 9)
    .sort((a, b) => {
      const r = rank(a.it) - rank(b.it);
      if (r) return r;
      if (a.it.role === 'task') {
        const sa = a.it.start === day ? 0 : 1;
        const sb = b.it.start === day ? 0 : 1;
        const len = diffDays(a.it.start, a.it.end) - diffDays(b.it.start, b.it.end);
        if (sa - sb || len) return sa - sb || len;
      }
      if (a.it.role === 'event') {
        const ad = a.it.allDay ? 0 : 1;
        const bd = b.it.allDay ? 0 : 1;
        if (ad - bd) return ad - bd;
        const t = (a.it.startMs ?? 0) - (b.it.startMs ?? 0);
        if (t) return t;
      }
      return a.i - b.i;
    });
  return { shown: pickable[0]?.it ?? null, count };
}
