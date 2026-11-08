/**
 * 严格模式（Rei 2026-11-08「设置-任务中，添加严格模式switch，严格模式开启后完成的任务不能修改」；23:38「完成和关闭的任务都锁」）。
 *
 * - 开关存在客户端的本机设置里，客户端打开时把它告诉 Store（store.strictDone）。
 * - 开着时，状态是「完成」或「关闭」的任务算锁住：Store.write 收到碰它的写入就整批不写，抛 StrictModeError。
 *   碰它 = 改任务行本身，或者写挂在它身上的行（前后关系、相关任务、我的一天、人物 / 类型 / 资料关联、打卡事件、附件）。
 * - 放行：重新打开（任务行的状态改回没结束的），和删除任务（同一批里有这件任务的墓碑，连带的墓碑一起放行）。
 *   完成 ↔ 关闭 互换也算改，拦下。同步拉下来的行（applyRemote）不经过 write，不拦。
 */
import { tr } from './i18n';
import { isFinished, type BaseRow, type TableName, type Task } from './types';

export class StrictModeError extends Error {
  constructor() {
    super(tr('严格模式下已完成或已关闭的任务不能修改'));
    this.name = 'StrictModeError';
  }
}

/** 这件任务锁住了吗：严格模式开着、任务还在、状态是完成或关闭。 */
export function isStrictLocked(strict: boolean, task: Pick<Task, 'status' | 'deleted'> | null | undefined): boolean {
  return strict && !!task && !task.deleted && isFinished(task.status);
}

/** 这一行挂在哪些任务上（任务行本身不算，单独看）。 */
export function rowTaskIds(table: TableName, row: BaseRow): string[] {
  const r = row as unknown as Record<string, unknown>;
  switch (table) {
    case 'dependency':
      return [r.pred_id, r.succ_id].filter((x): x is string => typeof x === 'string');
    case 'task_link':
      return [r.a_task_id, r.b_task_id].filter((x): x is string => typeof x === 'string');
    case 'my_day':
    case 'task_person':
    case 'task_category':
    case 'task_item':
    case 'check_in':
      return typeof r.task_id === 'string' ? [r.task_id] : [];
    case 'attachment':
      return r.owner_type === 'task' && typeof r.owner_id === 'string' ? [r.owner_id] : [];
    default:
      return [];
  }
}

/**
 * 这批写入碰了锁住的任务吗。locked(id) = 写之前这件任务锁着。
 * 删除任务那一批（含任务行的墓碑）整批放行。
 */
export function violatesStrict(changes: ReadonlyArray<{ table: TableName; row: BaseRow }>, locked: (taskId: string) => boolean): boolean {
  const deleting = new Set(changes.filter((c) => c.table === 'task' && c.row.deleted).map((c) => c.row.id));
  for (const c of changes) {
    if (c.table === 'task') {
      if (!locked(c.row.id) || c.row.deleted) continue;
      // 重新打开放行；写进去还是完成 / 关闭，就是在改内容（含完成 ↔ 关闭互换）
      if (!isFinished((c.row as Task).status)) continue;
      return true;
    }
    for (const id of rowTaskIds(c.table, c.row)) if (locked(id) && !deleting.has(id)) return true;
  }
  return false;
}
