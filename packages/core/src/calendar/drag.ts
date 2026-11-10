/**
 * 日历拖动改日期（Rei 2026-11-11 06:55「日历页可拖动条目改日期」，docs/CALENDAR.md「拖动改日期」）。
 * 这里只算「拖到哪天、日期改成什么」，不碰 DOM、不写库；写入由界面走 Store.updateTask。
 *
 * - 按住的是条目在哪一天（多天的横条按在第几天就算哪天），松手落在哪天；两天差几天，整段平移几天，天数不变。
 * - 普通任务改 scheduled_date（有 end_date 的一起挪）；倒数日改 target_date。
 * - 落回原来那天（差 0 天）不改。
 * - 能拖的只有普通任务和倒数日：订阅事件只读，打卡本来就不画在格子里。
 */
import { addDays, diffDays } from '../dates';
import type { DateKey, Task } from '../types';

export type CalDragRole = 'task' | 'countdown' | 'checkin' | 'event';

/** 这种条目能不能拖。 */
export function canDragCalItem(role: CalDragRole): boolean {
  return role === 'task' || role === 'countdown';
}

/** 拖动改日期要写的字段；没变就 null。 */
export type CalDatePatch = { scheduled_date: DateKey; end_date: DateKey | null } | { target_date: DateKey };

/**
 * 从 grabbed（按下时那一天）拖到 dropped（松手时那一天）后，任务的日期改成什么。
 * 差 0 天、条目不能拖、任务没对应的日期，都回 null。
 */
export function calDropPatch(task: Pick<Task, 'scheduled_date' | 'end_date' | 'target_date'>, role: CalDragRole, grabbed: DateKey, dropped: DateKey): CalDatePatch | null {
  if (!canDragCalItem(role)) return null;
  const delta = diffDays(grabbed, dropped);
  if (!delta) return null;
  if (role === 'countdown') return task.target_date ? { target_date: addDays(task.target_date, delta) } : null;
  if (!task.scheduled_date) return null;
  const end = task.end_date && task.end_date > task.scheduled_date ? addDays(task.end_date, delta) : null;
  return { scheduled_date: addDays(task.scheduled_date, delta), end_date: end };
}

/** 撤销用：改之前那几个字段原来的值（和 calDropPatch 的形状对上）。 */
export function calUndoPatch(task: Pick<Task, 'scheduled_date' | 'end_date' | 'target_date'>, patch: CalDatePatch): Partial<Pick<Task, 'scheduled_date' | 'end_date' | 'target_date'>> {
  if ('target_date' in patch) return { target_date: task.target_date };
  return { scheduled_date: task.scheduled_date, end_date: task.end_date ?? null };
}

/** 改完后新的开始日（提示里写「改到 X」用）。 */
export function calPatchStart(patch: CalDatePatch): DateKey {
  return 'target_date' in patch ? patch.target_date : patch.scheduled_date;
}

/** 键盘挪一天 / 一周（⌥← / ⌥→，周视图）：按住的就是开始日，挪 n 天。 */
export function calShiftPatch(task: Pick<Task, 'scheduled_date' | 'end_date' | 'target_date'>, role: CalDragRole, n: number): CalDatePatch | null {
  const start = role === 'countdown' ? task.target_date : task.scheduled_date;
  if (!start) return null;
  return calDropPatch(task, role, start, addDays(start, n));
}
