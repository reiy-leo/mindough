import { CheckInMetError, CycleError, DuplicateEdgeError, LinkedByDependencyError, SelfLinkError, SelfLoopError, isFinished, toDateKey, type CompleteResult, type Store, type TaskStatus } from '@mindough/core';
import type { useUi } from './ui';
import { titleOf as taskTitleOf } from './view';

import { tr } from './i18n';
type Ui = ReturnType<typeof useUi>;

function titleOf(store: Store, id: string) {
  const t = store.get('task', id);
  return t ? taskTitleOf(store, t) : tr('任务');
}

/** 结束（完成 / 关闭）后的提示：解锁了哪些后续 + “然后呢？”一键新建后续 + 撤销。 */
/** undo：撤销时做什么（默认改回原来的状态；计数加量完成的，撤销那一次加量）。 */
export function announceComplete(store: Store, ui: Ui, result: CompleteResult, prev: TaskStatus, undo?: () => void) {
  const n = result.unlocked.length;
  const names = result.unlocked.slice(0, 3).map((t) => tr('「{titleOf}」', { titleOf: titleOf(store, t.id) })).join(tr('、'));
  const verb = result.task.status === '关闭' ? tr('已关闭') : tr('已完成');
  ui.toast(
    {
      tone: result.task.status === '关闭' ? 'info' : 'success',
      message: n ? (n > 3 ? tr('{verb}，接下来可以做 {names} 等 {n} 件事', { verb, names, n }) : tr('{verb}，接下来可以做 {names}', { verb, names })) : tr('{verb}「{titleOf}」', { verb, titleOf: titleOf(store, result.task.id) }),
      actions: [
        {
          label: tr('然后呢？'),
          onPress: () => ui.openQuickCreate({ group_id: result.task.group_id }, { after: result.task.id }),
        },
        { label: tr('撤销'), onPress: undo ?? (() => store.setStatus(result.task.id, prev)) },
      ],
    },
    7000,
  );
}

export function toggleDone(store: Store, ui: Ui, taskId: string) {
  const t = store.get('task', taskId);
  if (!t) return;
  // 已结束（完成或关闭）再点一下 = 重新打开
  if (isFinished(t.status)) {
    store.reopenTask(taskId);
    return;
  }
  announceComplete(store, ui, store.completeTask(taskId), t.status);
}

/**
 * 勾选完成的打卡（Rei 2026-11-09 01:30）：圆圈勾上 = 今天打一次卡；已经打了再点 = 撤销今天这一次（可以退回去）。
 * 目标 1 的计数打卡也走这里（core checkInMode）。
 */
export function toggleCheckIn(store: Store, ui: Ui, taskId: string, date: string = toDateKey(store.now())) {
  const t = store.get('task', taskId);
  if (!t) return;
  if (store.progress(taskId, date)?.met) {
    const last = store.lastCountAdd(taskId, date);
    if (last) store.undoCheckIn(last.id);
    return;
  }
  try {
    const r = store.checkIn(taskId, 'add', 1, date);
    if (r.completed) announceComplete(store, ui, r.completed, t.status);
  } catch (e) {
    if (e instanceof CheckInMetError) return ui.toast({ message: e.message }, 2500);
    throw e;
  }
}

/** 关闭：不做了，也算结束（同样解锁后续），但不算成就。 */
export function closeTask(store: Store, ui: Ui, taskId: string) {
  const t = store.get('task', taskId);
  if (!t || t.status === '关闭') return;
  announceComplete(store, ui, store.closeTask(taskId), t.status);
}

/**
 * 打卡归档 / 取消归档（Rei 2026-11-02「打卡任务可以归档」），提示里能撤销。
 * 归档时今天在我的一天里的会顺手移出；撤销只恢复归档状态，不把它加回我的一天。
 */
