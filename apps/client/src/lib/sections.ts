/**
 * 列表分区（Rei 2026-11-08 22:50「我的一天、项目中 右上角功能区添加一个分区，支持按心情（心情从好到坏，排序中添加一项心情）、项目分区，
 * 项目中还支持按目标日期（过期、今天、本周、本月、更远）。所有列表支持不分区。」）。纯逻辑，界面在 components/SectionedList.tsx。
 *
 * - 按心情：心情从好到坏（core MOOD_IDS 的顺序），没记心情的放最后「没有心情」。
 * - 按项目：项目按侧栏 / 项目列表的顺序（传进来的 groups 顺序），不在项目里的放最后「没有项目」。
 * - 按目标日期：过期 / 今天 / 本周 / 本月 / 更远 / 没有日期。目标日期 = 任务的日期，日期段取结束日（core taskEndDate，和积压、过期一致）；
 *   倒数日也取任务的日期（scheduled_date，不看 target_date），Rei 说的「倒数日取开始日」。「今天」「过期」按任务时区（taskToday）。
 *   本周 = 今天之后、这周最后一天之前（一周从哪天开始用 core weekStartsOn()，和月历一样）；本月 = 这周以后、这个月底之前；更远 = 再往后。
 * - 分区里的顺序就是传进来的顺序（调用方先排好）；空分区不出现。
 */
import { addDays, diffDays, isMoodId, moodLabel, MOOD_IDS, startOfWeek, taskEndDate, taskToday, type DateKey, type Group, type Task } from '@mindough/core';
import { tr } from './i18n';

export type SectionBy = 'none' | 'mood' | 'project' | 'due';
export const SECTION_BYS: readonly SectionBy[] = ['none', 'mood', 'project', 'due'];

export function normalizeSectionBy(v: unknown, allowed: readonly SectionBy[] = SECTION_BYS): SectionBy {
  return allowed.includes(v as SectionBy) ? (v as SectionBy) : 'none';
}

/** 心情的名次：开心 0 … 生气 11，没记 / 认不出排最后。 */
export function moodRank(mood: string | null | undefined): number {
  return isMoodId(mood) ? MOOD_IDS.indexOf(mood) : MOOD_IDS.length;
}

/** 按心情排（好到坏，没记的在后），同名次保持原来的顺序。 */
export function sortByMood<T extends Pick<Task, 'mood'>>(tasks: readonly T[]): T[] {
  return tasks
    .map((t, i) => [t, i] as const)
    .sort((a, b) => moodRank(a[0].mood) - moodRank(b[0].mood) || a[1] - b[1])
    .map(([t]) => t);
}

export type DueBucket = 'overdue' | 'today' | 'week' | 'month' | 'later' | 'none';
export const DUE_BUCKETS: readonly DueBucket[] = ['overdue', 'today', 'week', 'month', 'later', 'none'];

/** 一件任务落在哪个目标日期段。today = 设备的今天；weekStart 0 周日 / 1 周一。 */
export function dueBucket(t: Pick<Task, 'scheduled_date' | 'end_date' | 'time_zone'>, now: Date, deviceToday: DateKey, weekStart: 0 | 1): DueBucket {
  const due = taskEndDate(t);
  if (!due) return 'none';
  const today = taskToday(t, now, deviceToday);
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  const weekEnd = addDays(startOfWeek(today, weekStart), 6);
  if (due <= weekEnd) return 'week';
  const monthEnd = `${today.slice(0, 7)}-31`;
  if (due <= monthEnd) return 'month';
  return 'later';
}

export function dueBucketLabel(b: DueBucket): string {
  switch (b) {
    case 'overdue':
      return tr('已过期');
    case 'today':
      return tr('今天');
    case 'week':
      return tr('本周');
    case 'month':
      return tr('本月');
    case 'later':
      return tr('更远');
    case 'none':
      return tr('没有日期');
  }
}

/**
 * 过期积压页按日期分区（Rei 2026-11-10「按照这个来：昨天，过去7天，过去一个月，过去一年，更远」）。
 * 只管已过期的任务，按过期了几天（任务今天 − 结束日，和 isTaskOverdue 同一个今天、同一个结束日）分，区间不重叠：
 * 昨天 = 1 天前；过去 7 天 = 2–7 天前；过去一个月 = 8–30 天前；过去一年 = 31–365 天前；超过一年 = 366 天及以前
 * （Rei 2026-11-10 19:1x「"接下来"应该换成"超过一年"」：最后这段原来叫「更远」，改叫「超过一年」）。
 * 「一个月」「一年」按天数算（30 / 365），不按日历月、日历年：跨月跨年都不跳。
 */
export type OverdueBucket = 'yesterday' | 'week' | 'month' | 'year' | 'older';
export const OVERDUE_BUCKETS: readonly OverdueBucket[] = ['yesterday', 'week', 'month', 'year', 'older'];

/** 过期了几天落在哪段；没过期（0 天或以后）的也算「昨天」，调用方只传过期的。 */
export function overdueBucketOfDays(days: number): OverdueBucket {
  if (days <= 1) return 'yesterday';
  if (days <= 7) return 'week';
  if (days <= 30) return 'month';
  if (days <= 365) return 'year';
  return 'older';
}

