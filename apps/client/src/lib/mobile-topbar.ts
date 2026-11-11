import type { Route } from './router';

/** 中间列不放页头的页面（Rei 2026-10-26；打卡页 2026-11-10、日历页、项目列表页和倒数日页 2026-11-12 去掉页头）：手机上标题显示在顶栏。 */
export const HEADERLESS_PAGES: Route['page'][] = ['myday', 'backlog', 'doable', 'checkin', 'agenda', 'groups', 'countdown'];

/**
 * 手机顶栏放什么：
 * - title：没有页头的页（我的一天、待安排、可做、打卡、日历、项目列表、倒数日），只放标题；
 * - none：有自己页头的页（搜索页的页头是搜索框），不要顶栏这一行，只留状态栏那一截（网页版是 0 高）。
 * 顶栏不放搜索按钮（Rei 2026-11-12 01:21「手机端任何页面都不显示搜索按钮」；以前 2026-11-11 只在我的一天留着）：
 * 搜索是单独一页（#/search），从「更多」页最上面一行进。宽屏的搜索在侧栏顶上，跟这个无关；⌘F / Ctrl F 哪一页都能开搜索浮层。
 */
export type MobileTopbar = 'title' | 'none';

export function mobileTopbar(page: Route['page']): MobileTopbar {
  return HEADERLESS_PAGES.includes(page) ? 'title' : 'none';
}
