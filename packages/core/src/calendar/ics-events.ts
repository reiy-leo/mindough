/**
 * 日历订阅的事件解析（Rei 2026-11-10，docs/CALENDAR.md「解析」）：比节假日订阅（lunar/ics.ts，只要日期和名字）多取时间、时区、地点、备注，展开重复。
 * 折行沿用 lunar/ics.ts 的 unfoldIcs。没用第三方库。
 * - 全天（VALUE=DATE）/ 带时间；DTEND 或 DURATION。
 * - 时区：Z、TZID=<IANA>（Intl 换算）、常见 Windows 时区名、没写的浮动时间按设备时区。
 * - RRULE：DAILY / WEEKLY / MONTHLY / YEARLY + INTERVAL、COUNT、UNTIL、BYDAY（含「第几个星期几」）、BYMONTHDAY、BYMONTH；EXDATE；RECURRENCE-ID 换掉那一次。
 * - STATUS:CANCELLED 不要。
 */
import { addDays, compareDateKey, daysInMonth, diffDays, parseDateKey, toDateKey, weekday } from '../dates';
import { looksLikeIcs, unfoldIcs } from '../lunar/ics';
import type { DateKey } from '../types';

export interface IcsEvent {
  /** 这一次的 key（UID + 开始），同一订阅里唯一。 */
  key: string;
  title: string;
  allDay: boolean;
  /** 全天：开始、结束日（含，按日历上的日子，不换算时区）。 */
  startDate: DateKey;
  endDate: DateKey;
  /** 带时间：开始、结束（UTC 毫秒）；全天时为 null。 */
  startMs: number | null;
  endMs: number | null;
  location: string;
  description: string;
}

export const MAX_CAL_EVENTS = 5000;
const MAX_ITER = 20_000;

/** 文本属性的转义：\n 是换行，\, \; \\ 原样。 */
function unescapeText(v: string): string {
  return v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c)).trim();
}

const WINDOWS_TZ: Record<string, string> = {
  'china standard time': 'Asia/Shanghai',
  'taipei standard time': 'Asia/Taipei',
  'tokyo standard time': 'Asia/Tokyo',
  'korea standard time': 'Asia/Seoul',
  'singapore standard time': 'Asia/Singapore',
  'india standard time': 'Asia/Kolkata',
  'pacific standard time': 'America/Los_Angeles',
  'mountain standard time': 'America/Denver',
  'central standard time': 'America/Chicago',
  'eastern standard time': 'America/New_York',
  'gmt standard time': 'Europe/London',
  'greenwich standard time': 'Atlantic/Reykjavik',
  'w. europe standard time': 'Europe/Berlin',
  'romance standard time': 'Europe/Paris',
  'central europe standard time': 'Europe/Budapest',
  'central european standard time': 'Europe/Warsaw',
  'e. europe standard time': 'Europe/Chisinau',
  'russian standard time': 'Europe/Moscow',
  'aus eastern standard time': 'Australia/Sydney',
  'new zealand standard time': 'Pacific/Auckland',
  'utc': 'UTC',
};

const tzOk = new Map<string, boolean>();
function validTz(tz: string): boolean {
  let ok = tzOk.get(tz);
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      ok = true;
    } catch {
      ok = false;
    }
    tzOk.set(tz, ok);
  }
  return ok;
}

/** TZID 参数 → IANA 名；认不出返回 null（当浮动时间）。 */
export function resolveTzid(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/^"|"$/g, '').trim();
  const win = WINDOWS_TZ[s.toLowerCase()];
  if (win) return win;
  if (validTz(s)) return s;
  // 「/mozilla.org/20050126_1/Europe/Berlin」这类：取后两段
  const parts = s.split('/').filter(Boolean);
  for (let i = Math.max(0, parts.length - 3); i < parts.length - 1; i++) {
    const cand = parts.slice(i).join('/');
    if (validTz(cand)) return cand;
  }
  return null;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function tzOffsetMs(ms: number, tz: string): number {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    fmtCache.set(tz, f);
  }
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  const wall = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour! % 24, p.minute!, p.second!);
  return wall - Math.floor(ms / 1000) * 1000;
}

interface Wall {
  date: DateKey;
  h: number;
  mi: number;
  s: number;
}

/** 某时区的墙上时间 → UTC 毫秒（tz 为 null 用设备时区，'UTC' 为 UTC）。 */
export function wallToMs(w: Wall, tz: string | null): number {
  const { y, m, d } = parseDateKey(w.date);
  if (!tz) return new Date(y, m - 1, d, w.h, w.mi, w.s).getTime();
  const guess = Date.UTC(y, m - 1, d, w.h, w.mi, w.s);
  if (tz === 'UTC') return guess;
  let ms = guess - tzOffsetMs(guess, tz);
  const off2 = tzOffsetMs(ms, tz);
  ms = guess - off2;
  return ms;
}

