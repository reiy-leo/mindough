/**
 * 补打卡（Rei 2026-11-09 01:52「打卡任务中，下一次节点前，显示补打卡图标按钮。每天重复的打卡不显示。点击补打卡按钮后，
 * 把任务放在"我的一天"，打卡完成后，补到上一个打卡节点。如果任务没完成，则明天继续显示补打卡（之前的打卡进度也同步过来）。」）
 *
 * 不加新字段、不迁移：check_in 本来就有 period_key（算哪个节点），一个周期从应打卡日开始、到下一个应打卡日前一天为止，
 * 所以在两个节点之间记的打卡，period_key 天然就是上一个节点（Store.checkIn 按今天算出的周期键）。补打卡要做的只是：
 * - 什么时候给按钮（makeupNode）；
 * - 点了以后让它待在我的一天里，直到补完或者到了下一个节点（makeupStarted + myday.ts 的 makeupDayItems）；
 * - 统计照常把补完的节点算达成（metPeriods 不变），活动图上把「补的」和「当天打的」分开画（isMadeUpPeriod）。
 */
import { dayOf } from './day-start';
import { computeProgress, type ProgressTask } from './checkin';
import { parseRecurrence, periodStart, type Recurrence } from './recurrence';
import { isFinished, type CheckIn, type DateKey, type MyDayEntry, type Task } from './types';

/** 补打卡带进我的一天的虚拟行 id 前缀：不在 my_day 表里，拖动时才落成真行。 */
export const MAKEUP_ENTRY_PREFIX = 'makeup:';

export function isMakeupEntry(e: Pick<MyDayEntry, 'id'>): boolean {
  return e.id.startsWith(MAKEUP_ENTRY_PREFIX);
}

/** 每天都要打的规则（每天、每周七天都选）：没有「两个节点之间」，不给补打卡。 */
export function isDailyRule(r: Recurrence): boolean {
  return r.kind === 'daily' || (r.kind === 'weekly' && new Set(r.weekdays).size >= 7);
}

export type MakeupTask = ProgressTask & Pick<Task, 'id' | 'deleted' | 'status' | 'archived_at' | 'created_at'>;

/**
 * 这件打卡今天能补哪个节点；不能补是 null。能补 = 全部满足：
 * - 重复、不是每天打（isDailyRule）、不是倒数日；没删、没结束（完成 / 关闭）、没归档；
 * - 今天不是应打卡日（是的话今天就是新节点，上一个节点的补打卡已经过期）；
 * - 上一个节点（periodStart）不早于任务创建那天；
 * - 那个节点还没达标。
 * events：这件任务的打卡事件（别的任务的会被忽略）。
 */
export function makeupNode(task: MakeupTask, events: readonly CheckIn[], today: DateKey, now: Date): DateKey | null {
  const st = makeupState(task, events, today, now);
  return st && !st.met ? st.node : null;
}

/**
 * makeupNode 的底子：今天处在哪个可补的节点里、那个节点现在达没达标（达标了也返回，我的一天用它让补完的那天落进「已完成」段）。
 * 不在可补的窗口里（每天打、今天就是节点、节点早于创建…）是 null。
 */
export function makeupState(task: MakeupTask, events: readonly CheckIn[], today: DateKey, now: Date): { node: DateKey; met: boolean; events: CheckIn[] } | null {
  if (task.deleted || isFinished(task.status) || task.archived_at || task.completion_mode === 'countdown') return null;
  const r = parseRecurrence(task.recurrence);
  if (!r || isDailyRule(r)) return null;
  const node = periodStart(r, today);
  if (!node || node >= today) return null;
  if (node < dayOf(task.created_at)) return null;
  const evs = events.filter((e) => !e.deleted && e.task_id === task.id && e.period_key === node);
  return { node, met: computeProgress(task, evs, now).met, events: evs };
}

/**
 * 补打卡开始了吗：节点之后、今天（含）之前，我的一天里有过这件任务的活行（点补打卡时写的那行，或者用户自己加的）。
 * 用户在某天把它移出我的一天（那天的行变墓碑），之后就不再自动带着它。
 */
export function makeupStarted(taskId: string, entries: Iterable<Pick<MyDayEntry, 'task_id' | 'date' | 'deleted'>>, node: DateKey, today: DateKey): boolean {
  for (const e of entries) if (!e.deleted && e.task_id === taskId && e.date > node && e.date <= today) return true;
  return false;
}

/**
 * 这个节点是补完的吗：现在达标，但只算节点当天（本机日期）记的事件时没达标。
 * 活动图上用空心格标出来；连续天数、达成数照常算它达成。
 */
export function isMadeUpPeriod(task: ProgressTask, periodEvents: readonly CheckIn[], node: DateKey, now: Date): boolean {
  const live = periodEvents.filter((e) => !e.deleted);
  if (!live.some((e) => dayOf(e.at) > node)) return false;
  if (!computeProgress(task, live, now).met) return false;
  return !computeProgress(task, live.filter((e) => dayOf(e.at) <= node), now).met;
}
