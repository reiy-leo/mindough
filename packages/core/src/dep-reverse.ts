/**
 * 前后关系换方向（Rei 2026-11-18「前置任务和后置任务可以拖拽更换」）。
 *
 * 详情「先做完这些」里的一件拖到「做完后解锁」（或反过来），就是把 A → B 换成 B → A。
 * 写入在 Store.reverseDependency：旧的那条打墓碑、新连一条反方向的，一批写完。
 *
 * 两种不能换：
 * - 自动连上的（isAutoDependency）：打卡达标时存正文生成的那条（checkInArchiveDepId），
 *   循环倒数日每过一次生成的记录那条（countdownRecordDepId / isCountdownRecordEdge）。它们的意思是固定的，换了就错了。
 * - 换了会绕成圈的（reverseCycle）：A 除了这条以外还能顺着别的前后关系走到 B，再连 B → A 就是一个圈。
 */
import { tr } from './i18n';
import { wouldCreateCycle, type Edge } from './dag';
import { checkInArchiveDepId } from './checkin-archive';
import { countdownRecordDepId, isCountdownRecordEdge } from './countdown-repeat';
import type { Dependency, Task } from './types';

/** 自动连上的前后关系，不能换方向。 */
export class AutoDependencyError extends Error {
  constructor() {
    super(tr('这条前后关系是自动连上的，不能换方向'));
    this.name = 'AutoDependencyError';
  }
}

/**
 * 这条前后关系是不是系统自己连的。dep 是依赖行（要 id），pred 是它的前置任务。
 * - 打卡存档：行 id 恰好是 checkInArchiveDepId(前置)。
 * - 循环倒数日的记录：前置是那次的记录（isCountdownRecordEdge），或者行 id 恰好是 countdownRecordDepId(后续, 前置的目标日)。
 */
export function isAutoDependency(dep: Pick<Dependency, 'id' | 'pred_id' | 'succ_id'>, pred: Pick<Task, 'id' | 'completion_mode' | 'target_date'> | null | undefined): boolean {
  if (dep.id === checkInArchiveDepId(dep.pred_id)) return true;
  if (isCountdownRecordEdge(dep, pred)) return true;
  return !!pred?.target_date && dep.id === countdownRecordDepId(dep.succ_id, pred.target_date);
}

/**
 * 把 pred → succ 换成 succ → pred 会不会绕成圈：去掉这条以后，pred 还能顺着别的关系走到 succ 就会。
 * 会的话返回圈上的任务 id（从 pred 出发、回到 pred），不会返回 null。
 */
export function reverseCycle(edges: readonly Edge[], pred: string, succ: string): string[] | null {
  const rest = edges.filter((e) => !(e.pred_id === pred && e.succ_id === succ));
  return wouldCreateCycle(rest, succ, pred);
}
