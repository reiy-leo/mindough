/**
 * 已完成页（侧栏「管理 → 已完成」，#/done；Rei 2026-11-08「侧边栏 管理 添加一个"已完成"入口」）的纯逻辑。
 *
 * - 列哪些：状态是「完成」或「关闭」的任务（core isFinished，和别处「结束了」的判断一样）。
 *   打卡（重复任务）每天打卡不改状态，所以只有整条结束了（完成 / 关闭）才进来；倒数日同理，关掉或标完成的才进来。
 *   归档项目里的任务不列：调用方传 store.activeTasks()，和积压、待安排一样。
 * - 怎么排：按结束时间从新到旧。结束时间是 done_at（完成、关闭都记）；老数据没有 done_at 的，拿最后修改时间（updated_at 的 HLC 毫秒）顶上。
 * - 怎么分段：按结束时间落在本机的哪一天分段；段标题今天 / 昨天 / 具体日期（不是今年带年份）。
 */
import { dayOf } from './day-start';
import { diffDays, formatDate, parseDateKey } from './dates';
import { parseHlc } from './hlc';
import { tr } from './i18n';
import { isFinished, type DateKey, type Task } from './types';

export type DoneListTask = Pick<Task, 'id' | 'status' | 'done_at' | 'updated_at'> & { deleted?: boolean | number };

/** 结束时间（毫秒）：done_at；没有或读不出就用 updated_at 的 HLC 毫秒；都没有是 0（排最后）。 */
export function finishedAtMs(task: Pick<Task, 'done_at' | 'updated_at'>): number {
  if (task.done_at) {
    const ms = Date.parse(task.done_at);
    if (!Number.isNaN(ms)) return ms;
  }
  if (task.updated_at) {
    const ms = parseHlc(task.updated_at).ms;
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return 0;
}

/** 已完成和已关闭的任务，按结束时间从新到旧；同一时刻按 id 倒序（UUIDv7，后建的在前），顺序在各端一致。 */
export function doneTasks<T extends DoneListTask>(tasks: readonly T[]): T[] {
  return tasks
    .filter((t) => !t.deleted && isFinished(t.status))
    .map((t) => ({ t, ms: finishedAtMs(t) }))
    .sort((a, b) => b.ms - a.ms || (a.t.id < b.t.id ? 1 : a.t.id > b.t.id ? -1 : 0))
    .map((x) => x.t);
}

export interface DoneDay<T> {
  /** 本机日期；完全没有时间的任务是 null，放最后一段。 */
  date: DateKey | null;
  tasks: T[];
}

/**
 * 按结束那天分段（段从新到旧，段里也从新到旧）。toLocalDate 把毫秒换成本机日期，默认按运行环境时区。
 */
export function doneDays<T extends DoneListTask>(tasks: readonly T[], toLocalDate: (ms: number) => DateKey = (ms) => dayOf(ms)): DoneDay<T>[] {
  const out: DoneDay<T>[] = [];
  for (const t of doneTasks(tasks)) {
    const ms = finishedAtMs(t);
    const date = ms > 0 ? toLocalDate(ms) : null;
    const last = out[out.length - 1];
    if (last && last.date === date) last.tasks.push(t);
    else out.push({ date, tasks: [t] });
  }
  return out;
}

/** 段标题：今天 / 昨天 / 具体日期（「11月6日 周五」，不是今年带年份）；没有时间的段叫「更早」。 */
export function doneDayLabel(date: DateKey | null, today: DateKey): string {
  if (!date) return tr('更早');
  const n = diffDays(today, date);
  if (n === 0) return tr('今天');
  if (n === -1) return tr('昨天');
  return formatDate(date, { year: parseDateKey(date).y !== parseDateKey(today).y });
}
