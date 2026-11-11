import type { Route } from './router';

/** 中间列不放页头的页面（Rei 2026-10-26；打卡页 2026-11-10、日历页 2026-11-12 去掉页头）：手机上标题显示在顶栏。 */
export const HEADERLESS_PAGES: Route['page'][] = ['myday', 'backlog', 'doable', 'checkin', 'agenda'];

/**
 * 手机顶栏放什么（Rei 2026-11-11 02:09「只有我的一天保留这个搜索，其他页面都不显示」，不要因此留出空行）：
 * - search：我的一天，标题 + 搜索按钮；
 * - title：别的没有页头的页（待安排、可做、打卡），只放标题；
 * - none：有自己页头的页，不要顶栏这一行，只留状态栏那一截（网页版是 0 高）。
 * 宽屏的搜索在侧栏顶上，跟这个无关；⌘K / Ctrl K 哪一页都能开搜索。
 */
export type MobileTopbar = 'search' | 'title' | 'none';

export function mobileTopbar(page: Route['page']): MobileTopbar {
  if (page === 'myday') return 'search';
  return HEADERLESS_PAGES.includes(page) ? 'title' : 'none';
}
