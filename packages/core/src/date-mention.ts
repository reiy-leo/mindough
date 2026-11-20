/**
 * @ 插进正文的日期、时间（Rei 2026-11-20 12:08「把@now这种生成的日期存在[]()这种链接格式，链接link部分加上__datetime:前缀，后加timestamp，
 * 链接名称部分默认格式是2026-11-20 和 2026-11-20 12:03这种。但如果设置中设定相对日期，则显示成相对日期+时区。」）。
 *
 * 存法：markdown 链接 `[2026-11-20 12:03](__datetime:<Unix 毫秒>)` / `[2026-11-20](__datetime:<当地 0 点的 Unix 毫秒>)`。
 * - 精度看方括号里的字：带 HH:mm 是日期时间，只有日期是一整天。
 * - 方括号里一直是插入时的绝对写法（本机时区），不随显示设置变；老客户端看到的是一条普通链接。
 * - 显示（编辑器胶囊、只读 Markdown）：设置 → 时间「编辑器里的日期」，绝对日期显示方括号里的字，相对日期显示「今天 12:03 · UTC+8」这种。
 *   「今天」按本机的自然日算（不管「一天从几点开始」），和插入时一样。
 */
import { formatDateStamp, formatNowStamp, type MentionStampKind } from './task-mention';
import { formatUtcOffset } from './timezone';

/** 地址前缀。 */
export const DATE_MENTION_PREFIX = '__datetime:';

/** 毫秒 → 地址。 */
export const dateMentionHref = (ms: number) => `${DATE_MENTION_PREFIX}${Math.trunc(ms)}`;

/** 地址是不是日期：是就返回毫秒。只收整数（可以是负的，1970 年以前），后面不能再带东西。 */
export function dateMentionMsOf(href: string | null | undefined): number | null {
  if (!href) return null;
  const m = /^__datetime:(-?\d{1,16})$/.exec(href.trim());
  if (!m) return null;
  const ms = Number(m[1]);
  return Number.isSafeInteger(ms) && Math.abs(ms) <= 8.64e15 ? ms : null;
}

export type DateMentionPrecision = 'date' | 'datetime';

/** 精度：方括号里的字带 HH:mm 就是日期时间，不带就是一整天。 */
export const dateMentionPrecision = (label: string): DateMentionPrecision => (/\d{1,2}:\d{2}/.test(label) ? 'datetime' : 'date');

/** 插进去的那一条：方括号里的字和毫秒。 */
export interface DateMention {
  label: string;
  ms: number;
}

/**
 * @ 某一项插进去的日期：当前时间到分钟（秒和毫秒去掉，和方括号里的字对得上），今天 / 明天 / 昨天是本机那天的 0 点。
 */
export function dateMentionFor(kind: MentionStampKind, now: Date = new Date()): DateMention {
  if (kind === 'datetime') {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
    return { label: formatNowStamp(at), ms: at.getTime() };
  }
  const shift = kind === 'tomorrow' ? 1 : kind === 'yesterday' ? -1 : 0;
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + shift);
  return { label: formatDateStamp(day), ms: day.getTime() };
}

/** 按精度写成绝对写法（本机时区）。 */
export const formatDateMention = (ms: number, precision: DateMentionPrecision) => (precision === 'datetime' ? formatNowStamp(new Date(ms)) : formatDateStamp(new Date(ms)));

/** 本机日历上 ms 那天比 now 那天晚几天（负的是以前）；按自然日，不按 24 小时。 */
export function calendarDayDiff(ms: number, now: Date): number {
  const d = new Date(ms);
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86_400_000);
}

/** 相对显示要的几样：差几天、时刻（只有日期时间才有）、本机在那一刻的时区（「UTC+8」）。文字由界面按语言拼。 */
export interface RelativeDateParts {
  days: number;
  time: string | null;
  zone: string;
}

export function relativeDateParts(ms: number, precision: DateMentionPrecision, now: Date = new Date()): RelativeDateParts {
  const d = new Date(ms);
  const time = precision === 'datetime' ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : null;
  return { days: calendarDayDiff(ms, now), time, zone: formatUtcOffset(-d.getTimezoneOffset()) };
}

/** 设置 → 时间「编辑器里的日期」（同步的偏好）：绝对日期（默认）/ 相对日期。 */
export const DATE_MENTION_DISPLAY_PREF = 'editor.date_display';
export type DateMentionDisplay = 'absolute' | 'relative';
export const normalizeDateMentionDisplay = (v: unknown): DateMentionDisplay => (v === 'relative' ? 'relative' : 'absolute');
