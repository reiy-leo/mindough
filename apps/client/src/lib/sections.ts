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
import { addDays, isMoodId, moodLabel, MOOD_IDS, startOfWeek, taskEndDate, taskToday, type DateKey, type Group, type Task } from '@mindough/core';
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

export interface ListSection<T> {
  /** 分区的 key：心情 id / 项目 id / 目标日期段；「没有」的那段是 'none'。折叠状态按它记。 */
  key: string;
  label: string;
  kind: Exclude<SectionBy, 'none'>;
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
    if (list.length) out.push({ key, label, kind: by, tasks: list, ...(group ? { group } : {}) });
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
