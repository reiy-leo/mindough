/**
 * 打卡前先存正文（Rei 2026-11-13 打卡正文存档）：详情里的正文打字先记在本地、失焦才存。
 * 打卡达标时 core 要把正文标题下面的内容挪走（Store.checkIn → archiveCheckInBody），得先拿到刚打的字；
 * 不然存档拿的是旧正文，编辑器之后又把整段旧正文写回打卡。
 * 详情里的正文、打卡描述各自登记一个「把没存的存下来」的函数；Store.beforeCheckIn 打卡 / 撤销前按任务 id 调它们。
 */
import type { Store } from '@mindough/core';

const flushers = new Map<string, Set<() => void>>();

/** 先存一下这件任务详情里没存的正文、打卡描述。 */
export function flushTaskEdits(taskId: string): void {
  for (const fn of flushers.get(taskId) ?? []) fn();
}

/** 登记；返回取消登记。第一次登记时把 Store.beforeCheckIn 接上。 */
export function registerTaskFlush(store: Store, taskId: string, fn: () => void): () => void {
  if (!store.beforeCheckIn) store.beforeCheckIn = flushTaskEdits;
  let set = flushers.get(taskId);
  if (!set) flushers.set(taskId, (set = new Set()));
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (!set!.size) flushers.delete(taskId);
  };
}