interface DtValue {
  allDay: boolean;
  wall: Wall;
  tz: string | null;
}

function parseDt(value: string, params: Record<string, string>): DtValue | null {
  const v = value.trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  const { m: mo, d } = parseDateKey(date);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (!m[4] || params.VALUE === 'DATE') return { allDay: true, wall: { date, h: 0, mi: 0, s: 0 }, tz: null };
  return { allDay: false, wall: { date, h: Number(m[4]), mi: Number(m[5]), s: Number(m[6] ?? 0) }, tz: m[7] ? 'UTC' : resolveTzid(params.TZID) };
}

/** P1DT2H30M / PT45M / P1W → 毫秒。 */
function durationMs(v: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return null;
  const n = (i: number) => Number(m[i] ?? 0);
  const ms = (((n(2) * 7 + n(3)) * 24 + n(4)) * 60 + n(5)) * 60_000 + n(6) * 1000;
  return m[1] === '-' ? -ms : ms;
}

interface Raw {
  uid: string;
  summary: string;
  location: string;
  description: string;
  status: string;
  start?: DtValue;
  end?: DtValue;
  duration?: number | null;
  rrule?: string;
  exdates: DtValue[];
  recurrenceId?: DtValue;
}

function parseLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  // 冒号可能出现在带引号的参数里：找第一个不在引号里的冒号
  let q = false;
  let i = 0;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === ':' && !q) break;
  }
  if (i >= line.length) return null;
  const head = line.slice(0, i);
  const value = line.slice(i + 1);
  const [name, ...ps] = head.split(';');
  const params: Record<string, string> = {};
  for (const p of ps) {
    const j = p.indexOf('=');
    if (j > 0) params[p.slice(0, j).toUpperCase()] = p.slice(j + 1);
  }
  return { name: name!.toUpperCase(), params, value };
}

const DOW: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

interface Rule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  count: number | null;
  until: DtValue | null;
  byday: Array<{ n: number; dow: number }>;
  bymonthday: number[];
  bymonth: number[];
}

function parseRule(s: string): Rule | null {
  const parts = new Map<string, string>();
  for (const p of s.split(';')) {
    const j = p.indexOf('=');
    if (j > 0) parts.set(p.slice(0, j).toUpperCase(), p.slice(j + 1).toUpperCase());
  }
  const freq = parts.get('FREQ');
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null;
  if (parts.has('RSCALE')) return null;
  const byday = (parts.get('BYDAY') ?? '')
    .split(',')
    .filter(Boolean)
    .map((x) => {
      const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x);
      return m ? { n: m[1] ? Number(m[1]) : 0, dow: DOW[m[2]!]! } : null;
    })
    .filter((x): x is { n: number; dow: number } => !!x);
  const nums = (k: string) => (parts.get(k) ?? '').split(',').filter(Boolean).map(Number).filter((n) => Number.isFinite(n) && n !== 0);
  const until = parts.get('UNTIL') ? parseDt(parts.get('UNTIL')!, {}) : null;
  return {
    freq,
    interval: Math.max(1, Number(parts.get('INTERVAL') ?? 1) || 1),
    count: parts.has('COUNT') ? Math.max(1, Number(parts.get('COUNT')) || 1) : null,
    until,
    byday,
    bymonthday: nums('BYMONTHDAY'),
    bymonth: nums('BYMONTH'),
  };
}

const ymKey = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** 某月第 n 个星期几（n<0 倒数）；没有就 null。 */
function nthDow(y: number, m: number, n: number, dow: number): DateKey | null {
  const dim = daysInMonth(y, m);
  const days: number[] = [];
  for (let d = 1; d <= dim; d++) if (weekday(ymKey(y, m, d)) === dow) days.push(d);
  const d = n > 0 ? days[n - 1] : days[days.length + n];
  return d ? ymKey(y, m, d) : null;
}

/** 一个月里按规则选出的日子（升序）。 */
function daysInMonthByRule(y: number, m: number, rule: Rule, startDay: number): DateKey[] {
  const dim = daysInMonth(y, m);
  const out = new Set<DateKey>();
  if (rule.bymonthday.length) {
    for (const md of rule.bymonthday) {
      const d = md > 0 ? md : dim + md + 1;
      if (d >= 1 && d <= dim) out.add(ymKey(y, m, d));
    }
  } else if (rule.byday.length) {
    for (const b of rule.byday) {
      if (b.n) {
        const k = nthDow(y, m, b.n, b.dow);
        if (k) out.add(k);
      } else for (let d = 1; d <= dim; d++) if (weekday(ymKey(y, m, d)) === b.dow) out.add(ymKey(y, m, d));
    }
  } else if (startDay <= dim) out.add(ymKey(y, m, startDay));
  return [...out].sort();
}

