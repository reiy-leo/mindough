/**
 * 我的一天：按本机日期的清单。零点后自动换一天；没做完的不顺延，放进“昨天没做完”。
 */
import { addDays } from './dates';
import { dueToday, progressOn } from './checkin';
import type { DerivedStatus } from './dag';
import { inArchivedGroup, isGroupArchived } from './group';
import { isFinished, type CheckIn, type DateKey, type Group, type MyDayEntry, type Task } from './types';
import { formatHlc } from './hlc';

import { tr } from './i18n';
import { taskToday } from './timezone';
import { taskEndDate } from './date-range';
export function entriesFor(entries: readonly MyDayEntry[], date: DateKey): MyDayEntry[] {
  const seen = new Set<string>();
  // 同一 task_id + date 只保留一条（同步时按此合并）
  return entries
    .filter((e) => !e.deleted && e.date === date)
    .sort((a, b) => a.sort - b.sort || (a.added_at < b.added_at ? -1 : a.added_at > b.added_at ? 1 : a.id < b.id ? -1 : 1))
    .filter((e) => (seen.has(e.task_id) ? false : (seen.add(e.task_id), true)));
}

/** 任务在 date 那天是否算“做完”：已结束（完成 / 关闭），或打卡任务当天周期达标。 */
export function isDoneOn(task: Task, checkIns: readonly CheckIn[], date: DateKey, now: Date): boolean {
  if (isFinished(task.status)) return true;
  if (task.recurrence) {
    return progressOn(task, checkIns.filter((c) => c.task_id === task.id), date, now).met;
  }
  return false;
}

export interface MyDayItem {
  entry: MyDayEntry;
  task: Task;
  done: boolean;
}

/** 今天的清单：完成的沉到底部，其余按 sort。 */
export function myDayItems(
  entries: readonly MyDayEntry[],
  tasksById: ReadonlyMap<string, Task>,
  checkIns: readonly CheckIn[],
  date: DateKey,
  now: Date,
): MyDayItem[] {
  const items: MyDayItem[] = [];
  for (const entry of entriesFor(entries, date)) {
    const task = tasksById.get(entry.task_id);
    if (!task || task.deleted) continue;
    items.push({ entry, task, done: isDoneOn(task, checkIns, date, now) });
  }
  return [...items.filter((i) => !i.done), ...items.filter((i) => i.done)];
}

/** 昨天加入但没做完、今天也还没加入的任务。 */
export function yesterdayUnfinished(
  entries: readonly MyDayEntry[],
  tasksById: ReadonlyMap<string, Task>,
  checkIns: readonly CheckIn[],
  today: DateKey,
  now: Date,
): Task[] {
  const yesterday = addDays(today, -1);
  const todayIds = new Set(entriesFor(entries, today).map((e) => e.task_id));
  const out: Task[] = [];
  for (const e of entriesFor(entries, yesterday)) {
    if (todayIds.has(e.task_id)) continue;
    const t = tasksById.get(e.task_id);
    if (!t || t.deleted || t.archived_at) continue;
    // 重复任务看的是昨天那个周期；普通任务看现在的状态
    if (t.recurrence ? !isDoneOn(t, checkIns, yesterday, now) : !isFinished(t.status)) out.push(t);
  }
  return out;
}

export type SuggestionReason = '今天到期' | '这几天要做' | '今天要打卡' | '刚解锁' | '倒数日到了';
/** 建议理由的显示文字（内部值是中文，显示按当前语言）。 */
export const SUGGESTION_REASON_LABEL: Record<SuggestionReason, string> = {
  get 今天到期() { return tr('今天到期'); },
  get 这几天要做() { return tr('这几天要做'); },
  get 今天要打卡() { return tr('今天要打卡'); },
  get 刚解锁() { return tr('刚解锁'); },
  get 倒数日到了() { return tr('倒数日到了'); },
};

export interface Suggestion {
  task: Task;
  reason: SuggestionReason;
}

export interface SuggestionInput {
  tasks: readonly Task[];
  entries: readonly MyDayEntry[];
  checkIns: readonly CheckIn[];
  derived: ReadonlyMap<string, DerivedStatus>;
  /** 最近解锁的任务 id（例如过去 24 小时内前置刚完成的）。 */
  recentlyUnlocked: readonly string[];
  today: DateKey;
  now: Date;
  /**
   * 全部项目（Rei 2026-11-02）。给了的话，开着「出现在我的一天」的项目里的任务不进建议（它们自动进我的一天，见 autoMyDayTasks）。
   * 不给就和以前一样，都建议。
   */
  groups?: readonly Group[];
}

/**
 * 今天该做的任务和理由：今天到期 / 过期、日期段含今天、倒数日到了、今天要打卡、刚解锁。只算没结束的，不看在不在我的一天里。
 * 建议（suggestions）和项目任务自动进我的一天（autoMyDayTasks）都从这里挑。
 */
