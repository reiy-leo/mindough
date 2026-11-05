/**
 * 项目（代码里叫 group，界面叫「项目」）的名字和图标（Rei 2026-11-01「项目的图标、名称要可以编辑」）。
 *
 * 图标存在 group.icon 里，有两种写法：
 * - emoji 原样存，比如「🏠」（老数据都是这种）；
 * - lucide 图标存成 `lucide:名字`，比如 `lucide:briefcase`。
 * 图标选择器给的是「emoji 或不带前缀的 lucide 名」，存之前用 groupIconFromPicker 转一下；
 * 画图标前用 groupIconName 去掉前缀。两种都能读，老客户端看到 `lucide:` 开头的只会当成一段字显示，不会坏。
 */

export const GROUP_LUCIDE_PREFIX = 'lucide:';
export const DEFAULT_GROUP_ICON = '📁';

const LUCIDE_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** 图标选择器的值（emoji 或 lucide 名）→ 存进 group.icon 的样子。空的给默认文件夹。 */
export function groupIconFromPicker(value: string | null | undefined): string {
  const s = (value ?? '').trim();
  if (!s) return DEFAULT_GROUP_ICON;
  if (s.startsWith(GROUP_LUCIDE_PREFIX)) return LUCIDE_NAME.test(s.slice(GROUP_LUCIDE_PREFIX.length)) ? s : DEFAULT_GROUP_ICON;
  return LUCIDE_NAME.test(s) ? GROUP_LUCIDE_PREFIX + s : s;
}

/** group.icon → 图标名（emoji 原样；lucide 去掉前缀），交给界面的 typeIcon 画。空的给默认文件夹。 */
export function groupIconName(icon: string | null | undefined): string {
  const s = (icon ?? '').trim();
  if (!s) return DEFAULT_GROUP_ICON;
  return s.startsWith(GROUP_LUCIDE_PREFIX) ? s.slice(GROUP_LUCIDE_PREFIX.length) : s;
}

/** 项目名：去掉首尾空白、多个空白并成一个；空的返回 null（不让改成空名字）。 */
export function normalizeGroupName(name: string | null | undefined): string | null {
  const s = (name ?? '').replace(/\s+/g, ' ').trim();
  return s ? s : null;
}

/**
 * 解散 / 删除项目的撤销记录（提示里的「撤销」用）。
 * - dissolve：项目打了墓碑，任务留着、移出项目；tasks 记下原来的 group_id。
 * - delete：项目和里面的任务（连同任务的前后关系、我的一天、附件等）都打了墓碑；rows 记下打墓碑的每一行。
 */
export type GroupRemovalUndo =
  | { kind: 'dissolve'; groupId: string; tasks: Array<{ id: string; group_id: string }> }
  | { kind: 'delete'; groupId: string; rows: Array<{ table: string; id: string }> };

export interface GroupRemovalResult {
  /** 涉及几件任务（解散 = 留下几件，删除 = 删了几件）。 */
  tasks: number;
  undo: GroupRemovalUndo;
}

/**
 * 项目归档（Rei 2026-11-05「项目可以归档」）：group.archived_at 有值就是归档了。
 * 归档只是收起来：项目和任务都留着、不改任务本身；取消归档后一切照旧。
 */
export function isGroupArchived(group: { archived_at?: string | null } | null | undefined): boolean {
  return !!group?.archived_at;
}

/** 任务在归档了的项目里吗（不在项目里、项目删了的都不算）。groups 传 id → 项目。 */
export function inArchivedGroup(task: { group_id: string | null }, groups: ReadonlyMap<string, { deleted?: boolean; archived_at?: string | null }>): boolean {
  if (!task.group_id) return false;
  const g = groups.get(task.group_id);
  return !!g && !g.deleted && isGroupArchived(g);
}
