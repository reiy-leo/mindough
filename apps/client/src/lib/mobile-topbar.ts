import type { Route } from './router';

/** 中间列不放页头的页面（Rei 2026-10-26；打卡页 2026-11-10、日历页、项目列表页、倒数日页、资料库页和类型页 2026-11-12 去掉页头；已完成、更多、设置 2026-11-12 09:41 手机也去掉）。 */
export const HEADERLESS_PAGES: Route['page'][] = ['myday', 'backlog', 'doable', 'checkin', 'agenda', 'groups', 'countdown', 'library', 'people', 'types', 'done', 'more', 'settings'];

/**
 * 手机顶栏放什么：
 * - bar：顶栏不写页名（Rei 2026-11-12 09:41「手机端的每一页的顶部都有header……例如打卡页，顶部还会显示"打卡"这两个字，页面都不用header」）。
 *   左边只有我的一天放今天的日期 + 农历（09:39，lib/topbar-slot TopbarLead），右边放页面送上来的按钮（我的一天的排序 / 分区；已完成 2026-11-12 10:19 起没有按钮）；
 *   两边都空的页顶栏收成只剩状态栏那一截（`.topbar.is-empty`），内容直接从状态栏下面开始。读屏的页名还在（顶栏里的 sr-only）。
 * - none：有自己页头的页（搜索页的页头是搜索框，项目 / 人物 / 资料详情页的标题是这一条的名字，日记页本来就没有页头），不要顶栏这一行，只留状态栏那一截（网页版是 0 高）。
 * 顶栏不放搜索按钮（Rei 2026-11-12 01:21「手机端任何页面都不显示搜索按钮」）：搜索是单独一页（#/search），从「更多」页最上面一行进。
 */
export type MobileTopbar = 'bar' | 'none';

export function mobileTopbar(page: Route['page']): MobileTopbar {
  return HEADERLESS_PAGES.includes(page) ? 'bar' : 'none';
}