export function overdueBucket(t: Pick<Task, 'scheduled_date' | 'end_date' | 'time_zone'>, now: Date, deviceToday: DateKey): OverdueBucket {
  const due = taskEndDate(t);
  if (!due) return 'yesterday';
  return overdueBucketOfDays(diffDays(due, taskToday(t, now, deviceToday)));
}

export function overdueBucketLabel(b: OverdueBucket): string {
  switch (b) {
    case 'yesterday':
      return tr('昨天');
    case 'week':
      return tr('过去 7 天');
    case 'month':
      return tr('过去一个月');
    case 'year':
      return tr('过去一年');
    case 'older':
      return tr('超过一年');
  }
}

/** 过期任务分成上面 5 段（顺序不变，调用方先排好：最近过期在上）；空段不出现。 */
export function sectionOverdue<T extends Task>(tasks: readonly T[], now: Date, deviceToday: DateKey): { key: OverdueBucket; label: string; tasks: T[] }[] {
  const by = new Map<OverdueBucket, T[]>();
  for (const t of tasks) {
    const b = overdueBucket(t, now, deviceToday);
    by.set(b, [...(by.get(b) ?? []), t]);
  }
  return OVERDUE_BUCKETS.filter((b) => by.get(b)?.length).map((b) => ({ key: b, label: overdueBucketLabel(b), tasks: by.get(b)! }));
}

/**
 * 过期积压页的全部分段（Rei 2026-11-10「过期积压不显示分区按钮，只有按日期分区这一种模式」）：过期的 5 段在前，
 * 还没到期的（今天和以后、日期段还没过完的）放最后一段「还没到期」（原叫「接下来」）。空段不出现。
 * 两组都由调用方先排好：过期的最近过期在上，没到期的按到期日从近到远。
 */
export function backlogSections<T extends Task>(overdue: readonly T[], upcoming: readonly T[], now: Date, deviceToday: DateKey): ListSection<T>[] {
  const out: ListSection<T>[] = sectionOverdue(overdue, now, deviceToday).map((s) => ({ key: s.key, label: s.label, kind: 'overdue' as const, tasks: s.tasks }));
  if (upcoming.length) out.push({ key: 'upcoming', label: tr('还没到期'), kind: 'overdue', tasks: [...upcoming] });
  return out;
}

export interface ListSection<T> {
  /** 分区的 key：心情 id / 项目 id / 目标日期段 / 过期段；「没有」的那段是 'none'。折叠状态按它记。 */
  key: string;
  label: string;
  /** overdue = 过期积压页的固定分段（过期天数 5 段 + 还没到期），不是能选的分区方式。 */
  kind: Exclude<SectionBy, 'none'> | 'overdue';
  /** 按项目时是那个项目（画图标）。 */
  group?: Group;
  tasks: T[];
}

/** 分区。by = none 时返回 null（调用方照常画一张清单）。 */
export function sectionTasks<T extends Task>(
  tasks: readonly T[],
  by: SectionBy,
  ctx: { groups?: readonly Group[]; now?: Date; today?: DateKey; weekStart?: 0 | 1 } = {},
): ListSection<T>[] | null {
  if (by === 'none') return null;
  const out: ListSection<T>[] = [];
  const push = (key: string, label: string, list: T[], group?: Group) => {
    if (list.length) out.push({ key, label, kind: by as Exclude<SectionBy, 'none'>, tasks: list, ...(group ? { group } : {}) });
  };
  if (by === 'mood') {
    for (const id of MOOD_IDS) push(id, moodLabel(id), tasks.filter((t) => t.mood === id));
    push('none', tr('没有心情'), tasks.filter((t) => !isMoodId(t.mood)));
  } else if (by === 'project') {
    const groups = ctx.groups ?? [];
    const known = new Set(groups.map((g) => g.id));
    for (const g of groups) push(g.id, g.name, tasks.filter((t) => t.group_id === g.id), g);
    push('none', tr('没有项目'), tasks.filter((t) => !t.group_id || !known.has(t.group_id)));
  } else {
    const now = ctx.now ?? new Date();
    const today = ctx.today ?? now.toISOString().slice(0, 10);
    const ws = ctx.weekStart ?? 1;
    const byBucket = new Map<DueBucket, T[]>();
    for (const t of tasks) {
      const b = dueBucket(t, now, today, ws);
      byBucket.set(b, [...(byBucket.get(b) ?? []), t]);
    }
    for (const b of DUE_BUCKETS) push(b, dueBucketLabel(b), byBucket.get(b) ?? []);
  }
  return out;
}

/** 折叠状态：存折起来的分区 key（`<分区方式>:<key>`），默认都展开。 */
export function sectionCollapsed(collapsed: readonly string[] | undefined, s: Pick<ListSection<unknown>, 'kind' | 'key'>): boolean {
  return !!collapsed?.includes(`${s.kind}:${s.key}`);
}

export function toggleSectionCollapsed(collapsed: readonly string[] | undefined, s: Pick<ListSection<unknown>, 'kind' | 'key'>): string[] {
  const k = `${s.kind}:${s.key}`;
  const cur = collapsed ?? [];
  return cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
}