export function dueTodayCandidates({ tasks, checkIns, derived, recentlyUnlocked, today, now }: Omit<SuggestionInput, 'entries' | 'groups'>): Suggestion[] {
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const push = (task: Task, reason: SuggestionReason) => {
    if (seen.has(task.id)) return;
    seen.add(task.id);
    out.push({ task, reason });
  };
  // 归档了的打卡不进建议，也不自动加进我的一天（Rei 2026-11-02）
  const live = tasks.filter((t) => !t.deleted && !isFinished(t.status) && !t.archived_at);
  // 到期按任务时区的今天（Rei 2026-10-25 任务时区；没设时区就是 today）
  // 日期段（Rei 2026-10-26）：今天落在段里、还没到结束日的是「这几天要做」；到了结束日或过了才算「今天到期」
  for (const t of live) {
    if (!t.scheduled_date || t.recurrence) continue;
    const zoneToday = taskToday(t, now, today);
    if (t.scheduled_date > zoneToday) continue;
    const end = taskEndDate(t)!;
    push(t, end > zoneToday ? '这几天要做' : '今天到期');
  }
  for (const t of live) if (t.completion_mode === 'countdown' && t.target_date === taskToday(t, now, today)) push(t, '倒数日到了');
  for (const t of live)
    if (dueToday(t, today) && !progressOn(t, checkIns.filter((c) => c.task_id === t.id), today, now).met) push(t, '今天要打卡');
  const byId = new Map(live.map((t) => [t.id, t]));
  for (const id of recentlyUnlocked) {
    const t = byId.get(id);
    if (t && derived.get(id)?.state === '可开始') push(t, '刚解锁');
  }
  return out;
}

/** 项目开着「出现在我的一天」吗（没有这个字段的老数据算开）。 */
export function groupAutoMyDay(group: Pick<Group, 'my_day_auto'> | null | undefined): boolean {
  return !!group && group.my_day_auto !== false;
}

/** 任务在开着「出现在我的一天」的项目里（项目删了的、归档了的不算）。 */
function inAutoGroup(task: Task, groups: ReadonlyMap<string, Group>): boolean {
  if (!task.group_id) return false;
  const g = groups.get(task.group_id);
  return !!g && !g.deleted && !isGroupArchived(g) && groupAutoMyDay(g);
}

const groupMap = (groups: readonly Group[] | undefined) => new Map((groups ?? []).map((g) => [g.id, g]));

/**
 * 建议区：今天到期的、今天要打卡的、刚解锁的；已在今天清单里的、会自动进我的一天的（开着开关的项目里的）不再建议。
 * 归档了的项目里的任务也不建议（Rei 2026-11-05）。
 */
export function suggestions(input: SuggestionInput): Suggestion[] {
  const inToday = new Set(entriesFor(input.entries, input.today).map((e) => e.task_id));
  const groups = groupMap(input.groups);
  return dueTodayCandidates(input).filter((s) => !inToday.has(s.task.id) && !inAutoGroup(s.task, groups) && !inArchivedGroup(s.task, groups));
}

/**
 * 今天要自动放进我的一天的任务（Rei 2026-11-02「直接出现在我的一天，而不是出现在的建议里」）：
 * 开着「出现在我的一天」的项目里、今天该做的（条件同建议）。
 * seen 是这一天已经有过行的任务（在里面的、移出过的都算）：这些不再加，所以移出后当天不会再冒出来。
 * 不看「显示建议」开关：这不是建议。
 */
export function autoMyDayTasks(input: Omit<SuggestionInput, 'entries' | 'groups'> & { groups: readonly Group[]; seen: ReadonlySet<string> }): Suggestion[] {
  const groups = groupMap(input.groups);
  return dueTodayCandidates(input).filter((s) => !input.seen.has(s.task.id) && inAutoGroup(s.task, groups));
}

/** FNV-1a 32 位。 */
function fnv(s: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * 某件任务某一天在我的一天里的行 id（2026-11-02 起新加的行都用它）：UUID 形状，各设备算出来一样。
 * 两台设备同一天各自加了同一件，是同一行，同步时按 LWW 合并，不会出现两条；移出后再加，是把墓碑翻回来。
 * 以前加的行是随机的 UUIDv7，照样能读（entriesFor 按 task_id + date 去重）。
 */
export function myDayEntryId(taskId: string, date: DateKey): string {
  const key = `my_day\u0000${taskId}\u0000${date}`;
  const hex = [fnv(key), fnv(key, 0x01234567), fnv(key, 0x89abcdef), fnv(key, 0x2468ace0)].map((n) => n.toString(16).padStart(8, '0')).join('');
  return `00000000-${hex.slice(0, 4)}-7${hex.slice(5, 8)}-8${hex.slice(9, 12)}-${hex.slice(12, 24)}`;
}

/**
 * 自动加进我的一天的行用的 updated_at：比任何真实写入都早的固定值。
 * 各设备写出来一模一样（同 id、同内容、同时间戳），合并时谁也不覆盖谁；
 * 用户在哪台设备上移出，墓碑都带真实时间戳，比它新。别的设备离线时自动加的那一行，同步后会被墓碑盖掉，不会复活。
 */
export const AUTO_MY_DAY_HLC = formatHlc(0, 0, 'auto');

/**
 * 最近解锁：可开始的任务里，有前置在 since 之后完成的。
 */
export function recentlyUnlocked(
  tasks: readonly Task[],
  edges: readonly { pred_id: string; succ_id: string }[],
  derived: ReadonlyMap<string, DerivedStatus>,
  sinceIso: string,
): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const out = new Set<string>();
  for (const e of edges) {
    const pred = byId.get(e.pred_id);
    if (pred?.status === '完成' && pred.done_at && pred.done_at >= sinceIso && derived.get(e.succ_id)?.state === '可开始') out.add(e.succ_id);
  }
  return [...out];
}
