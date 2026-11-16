import type { Route } from './router';

/** 中间列不放页头的页面（Rei 2026-10-26；打卡页 2026-11-10、日历页、项目列表页、倒数日页、资料库页和类型页 2026-11-12 去掉页头；已完成、设置 2026-11-12 09:41 手机也去掉）。
 *  日记 2026-11-15 起也有顶栏这一行：左边放抽屉按钮。「更多」页 2026-11-15 删了（#/more 打开就回我的一天并拉出抽屉）。 */
export const HEADERLESS_PAGES: Route['page'][] = ['myday', 'backlog', 'doable', 'checkin', 'agenda', 'groups', 'countdown', 'journal', 'library', 'people', 'types', 'done', 'settings'];

/**
 * 有抽屉按钮的页：底栏、侧栏能直接进的页（Rei 2026-11-15「手机端导航改版」），加上项目详情页（2026-11-16 17:31「项目页也要添加侧边栏按钮」，
 * 放进侧边栏的项目从抽屉直接进，页里又没有「返回」）。点了从左边拉出侧栏。
 * 任务详情、资料 / 人物详情、设置子页这些有「返回」的二级页不放；搜索页顶上是搜索框，也不放。
 */
export const DRAWER_PAGES: Route['page'][] = ['myday', 'backlog', 'doable', 'agenda', 'groups', 'group', 'checkin', 'countdown', 'journal', 'library', 'people', 'types', 'done', 'settings'];

/**
 * 抽屉按钮放在页面自己第一行最左边、不在顶栏的页（Rei 2026-11-16 17:33「抽屉按钮单独占了一行……放在同一行」）：
 * 打卡（按今天 ⌄ · + · 筛选）、倒数日（视图 / 排序 / 分区 · +）、日历（‹ 今天 › 日期段 · 视图）、项目列表（类型胶囊 · +）、
 * 项目详情（项目名 · 视图 / 排序 / 分区 / ···）、资料库和人物库（库标签 · ··· · +）、类型（搜索框 · 列表 ⌄；窄屏详情是「‹ 全部类型」那一行）。
 * 这些页顶栏这一行不再有东西，收成只剩状态栏那一截（topbarState is-empty）。
 * 我的一天（日期左边）、等待安排（右边是分区按钮）照旧在顶栏；过期积压、已完成、日记、设置首页顶上没有工具行，抽屉按钮还是单独一行。
 */
export const INLINE_DRAWER_PAGES: Route['page'][] = ['checkin', 'countdown', 'agenda', 'groups', 'group', 'library', 'people', 'types'];

export function hasDrawerButton(route: Route): boolean {
  if (route.page === 'settings') return !route.section;
  return DRAWER_PAGES.includes(route.page);
}

/** 抽屉按钮放在顶栏（true），还是页面自己的工具行里 / 没有（false）。 */
export function drawerInTopbar(route: Route): boolean {
  return hasDrawerButton(route) && !INLINE_DRAWER_PAGES.includes(route.page);
}

/**
 * 顶栏这一行的样子：有日期（左格）就是正常高；只有抽屉按钮或右格按钮就是紧凑的 no-lead；什么都没有才收成只剩状态栏那一截。
 * 有抽屉按钮的页永远不收成空行。
 */
export function topbarState(o: { menu: boolean; lead: boolean; actions: boolean }): '' | ' no-lead' | ' is-empty' {
  if (o.lead) return '';
  return o.menu || o.actions ? ' no-lead' : ' is-empty';
}

/**
 * 手机顶栏放什么：
 * - bar：顶栏不写页名（Rei 2026-11-12 09:41「手机端的每一页的顶部都有header……例如打卡页，顶部还会显示"打卡"这两个字，页面都不用header」）。
 *   左边只有我的一天放今天的日期 + 农历（09:39，lib/topbar-slot TopbarLead），右边放页面送上来的按钮（我的一天的排序 / 分区；已完成 2026-11-12 10:19 起没有按钮）；
 *   两边都空的页顶栏收成只剩状态栏那一截（`.topbar.is-empty`），内容直接从状态栏下面开始。读屏的页名还在（顶栏里的 sr-only）。
 * - none：有自己页头的页（搜索页的页头是搜索框，项目 / 人物 / 资料详情页的标题是这一条的名字），不要顶栏这一行，只留状态栏那一截（网页版是 0 高）。
 * 顶栏不放搜索按钮（Rei 2026-11-12 01:21「手机端任何页面都不显示搜索按钮」）：搜索是单独一页（#/search），2026-11-15 起从底栏最后一格进。
 * 顶级页左边多一个抽屉按钮（hasDrawerButton），我的一天放在日期左边。
 */
export type MobileTopbar = 'bar' | 'none';

export function mobileTopbar(page: Route['page']): MobileTopbar {
  return HEADERLESS_PAGES.includes(page) ? 'bar' : 'none';
}