/** 按规则依次给出开始日期（含 DTSTART 那天），交给 cb；cb 返回 false 就停。 */
function eachOccurrenceDate(start: DateKey, rule: Rule, cb: (d: DateKey) => boolean): void {
  const { y: sy, m: sm, d: sd } = parseDateKey(start);
  let iter = 0;
  const emit = (d: DateKey) => (compareDateKey(d, start) < 0 ? true : cb(d));
  if (rule.freq === 'DAILY') {
    for (let d = start; iter++ < MAX_ITER; d = addDays(d, rule.interval)) if (!emit(d)) return;
    return;
  }
  if (rule.freq === 'WEEKLY') {
    const dows = rule.byday.length ? [...new Set(rule.byday.map((b) => b.dow))] : [weekday(start)];
    // 以周一开头的那一周（RFC 默认 WKST=MO）
    const weekStart = addDays(start, -((weekday(start) + 6) % 7));
    const order = dows.map((x) => (x + 6) % 7).sort((a, b) => a - b);
    for (let w = 0; iter < MAX_ITER; w += rule.interval) {
      for (const o of order) {
        iter++;
        if (!emit(addDays(weekStart, w * 7 + o))) return;
      }
    }
    return;
  }
  if (rule.freq === 'MONTHLY') {
    for (let i = 0; iter < MAX_ITER; i += rule.interval) {
      const idx = sy * 12 + (sm - 1) + i;
      const y = Math.floor(idx / 12);
      const m = (idx % 12) + 1;
      iter++;
      for (const d of daysInMonthByRule(y, m, rule, sd)) if (!emit(d)) return;
      if (y > sy + 200) return;
    }
    return;
  }
  // YEARLY
  const months = rule.bymonth.length ? [...rule.bymonth].sort((a, b) => a - b) : [sm];
  for (let i = 0; iter < MAX_ITER; i += rule.interval) {
    const y = sy + i;
    iter++;
    for (const m of months) {
      if (m < 1 || m > 12) continue;
      const list = rule.byday.length || rule.bymonthday.length ? daysInMonthByRule(y, m, rule, sd) : sd <= daysInMonth(y, m) ? [ymKey(y, m, sd)] : [];
      for (const d of list) if (!emit(d)) return;
    }
    if (y > sy + 300) return;
  }
}

function occKey(dt: DtValue): string {
  return dt.allDay ? dt.wall.date : String(wallToMs(dt.wall, dt.tz));
}

function build(raw: Raw, start: DtValue, durMs: number, endDays: number, key: string): IcsEvent {
  if (start.allDay) {
    return { key, title: raw.summary, allDay: true, startDate: start.wall.date, endDate: addDays(start.wall.date, Math.max(0, endDays - 1)), startMs: null, endMs: null, location: raw.location, description: raw.description };
  }
  const s = wallToMs(start.wall, start.tz);
  const e = s + Math.max(0, durMs);
  return { key, title: raw.summary, allDay: false, startDate: toDateKey(new Date(s)), endDate: toDateKey(new Date(Math.max(s, e - 1))), startMs: s, endMs: e, location: raw.location, description: raw.description };
}

export interface ParseEventsOptions {
  /** 只要和这段日子有交集的（含两端）。 */
  from: DateKey;
  to: DateKey;
  max?: number;
}

