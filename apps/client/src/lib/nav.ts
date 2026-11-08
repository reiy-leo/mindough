/**
 * 侧边栏「管理」一节里资料库相关入口的纯逻辑（Rei 2026-10-26）。
 * - 「人物」不再单独占一项（18:54「侧边栏的：管理-人物入口删掉」），人物页、#/people、深链、⌘K 都照旧；
 *   在人物页 / 人物详情时，高亮「资料库」（或放进侧边栏的人物库）。
 * - 资料库可以「在侧边栏显示」（18:55），显示的库排在「资料库」下面，点了直接进那个库。
 */
import { BUILTIN_TYPE_IDS } from '@mindough/core';
import type { Route } from './router';

/** 打开某个库的路由：人物库走 #/people（和资料库标签条一致）。 */
export function libraryRoute(typeId: string): Route {
  return typeId === BUILTIN_TYPE_IDS.person ? { page: 'people' } : { page: 'library', typeId };
}

/** 当前路由属于哪个库（看库、看库里的一条、人物页、人物详情）；资料库首页没带库、或别的页面是 null。 */
export function routeLibraryId(route: Route): string | null {
  switch (route.page) {
    case 'library':
      return route.typeId ?? null;
    case 'libitem':
      return route.typeId;
    case 'people':
    case 'person':
      return BUILTIN_TYPE_IDS.person;
    default:
      return null;
  }
}

/** 是不是资料库这一片的页面。 */
export function isLibraryRoute(route: Route): boolean {
  return route.page === 'library' || route.page === 'libitem' || route.page === 'people' || route.page === 'person';
}

/**
 * 侧边栏里哪个入口亮：放进侧边栏的那个库亮它自己，其他资料库页面都亮「资料库」。
 * 返回 'library'、某个库的 id，或 null（不在资料库页面）。
 */
export function activeLibraryEntry(route: Route, pinnedIds: readonly string[]): string | null {
  if (!isLibraryRoute(route)) return null;
  const id = routeLibraryId(route);
  return id && pinnedIds.includes(id) ? id : 'library';
}

/**
 * 「管理」一节的入口，按顺序：资料库、放进侧边栏的库（按资料库顺序，调用方传 store.sidebarLibraries()）、类型、已完成。没有「人物」。
 * 「已完成」Rei 2026-11-08 加（「侧边栏 管理 添加一个"已完成"入口」），排在最后。
 */
export type ManageEntry = { kind: 'library' } | { kind: 'pinned'; typeId: string } | { kind: 'types' } | { kind: 'done' };
export function manageEntries(pinned: ReadonlyArray<{ id: string }>): ManageEntry[] {
  return [{ kind: 'library' }, ...pinned.map((t) => ({ kind: 'pinned' as const, typeId: t.id })), { kind: 'types' }, { kind: 'done' }];
}

// ───────────── 「计划」一节里的项目（Rei 2026-10-28） ─────────────

/** 「计划」一节的入口，按顺序：列表、项目、放进侧边栏的项目（按项目页顺序，调用方传 store.sidebarGroups()）。 */
export type PlanEntry = { kind: 'agenda' } | { kind: 'groups' } | { kind: 'pinned'; groupId: string };
export function planEntries(pinned: ReadonlyArray<{ id: string }>): PlanEntry[] {
  return [{ kind: 'agenda' }, { kind: 'groups' }, ...pinned.map((g) => ({ kind: 'pinned' as const, groupId: g.id }))];
}

/**
 * 侧边栏里哪个项目入口亮：打开的是放进侧边栏的项目就亮它自己，项目列表和其他项目亮「项目」。
 * 返回 'groups'、某个项目的 id，或 null（不在项目页面）。
 */
export function activeGroupEntry(route: Route, pinnedIds: readonly string[]): string | null {
  if (route.page === 'groups') return 'groups';
  if (route.page !== 'group') return null;
  return pinnedIds.includes(route.id) ? route.id : 'groups';
}

/** 项目图标（emoji，或 "lucide:名字"）→ 图标名，交给 typeIcon 画。空的给 📁。逻辑在 core（group.ts）。 */
export { groupIconName } from '@mindough/core';

/** 不放右下角新建按钮的任务列表页（Rei 2026-11-08 23:00「任务列表右下角的"+"新建任务按钮都去掉」）：顶上都有添加框。 */
export const TASK_LIST_PAGES: readonly Route['page'][] = ['myday', 'agenda', 'backlog', 'doable', 'done', 'groups', 'group'];

/** 这一页放不放右下角新建任务按钮：任务列表页和日记不放；打卡、倒数日、资料库、人物、类型、设置还放（先不删）。N 快捷键不受影响。 */
export function showNewTaskFab(page: Route['page']): boolean {
  return page !== 'journal' && !TASK_LIST_PAGES.includes(page);
}
