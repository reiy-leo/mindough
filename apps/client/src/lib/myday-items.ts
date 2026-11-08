/**
 * 我的一天当天的清单（页面、侧栏数字、小组件快照共用）：my_day 的行（藏掉归档项目里的、过时的自动行，见 project-archive.ts）
 * 加上置顶的任务（Rei 2026-11-08「任务支持置顶，置顶的任务在我的一天中永远显示，直到用户手动关闭」，core pinnedDayItems）。
 * 置顶的排在最前面，分段后在「未完成」段最上面；做完那天在「已完成」段。
 */
import { myDayItems, pinnedDayItems, toDateKey, withPinned, type MyDayItem, type Store } from '@mindough/core';
import { visibleDayEntries } from './project-archive';

export function dayItems(store: Store, now: Date = store.now()): MyDayItem[] {
  const today = toDateKey(now);
  const tasks = store.list('task');
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const checkIns = store.list('check_in');
  const items = myDayItems(visibleDayEntries(store, store.list('my_day')), byId, checkIns, today, now);
  return withPinned(items, pinnedDayItems(tasks, store.list('group'), checkIns, today, now));
}