/** 解析整份 ICS 的事件，展开到 [from, to]。不是日历返回 null。 */
export function parseIcsEvents(text: string, opts: ParseEventsOptions): { name: string | null; events: IcsEvent[]; truncated: boolean } | null {
  if (!looksLikeIcs(text)) return null;
  const max = opts.max ?? MAX_CAL_EVENTS;
  const raws: Raw[] = [];
  let name: string | null = null;
  let cur: Raw | null = null;
  let depth = 0; // VEVENT 里的 VALARM 等子组件
  for (const line of unfoldIcs(text)) {
    const p = parseLine(line);
    if (!p) continue;
    const val = p.value.trim();
    if (p.name === 'BEGIN') {
      if (val.toUpperCase() === 'VEVENT' && !cur) cur = { uid: '', summary: '', location: '', description: '', status: '', exdates: [] };
      else if (cur) depth++;
      continue;
    }
    if (p.name === 'END') {
      if (cur && depth > 0) depth--;
      else if (cur && val.toUpperCase() === 'VEVENT') {
        raws.push(cur);
        cur = null;
      }
      continue;
    }
    if (!cur) {
      if (p.name === 'X-WR-CALNAME' && !name) name = unescapeText(p.value) || null;
      continue;
    }
    if (depth > 0) continue;
    switch (p.name) {
      case 'UID':
        cur.uid = val;
        break;
      case 'SUMMARY':
        cur.summary = unescapeText(p.value);
        break;
      case 'LOCATION':
        cur.location = unescapeText(p.value);
        break;
      case 'DESCRIPTION':
        cur.description = unescapeText(p.value);
        break;
      case 'STATUS':
        cur.status = val.toUpperCase();
        break;
      case 'DTSTART':
        cur.start = parseDt(val, p.params) ?? undefined;
        break;
      case 'DTEND':
        cur.end = parseDt(val, p.params) ?? undefined;
        break;
      case 'DURATION':
        cur.duration = durationMs(val);
        break;
      case 'RRULE':
        cur.rrule = val;
        break;
      case 'EXDATE':
        for (const x of val.split(',')) {
          const d = parseDt(x, p.params);
          if (d) cur.exdates.push(d);
        }
        break;
      case 'RECURRENCE-ID':
        cur.recurrenceId = parseDt(val, p.params) ?? undefined;
        break;
    }
  }

  // 改过的那一次：UID + 原来的开始 → 覆盖
  const overridden = new Set<string>();
  for (const r of raws) if (r.recurrenceId && r.uid) overridden.add(`${r.uid}|${occKey(r.recurrenceId)}`);

  const out: IcsEvent[] = [];
  let truncated = false;
  const push = (e: IcsEvent) => {
    if (compareDateKey(e.endDate, opts.from) < 0 || compareDateKey(e.startDate, opts.to) > 0) return;
    if (out.length >= max) {
      truncated = true;
      return;
    }
    out.push(e);
  };

  for (const r of raws) {
    if (!r.start || r.status === 'CANCELLED') continue;
    if (!r.summary) r.summary = '';
    const start = r.start;
    // 长度：全天按天数，带时间按毫秒
    let endDays = 1;
    let durMs = 0;
    if (start.allDay) {
      if (r.end) endDays = Math.max(1, diffDays(start.wall.date, r.end.wall.date));
      else if (r.duration) endDays = Math.max(1, Math.round(r.duration / 86_400_000));
    } else if (r.end) {
      durMs = wallToMs(r.end.allDay ? { ...r.end.wall } : r.end.wall, r.end.allDay ? start.tz : r.end.tz) - wallToMs(start.wall, start.tz);
    } else if (r.duration != null) durMs = r.duration;
    const uid = r.uid || `${r.summary}|${start.wall.date}`;
    const rule = r.rrule && !r.recurrenceId ? parseRule(r.rrule) : null;
    if (!rule) {
      push(build(r, start, durMs, endDays, `${uid}|${occKey(start)}`));
      continue;
    }
    const ex = new Set(r.exdates.map((x) => (start.allDay || x.allDay ? x.wall.date : String(wallToMs(x.wall, x.tz ?? start.tz)))));
    const untilKey = rule.until ? (rule.until.allDay ? rule.until.wall.date : null) : null;
    const untilMs = rule.until && !rule.until.allDay ? wallToMs(rule.until.wall, rule.until.tz ?? start.tz) : null;
    let n = 0;
    const lastStart = addDays(opts.to, 1);
    eachOccurrenceDate(start.wall.date, rule, (d) => {
      if (rule.count != null && n >= rule.count) return false;
      if (untilKey && compareDateKey(d, untilKey) > 0) return false;
      const occ: DtValue = { ...start, wall: { ...start.wall, date: d } };
      if (untilMs != null && !start.allDay && wallToMs(occ.wall, occ.tz) > untilMs) return false;
      if (untilMs != null && start.allDay && compareDateKey(d, toDateKey(new Date(untilMs))) > 0) return false;
      if (compareDateKey(d, lastStart) > 0) return false;
      n++;
      const k = occKey(occ);
      if (ex.has(start.allDay ? d : k) || overridden.has(`${uid}|${k}`)) return true;
      push(build(r, occ, durMs, endDays, `${uid}|${k}`));
      return !truncated;
    });
  }
  out.sort((a, b) => compareDateKey(a.startDate, b.startDate) || Number(b.allDay) - Number(a.allDay) || (a.startMs ?? 0) - (b.startMs ?? 0));
  return { name, events: out, truncated };
}
