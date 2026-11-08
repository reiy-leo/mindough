/**
 * 我的一天当天的清单（页面、侧栏数字、小组件快照共用）：my_day 的行（藏掉归档项目里的、过时的自动行，见 project-archive.ts）
 * 加上置顶的任务（Rei 2026-11-08「任务支持置顶，置顶的任务在我的一天中永远显示，直到用户手动关闭」，core pinnedDayItems）。
 * 置顶的排在最前面，分段后在「未完成」段最上面；做完那天在「已完成」段。
 * 再加上今天要打的打卡（Rei 2026-11-09 01:27「打卡任务，如果今天有节点，也要显示在我的一天中」，core checkInDayItems）：虚拟行，
 * 排在手动加的后面；达标了进「已完成」段；用户移出当天（my_day 墓碑）就不再出现。
 */
import { checkInDayItems, myDayItems, pinnedDayItems, toDateKey, withPinned, type MyDayItem, type Store } from '@mindough/core';
import { visibleDayEntries } from './project-archive';

export function dayItems(store: Store, now: Date = store.now()): MyDayItem[] {
  const today = toDateKey(now);
  const tasks = store.list('task');
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const checkIns = store.list('check_in');
  const groups = store.list('group');
  const items = myDayItems(visibleDayEntries(store, store.list('my_day')), byId, checkIns, today, now);
  // 这一天表里有过行的（活的、移出留下的墓碑）不再出虚拟行
  const seen = new Set(store.listAll('my_day').filter((e) => e.date === today).map((e) => e.task_id));
  const virtual = checkInDayItems(tasks, groups, checkIns, today, now, seen);
  // 分段时按 done 拆开，所以达标的会落进「已完成」段；未完成的排在手动加的后面
  return withPinned([...items, ...virtual], pinnedDayItems(tasks, groups, checkIns, today, now));
}