export function archiveHabit(store: Store, ui: Ui, taskId: string, archived: boolean) {
  const t = store.get('task', taskId);
  if (!t || !!t.archived_at === archived) return;
  if (archived) {
    store.archiveTask(taskId);
    ui.toast({ message: tr('已归档「{title}」，在打卡页最下面「已归档」里', { title: titleOf(store, taskId) }), actions: [{ label: tr('撤销'), onPress: () => store.unarchiveTask(taskId) }] }, 6000);
  } else {
    store.unarchiveTask(taskId);
    ui.toast({ message: tr('已取消归档「{title}」', { title: titleOf(store, taskId) }) }, 3000);
  }
}

/** 改状态：结束态走解锁提示，其余直接改。 */
export function changeStatus(store: Store, ui: Ui, taskId: string, status: TaskStatus) {
  const t = store.get('task', taskId);
  if (!t || t.status === status) return;
  if (isFinished(status)) announceComplete(store, ui, store.setStatus(taskId, status), t.status);
  else store.setStatus(taskId, status);
}

/** 加依赖：环检测失败时提示，返回是否成功。 */
export function tryAddDependency(store: Store, ui: Ui, predId: string, succId: string): boolean {
  try {
    store.addDependency(predId, succId);
    ui.toast({ tone: 'info', message: tr('已连上：做完「{titleOf}」，就能开始「{titleOf2}」', { titleOf: titleOf(store, predId), titleOf2: titleOf(store, succId) }) }, 3500);
    return true;
  } catch (e) {
    if (e instanceof CycleError) {
      const path = e.path.map((id) => titleOf(store, id)).join(' → ');
      ui.toast({ tone: 'error', message: tr('没有连上：这样会绕成一个圈（{path}）', { path }) });
    } else if (e instanceof SelfLoopError || e instanceof DuplicateEdgeError) {
      ui.toast({ tone: 'error', message: e.message });
    } else throw e;
    return false;
  }
}

/** 标为相关（只是有关系，不分先后）；连上了列表里就会出现，不另弹提示；不能连时给一句。 */
export function tryLinkTasks(store: Store, ui: Ui, x: string, y: string): boolean {
  try {
    store.linkTasks(x, y);
    return true;
  } catch (e) {
    if (e instanceof SelfLinkError || e instanceof LinkedByDependencyError) {
      ui.toast({ tone: 'error', message: e.message });
      return false;
    }
    throw e;
  }
}

/**
 * 置顶 / 取消置顶（Rei 2026-11-08「任务支持置顶，置顶的任务在我的一天中永远显示，直到用户手动关闭」），提示里能撤销。
 */
export function togglePin(store: Store, ui: Ui, taskId: string) {
  const t = store.get('task', taskId);
  if (!t) return;
  const title = titleOf(store, taskId);
  if (t.pinned_at) {
    store.unpinTask(taskId);
    ui.toast({ message: tr('已取消置顶「{title}」', { title }), actions: [{ label: tr('撤销'), onPress: () => store.pinTask(taskId) }] }, 4000);
  } else {
    store.pinTask(taskId);
    ui.toast({ tone: 'success', message: tr('已置顶「{title}」，每天都在我的一天最上面', { title }), actions: [{ label: tr('撤销'), onPress: () => store.unpinTask(taskId) }] }, 4000);
  }
}

export function toggleMyDay(store: Store, ui: Ui, taskId: string) {
  // 置顶的每天都在我的一天里（Rei 2026-11-08）：移出没用，提示先取消置顶
  if (store.get('task', taskId)?.pinned_at) {
    ui.toast({ message: tr('置顶的任务每天都在我的一天里，要移出先取消置顶'), actions: [{ label: tr('取消置顶'), onPress: () => togglePin(store, ui, taskId) }] }, 5000);
    return;
  }
  if (store.isInMyDay(taskId)) {
    store.removeFromMyDay(taskId);
    ui.toast({ message: tr('已移出我的一天') }, 2500);
  } else {
    store.addToMyDay(taskId);
    ui.toast({ tone: 'success', message: tr('已加入我的一天：「{titleOf}」', { titleOf: titleOf(store, taskId) }) }, 2500);
  }
}
