/**
 * 过期积压（侧栏「今天 → 过期积压」，路由 doable）里放哪些任务。
 *
 * Rei 2026-11-11 02:40「过期积压页里不能有未到期的任务，只列已过期的」：原来最后还有一段「还没到期」，
 * 放今天和以后的、日期段还没过完的任务，现在整段去掉，没到期的不进这一页。
 *
 * - 放：没删、没做完（待办 / 进行中）、定了日期、只做一次（不是打卡）、不是倒数日，并且已经过期的任务。
 * - 过期：结束日（日期段看结束日，没结束日看开始日）早于任务自己的今天（定了时区按那个时区算），同 isTaskOverdue。
 *   今天到期的不算过期，不放。
 * - 排序：最近过期的在上，越早越往下；结束日一样时开始日晚的在上。
 * 归档项目里的任务由调用方先筛（Store.overdueBacklog 用 activeTasks）。
 */
import { compareDateKey } from './dates';
import { taskEndDate } from './date-range';
import { isTaskOverdue } from './timezone';
import type { DateKey, Task } from './types';
import { isFinished } from './types';

export function isOverdueBacklogTask(t: Task, now: Date, deviceToday?: DateKey): boolean {
  if (t.deleted || isFinished(t.status)) return false;
  if (!t.scheduled_date) return false;
  if (t.recurrence) return false;
  if (t.completion_mode === 'countdown') return false;
  return isTaskOverdue(t, now, deviceToday);
}

export function overdueBacklogTasks<T extends Task>(tasks: readonly T[], now: Date, deviceToday?: DateKey): T[] {
  return tasks
    .filter((t) => isOverdueBacklogTask(t, now, deviceToday))
    .sort((a, b) => compareDateKey(taskEndDate(b)!, taskEndDate(a)!) || compareDateKey(b.scheduled_date!, a.scheduled_date!));
}
