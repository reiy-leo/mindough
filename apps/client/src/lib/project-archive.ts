/**
 * 项目归档在界面上的规则（Rei 2026-11-05「项目可以归档」，core 见 Store.archiveGroup / activeTasks）。
 *
 * 我的一天里，归档项目的任务不显示（自动加进来的、归档前放进来的都藏起来），取消归档后照旧回来；
 * 归档以后自己又放进来的（比如用全局搜索（⌘F）搜到再加进今天）照常显示：放进来的时间（added_at）晚于归档时间。
 * 只是不显示，不删我的一天的行，所以取消归档什么都不用补。
 * 自动加进来、现在已经不当前的（过期、没到）也在这里藏起来（Rei 2026-11-08）。
 */
import { isStaleAutoEntry, type MyDayEntry, type Store } from '@mindough/core';

export function visibleDayEntries(store: Store, entries: readonly MyDayEntry[]): MyDayEntry[] {
  const out: MyDayEntry[] = [];
  for (const e of entries) {
    const t = store.get('task', e.task_id);
    const at = t ? store.get('group', t.group_id)?.archived_at : null;
    // 自动加进来、现在已经不是今天的（过期、没到）也不显示（Rei 2026-11-08，core isStaleAutoEntry）；手动加的照常
    if (isStaleAutoEntry(e, t, store.now())) continue;
    if (!at || e.added_at > at) out.push(e);
  }
  return out;
}
