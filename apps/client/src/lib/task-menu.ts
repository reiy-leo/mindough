/**
 * 任务详情顶栏「…」菜单里有哪些项、按什么顺序、哪里加分隔线。
 * 「关闭」从详情底部挪进这里（Rei 2026-10-17「任务窗口底部的close按钮，移动到ellipsis下拉菜单中去」）：
 * 我的一天 ｜ 状态（直接标为完成、关闭 / 不再打卡，结束了的换成 重新打开 / 恢复打卡；打卡还有 归档 / 取消归档） ｜ 删除…
 * 归档（Rei 2026-11-02「打卡任务可以归档」）只给没结束的重复任务：先收起来，以后可能再打；「不再打卡」是结束这件事。
 * 归档了的只剩「取消归档」，不再给「不再打卡」（先取消归档再决定）。
 * 置顶（Rei 2026-11-08）：「置顶 / 取消置顶」跟在我的一天后面、同一组；置顶了的每天都在我的一天，不再给「加入 / 移出我的一天」。
 * 纯逻辑，好测；TaskDetail 按 id 接上动作和图标。
 */
import { isFinished, type Task } from '@mindough/core';
import { tr } from './i18n';

export type DetailMenuId = 'myday' | 'pin' | 'unpin' | 'done' | 'close' | 'reopen' | 'archive' | 'unarchive' | 'delete';

export interface DetailMenuEntry {
  id: DetailMenuId;
  label: string;
  danger?: boolean;
  /** 这一项前面画一条分隔线（换了一组） */
  separator?: boolean;
}

/** 我的一天这一组：没置顶的「加入 / 移出我的一天」+「置顶」；置顶了的只有「取消置顶」。 */
function dayGroup<T extends string>(inDay: boolean, pinned: boolean): { id: T; label: string }[] {
  if (pinned) return [{ id: 'unpin' as T, label: tr('取消置顶') }];
  return [
    { id: 'myday' as T, label: inDay ? tr('移出我的一天') : tr('加入我的一天') },
    { id: 'pin' as T, label: tr('置顶') },
  ];
}

export function detailMenu(task: Pick<Task, 'status' | 'recurrence' | 'completion_mode' | 'archived_at' | 'pinned_at'>, inDay: boolean): DetailMenuEntry[] {
  const finished = isFinished(task.status);
  const recurring = !!task.recurrence;
  const out: DetailMenuEntry[] = dayGroup<DetailMenuId>(inDay, !!task.pinned_at);
  const status: DetailMenuEntry[] = [];
  if (recurring && !finished && task.archived_at) {
    // 归档了：不进我的一天，只能取消归档
    return [{ id: 'unarchive', label: tr('取消归档') }, { id: 'delete', label: tr('删除…'), danger: true, separator: true }];
  }
  if (finished) status.push({ id: 'reopen', label: recurring ? tr('恢复打卡') : tr('重新打开') });
  else {
    // 勾选完成的任务底部本来就有「完成」，这里不重复
    if (!recurring && task.completion_mode !== 'once') status.push({ id: 'done', label: tr('直接标为完成') });
    status.push({ id: 'close', label: recurring ? tr('不再打卡') : tr('关闭') });
    if (recurring) status.push({ id: 'archive', label: tr('归档') });
  }
  status[0]!.separator = true;
  out.push(...status, { id: 'delete', label: tr('删除…'), danger: true, separator: true });
  return out;
}

export type RowMenuId = 'open' | 'myday' | 'pin' | 'unpin';

export type HabitMenuId = 'open' | 'myday' | 'pin' | 'unpin' | 'archive' | 'unarchive';

/** 一组菜单项，第一项前画分隔线。 */
const asGroup = <T extends string>(xs: { id: T; label: string }[]): { id: T; label: string; separator?: boolean }[] => xs.map((x, i) => (i === 0 ? { ...x, separator: true } : x));

/**
 * 打卡页一行的右键 / 长按菜单（Rei 2026-11-02「打卡任务可以归档」）：查看详情 ｜ 加入 / 移出我的一天 ｜ 归档；
 * 归档了的：查看详情 ｜ 取消归档。
 */
export function habitMenu(archived: boolean, inDay: boolean, pinned = false): { id: HabitMenuId; label: string; separator?: boolean }[] {
  if (archived) return [{ id: 'open', label: tr('查看详情') }, { id: 'unarchive', label: tr('取消归档'), separator: true }];
  return [{ id: 'open', label: tr('查看详情') }, ...asGroup(dayGroup<HabitMenuId>(inDay, pinned)), { id: 'archive', label: tr('归档'), separator: true }];
}

/**
 * 任务列表行的右键 / 长按菜单（Rei 2026-10-25「任何情况下都不显示这两个按钮」：
 * 我的一天「建议」行尾的「今天到期」徽章和「+ 加入」按钮去掉了，加入我的一天挪到这里）。
 * 所有用 TaskRow 的列表都有：查看详情 ｜ 加入 / 移出我的一天、置顶（置顶了的只有「取消置顶」，Rei 2026-11-08）。
 */
export function rowMenu(inDay: boolean, pinned = false): { id: RowMenuId; label: string; separator?: boolean }[] {
  return [{ id: 'open', label: tr('查看详情') }, ...asGroup(dayGroup<RowMenuId>(inDay, pinned))];
}
