/**
 * 日历订阅（docs/CALENDAR.md 第五节）和节假日显示（第三节）的纯规则。
 */
import { tr } from '../i18n';
import { normalizeSubUrl, httpStatusZh } from '../lunar/subscription';
import { pickCellEvent, plainSubTitle, type CellSub, type SubEvent } from '../lunar/ics';
import type { CalendarSub } from '../types';

/** 订阅颜色：8 个，名字是 id，实际颜色在客户端令牌（--cal-*）。 */
export const SUB_COLORS = ['blue', 'green', 'orange', 'red', 'purple', 'teal', 'pink', 'gray'] as const;
export type SubColor = (typeof SUB_COLORS)[number];

export function normalizeSubColor(v: unknown): SubColor {
  return SUB_COLORS.includes(v as SubColor) ? (v as SubColor) : 'blue';
}

/** 新订阅挑个没用过的颜色。 */
export function nextSubColor(subs: readonly Pick<CalendarSub, 'color' | 'deleted'>[]): SubColor {
  const used = new Set(subs.filter((s) => !s.deleted).map((s) => s.color));
  return SUB_COLORS.find((c) => !used.has(c)) ?? SUB_COLORS[subs.length % SUB_COLORS.length]!;
}

/** 检查用户填的订阅地址（同节假日订阅：webcal 换 https，只收 http(s)）。 */
export const normalizeCalendarUrl = normalizeSubUrl;

/** 订阅排序：sort 再按建的时间。 */
export function orderSubs<T extends Pick<CalendarSub, 'sort' | 'created_at' | 'deleted'>>(subs: readonly T[]): T[] {
  return subs.filter((s) => !s.deleted).sort((a, b) => a.sort - b.sort || (a.created_at < b.created_at ? -1 : 1));
}

/** 多久没成功就自动再拉。 */
export const CAL_SUB_REFRESH_MS = 6 * 3_600_000;
export const CAL_SUB_RETRY_MS = 3_600_000;

export interface CalSubState {
  url: string;
  okAt: string | null;
  triedAt: string | null;
  status: CalSubStatus | null;
}

export type CalSubStatus = { ok: true; count: number; truncated: boolean } | { ok: false; code: number | null; reason: 'http' | 'upstream' | 'offline' | 'not_ics' };

export function calSubDue(state: CalSubState | null, url: string, now: number): boolean {
  if (!state || state.url !== url || !state.okAt) {
    if (state && state.url === url && state.triedAt && now - Date.parse(state.triedAt) < CAL_SUB_RETRY_MS) return false;
    return true;
  }
  if (state.triedAt && state.triedAt > state.okAt && now - Date.parse(state.triedAt) < CAL_SUB_RETRY_MS) return false;
  return now - Date.parse(state.okAt) >= CAL_SUB_REFRESH_MS;
}

const withCode = (code: number) => `${code}${httpStatusZh(code) ? ` ${httpStatusZh(code)}` : ''}`;

export function calSubStatusText(s: CalSubStatus | null): string {
  if (!s) return tr('还没同步过');
  if (s.ok) return s.truncated ? tr('同步成功，{n} 个事件（太多了，只留前面这些）', { n: s.count }) : tr('同步成功，{n} 个事件', { n: s.count });
  switch (s.reason) {
    case 'offline':
      return tr('同步失败：没连上网络');
    case 'not_ics':
      return tr('同步失败：这个地址不是日历文件（ICS）');
    case 'upstream':
      return tr('同步失败：订阅源返回 {code}', { code: s.code ? withCode(s.code) : '?' });
    case 'http':
      return tr('同步失败：{code}', { code: s.code ? withCode(s.code) : '?' });
  }
}

/**
 * 节假日和农历拆开（Rei 2026-11-10 定）：农历关着、只开节假日时，只要「休」「班」角标和放假那几天的节日名，
 * 节气、普通传统节日不要（它们算农历那一套）。农历开着时照旧（pickCellEvent）。
 */
export function holidayCell(list: readonly SubEvent[] | undefined, lunarOn: boolean): CellSub | null {
  if (lunarOn) return pickCellEvent(list);
  if (!list?.length) return null;
  const badge = list.some((e) => e.kind === 'work') ? 'work' : list.some((e) => e.kind === 'off') ? 'off' : null;
  if (!badge) return null;
  const off = list.find((e) => e.kind === 'off');
  const label = badge === 'off' && off ? plainSubTitle(off.title) || null : null;
  const titles = [...new Set(list.filter((e) => e.kind !== 'event').map((e) => e.title))];
  return { label, badge, titles };
}
