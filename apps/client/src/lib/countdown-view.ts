/**
 * 倒数日页的视图、排序、分区（Rei 2026-11-12 01:09「倒数日页去掉页头，左上角三个下拉：视图、排序、分区」）。
 * 三项都存本机设置 settings.listViews.countdown，不同步（和我的一天、项目页一样）。
 *
 * - 视图：卡片（默认，原来的样子）/ 列表（像任务列表一行一个，标题在左、天数在右）。
 * - 排序：到期日期（target_date，默认）/ 添加日期（created_at），正序（默认）/ 倒序。
 *   已经过了的倒数日规则不变：不论按什么排，都排在还没到的后面，刚过的在前（和原来一样）；排序只管今天和还没到的那些。
 *   所以默认「到期日期正序」就是原来的顺序：越近越前，过了的在后面。
 * - 分区：不分区（默认）/ 按类型 / 按目标日期 / 按心情，规则和我的一天、项目页的分区同一套（lib/sections.ts 的 sectionTasks）：
 *   按类型只进第一个类型、没类型的放最后；按目标日期分 已过期 / 今天 / 本周 / 本月 / 更远，倒数日的日期取 target_date
 *   （sectionTasks 看的是 scheduled_date / end_date，这里换成 target_date 再分）；按心情从好到坏，没记的放最后。
 *   每个分区里的顺序就是上面排好的顺序。
 */
import type { Category, DateKey, Task } from '@mindough/core';
import { useSettings } from './settings';
import { normalizeSectionBy, sectionTasks, type ListSection, type SectionBy } from './sections';

export type CountdownView = 'card' | 'list';
export type CountdownSort = 'target' | 'added';
export type CountdownDir = 'asc' | 'desc';
export const COUNTDOWN_VIEWS: readonly CountdownView[] = ['card', 'list'];
export const COUNTDOWN_SORTS: readonly CountdownSort[] = ['target', 'added'];
export const COUNTDOWN_SECTIONS: readonly SectionBy[] = ['none', 'type', 'due', 'mood'];

export interface CountdownPrefs {
  view: CountdownView;
  sort: CountdownSort;
  dir: CountdownDir;
  section: SectionBy;
  /** 收起了哪几段（`<分区方式>:<key>`），同 SectionedList */
  collapsed: string[];
}

export const DEFAULT_COUNTDOWN_PREFS: CountdownPrefs = { view: 'card', sort: 'target', dir: 'asc', section: 'none', collapsed: [] };

export function normalizeCountdownPrefs(v: unknown): CountdownPrefs {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    view: o.view === 'list' ? 'list' : 'card',
    sort: o.sort === 'added' ? 'added' : 'target',
    dir: o.dir === 'desc' ? 'desc' : 'asc',
    section: normalizeSectionBy(o.section, COUNTDOWN_SECTIONS),
    collapsed: Array.isArray(o.collapsed) ? o.collapsed.filter((x): x is string => typeof x === 'string') : [],
  };
}

export function useCountdownPrefs(): [CountdownPrefs, (patch: Partial<CountdownPrefs>) => void] {
  const { settings, set } = useSettings();
  const all = settings.listViews ?? {};
  const prefs = normalizeCountdownPrefs(all.countdown);
  return [prefs, (patch) => set('listViews', { ...all, countdown: { ...prefs, ...patch } })];
}

/** 一条倒数日和它离今天还有几天（n < 0 = 已过 -n 天）。 */
export interface CountdownEntry<T extends Pick<Task, 'id' | 'created_at' | 'target_date'> = Task> {
  t: T;
  n: number;
}

/**
 * 排序：还没到的（n ≥ 0）在前，按选的字段和方向排；过了的（n < 0）在后，刚过的在前（不看选了什么）。
 * 值一样时保持原来的顺序（稳定），添加日期一样再按 id。
 */
export function sortCountdowns<E extends CountdownEntry<Pick<Task, 'id' | 'created_at' | 'target_date'>>>(list: readonly E[], sort: CountdownSort, dir: CountdownDir): E[] {
  const sign = dir === 'desc' ? -1 : 1;
  const cmpUpcoming = (a: E, b: E): number => {
    if (sort === 'added') {
      const x = a.t.created_at ?? '';
      const y = b.t.created_at ?? '';
      return sign * (x < y ? -1 : x > y ? 1 : a.t.id < b.t.id ? -1 : a.t.id > b.t.id ? 1 : 0);
    }
    return sign * (a.n - b.n);
  };
  return list
    .map((e, i) => [e, i] as const)
    .sort(([a, i], [b, j]) => {
      const fa = a.n >= 0;
      const fb = b.n >= 0;
      if (fa !== fb) return fa ? -1 : 1;
      const c = fa ? cmpUpcoming(a, b) : b.n - a.n;
      return c || i - j;
    })
    .map(([e]) => e);
}

/**
 * 还没选日期的倒数日（Rei 2026-11-12 09:23：新建的一点就要在列表里）：排在已排好的前面，新建的在上；天数记 0，界面看 target_date 空写「还没选日期」。
 */
export function withUndated<T extends Pick<Task, 'id' | 'created_at' | 'target_date'>>(sorted: readonly CountdownEntry<T>[], undated: readonly T[]): CountdownEntry<T>[] {
  const top = [...undated]
    .map((t, i) => [t, i] as const)
    .sort(([a, i], [b, j]) => {
      const x = a.created_at ?? '';
      const y = b.created_at ?? '';
      return x < y ? 1 : x > y ? -1 : i - j;
    })
    .map(([t]) => ({ t, n: 0 }));
  return [...top, ...sorted];
}

/**
 * 分区：sectionTasks 同一套规则；按目标日期时拿 target_date 当任务日期。section = none 返回 null。
 */
export function sectionCountdowns<T extends Task>(
  tasks: readonly T[],
  by: SectionBy,
  ctx: { categories?: readonly Category[]; categoryIdsOf?: (t: T) => readonly string[]; now?: Date; today?: DateKey; weekStart?: 0 | 1 } = {},
): ListSection<T>[] | null {
  if (by === 'none') return null;
  if (by !== 'due') return sectionTasks(tasks, by, ctx);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const proxies = tasks.map((t) => ({ ...t, scheduled_date: t.target_date ?? null, end_date: null }) as T);
  const out = sectionTasks(proxies, 'due', { ...(ctx.now ? { now: ctx.now } : {}), ...(ctx.today ? { today: ctx.today } : {}), ...(ctx.weekStart !== undefined ? { weekStart: ctx.weekStart } : {}) });
  return out?.map((s) => ({ ...s, tasks: s.tasks.map((p) => byId.get(p.id)!) })) ?? null;
}
