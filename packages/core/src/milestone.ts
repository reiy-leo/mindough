/**
 * 项目阶段（Rei 2026-11-13 09:19「项目支持milestone。项目中添加或修改任务：添加新属性"阶段、里程碑"，这个属性只有项目中可以设置。
 * 每个项目中的这个属性的列表都不一样。显示为一个可搜索的dropdown，搜索可以选择，也可以新建。」）。
 *
 * - 每个项目一张自己的阶段列表（milestone 表，group_id = 项目）。英文 Milestone。
 * - 一件任务最多一个阶段（task.milestone_id）；只有在项目里的任务能设，阶段必须是任务现在这个项目的。
 *   移出项目、换到别的项目：本机写入时清掉（Store.write），不跨项目保留。
 * - 名字：去掉首尾空白、多个空白并成一个；同一个项目里不重名（比较时忽略大小写，NFKC）。
 * - 没有删除，只有归档：归档的不在选择器里列（任务上挂着的照常显示），搜到同名再「新建」就是把它取消归档、选上。
 * 这里只放纯函数，读写在 Store（milestones / createMilestone / setTaskMilestone …）。
 */
import { categoryMatches } from './category-prefs';
import type { Milestone } from './types';

/** 阶段名整理：首尾空白去掉、换行和连续空白并成一个空格；空的返回 null。 */
export function cleanMilestoneName(name: string | null | undefined): string | null {
  const s = (name ?? '').replace(/\s+/g, ' ').trim();
  return s ? s : null;
}

/** 比较是否重名用的键：整理后转小写（NFKC，全角半角一样）。 */
export function milestoneNameKey(name: string | null | undefined): string {
  return (cleanMilestoneName(name) ?? '').normalize('NFKC').toLowerCase();
}

/** 列表顺序：sort 小的在前，一样时先建的在前，再按 id，结果稳定。 */
export function sortMilestones<T extends Pick<Milestone, 'sort' | 'created_at' | 'id'>>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => a.sort - b.sort || (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** 名字搜不搜得到：包含（忽略大小写），中文名还能用拼音首字母 / 全拼（同类型选择器，category-prefs）。 */
export function milestoneMatches(name: string, query: string): boolean {
  return categoryMatches([name], query);
}

export type MilestoneOption<T> = { kind: 'milestone'; milestone: T } | { kind: 'create'; name: string };

/**
 * 选择器里的行（Rei：「搜索可以选择，也可以新建」）：
 * - 不搜：这个项目没归档的阶段，按列表顺序；任务现在挂的那个归档了也列上（好看出选的是哪个）。
 * - 搜：没归档的里名字搜得到的（同上，现在挂的归档了也算），按列表顺序；
 *   没有完全同名（忽略大小写、首尾空白）的，最后一行「新建「xxx」」。完全同名的是归档的那个时，也给「新建」，选了就是取消归档。
 */
export function milestoneOptions<T extends Pick<Milestone, 'id' | 'name' | 'sort' | 'created_at' | 'archived_at' | 'deleted'>>(
  all: readonly T[],
  query: string,
  currentId: string | null = null,
): MilestoneOption<T>[] {
  const live = sortMilestones(all.filter((m) => !m.deleted && (!m.archived_at || m.id === currentId)));
  const q = cleanMilestoneName(query);
  if (!q) return live.map((milestone) => ({ kind: 'milestone', milestone }));
  const rows: MilestoneOption<T>[] = live.filter((m) => milestoneMatches(m.name, q)).map((milestone) => ({ kind: 'milestone', milestone }));
  const key = milestoneNameKey(q);
  const exact = live.some((m) => milestoneNameKey(m.name) === key);
  if (!exact) rows.push({ kind: 'create', name: q });
  return rows;
}
