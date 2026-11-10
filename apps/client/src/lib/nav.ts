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

// ───────────── 手机底部标签栏（Rei 2026-11-10） ─────────────

/**
 * 手机底部标签栏的固定几项，按这个顺序排，最后再放「更多」（Rei 2026-11-10 11:44「安卓端 tabbar默认显示：我的一天、待安排、打卡、日记、更多」）。
 * 以前是 我的一天 · 等待安排 · 打卡 · 时间轴 · 更多；时间轴挪进「更多」，日记从「更多」挪出来。
 * 标签栏不能自定义，所有手机布局（安卓、iOS、窄屏网页）共用这一份，不分平台。
 * 不在这里的入口都在「更多」页，按侧边栏的分组和顺序列。
 */
export const MOBILE_TABS = ['myday', 'backlog', 'checkin', 'journal'] as const satisfies readonly Route['page'][];

/** 是不是标签栏上的入口（「更多」页用它把这几项去掉）。 */
export function isMobileTab(page: Route['page']): boolean {
  return (MOBILE_TABS as readonly string[]).includes(page);
}

/** 从侧边栏入口里挑出标签栏那几项，按 MOBILE_TABS 的顺序（不跟侧边栏顺序走）。放进侧边栏的库 / 项目（带 key）不算。 */
export function mobileTabItems<T extends { page: Route['page']; key?: string }>(items: readonly T[]): T[] {
  return MOBILE_TABS.flatMap((page) => {
    const it = items.find((n) => n.page === page && !n.key);
    return it ? [it] : [];
  });
}
