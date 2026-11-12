/**
 * 「一天从几点开始」（Rei 2026-11-13 01:16：挪到设置「时间」，「这个会更改我的一天、过期积压、日历、项目、打卡、倒数日、日记中的"一天"的范围」）。
 *
 * - 设置值、同步键不变：还是偏好 `journal.day_start`（0–23 整点，默认 5 点），老数据照用。
 * - 「逻辑今天」：还没到开始时间就算前一天。凌晨 2 点、开始时间 5 点 → 今天还是昨天那天。
 * - 某个时刻算哪天（dayOf）：打卡记在哪天、什么时候做完的、哪天建的，都按同一个规则，和「今天」对得上。
 * - 提醒按真实时钟响，不走这里。
 *
 * 全局一个值：Store 打开时接上（bindDayStart），之后每次读都现取偏好，同步过来的新值马上生效。
 * 没接 Store（纯函数单测）时按 0 点，等于原来按自然日算。
 */
import { addDays, toDateKey } from './dates';
import type { DateKey } from './types';

/** 默认 5 点（Rei 2026-10-17 定的日记默认值，挪过来照旧）。 */
export const DAY_START_DEFAULT = 5;
/** 同步的偏好键（原来是日记的，名字不改，老数据照用）。 */
export const DAY_START_PREF = 'journal.day_start';

/** pref 里存的值 → 0–23 的整点；不像就用默认。 */
export function normalizeDayStart(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : DAY_START_DEFAULT;
}

let source: (() => number) | null = null;

/** 接上开始时间的来源（Store.open 调）；传 null 断开，回到 0 点。 */
export function bindDayStart(fn: (() => number) | null): void {
  source = fn;
}

/** 现在的开始时间（0–23）。没接上来源是 0。 */
export function dayStartHour(): number {
  if (!source) return 0;
  const h = source();
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 0;
}

function zoneDateHour(ms: number, tz: string): { date: DateKey; hour: number } {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

/**
 * 这个时刻算哪一天：本地（或时区 tz）的日期，钟点还没到开始时间就算前一天。
 * at 可以是 Date、毫秒或 ISO 字符串；解析不了的字符串原样截前 10 位。
 */
export function dayOf(at: Date | number | string, tz?: string | null, hour: number = dayStartHour()): DateKey {
  const ms = at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(at);
  if (!Number.isFinite(ms)) return typeof at === 'string' ? at.slice(0, 10) : toDateKey(new Date());
  let date: DateKey;
  let h: number;
  if (tz) {
    try {
      ({ date, hour: h } = zoneDateHour(ms, tz));
    } catch {
      const d = new Date(ms);
      date = toDateKey(d);
      h = d.getHours();
    }
  } else {
    const d = new Date(ms);
    date = toDateKey(d);
    h = d.getHours();
  }
  return hour > 0 && h < hour ? addDays(date, -1) : date;
}

/** 逻辑今天：现在算哪一天（按开始时间；tz 空 = 设备时区）。 */
export function logicalToday(now: Date = new Date(), tz?: string | null, hour: number = dayStartHour()): DateKey {
  return dayOf(now, tz, hour);
}

/** 下一次换天的时刻（毫秒）：下一个开始时间整点（本机时区）。界面用它定时刷新「今天」。 */
export function nextDayBoundary(now: Date = new Date(), hour: number = dayStartHour()): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d.getTime();
}
