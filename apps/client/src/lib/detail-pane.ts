/**
 * 三列布局右列的纯逻辑（Rei 2026-10-23）：宽度的上下限、↑ ↓ 换选中的任务。好测，组件在 components/task/DetailPane.tsx。
 */
import { normalizePrefs } from './project-view';

/** 宽屏：侧边栏 + 列表 + 详情三列常驻；比这窄是中等宽度（侧边栏收成图标栏，没选中时不占右列）。 */
export const WIDE_MIN = 1100;
/** 侧边栏收成图标栏时的宽度（styles/app.css 的 --rail-w 一致）。 */
export const RAIL_W = 64;
export const SIDEBAR_W = 248;
/** 列表至少留这么宽。 */
export const LIST_MIN = 360;
/**
 * 日记页中间列至少留这么宽（Rei 2026-11-13 01:21「关联任务后，点击任务出现侧边栏会把日记挤压到一条缝隙」）：
 * 日记自己分两栏，开着详情时左栏（活动图、心情）320（styles/journal.css .has-detail .jf-layout 的上限），
 * 右栏（输入框、条目）和别的列表页一样至少 LIST_MIN。放不下就不出右列，详情改用浮层，见 detailInModal。
 */
export const JOURNAL_SIDE_W = 320;
export const JOURNAL_MIN = JOURNAL_SIDE_W + LIST_MIN;

/** 这一页中间列至少留多宽。 */
export function listMinFor(page: string): number {
  return page === 'journal' ? JOURNAL_MIN : LIST_MIN;
}

/** 窗口这么宽时，右列（最窄 DETAIL_W_MIN）放上去中间列还剩不剩 listMin。 */
export function paneFits(viewport: number, listMin: number = LIST_MIN): boolean {
  const side = viewport >= WIDE_MIN ? SIDEBAR_W : RAIL_W;
  return viewport - side - listMin >= DETAIL_W_MIN;
}
export const DETAIL_W_MIN = 320;
export const DETAIL_W_MAX = 720;
export const DETAIL_W_DEFAULT = 400;
export const DETAIL_W_KEY = 'mindough:detail_w';

/** 把右列宽度收进 [最小, 最大]：最大还要给列表留出 listMin（默认 LIST_MIN，日记页 JOURNAL_MIN）。 */
export function clampDetailWidth(w: number, viewport: number, listMin: number = LIST_MIN): number {
  const side = viewport >= WIDE_MIN ? SIDEBAR_W : RAIL_W;
  const max = Math.max(DETAIL_W_MIN, Math.min(DETAIL_W_MAX, viewport - side - listMin));
  if (!Number.isFinite(w)) return Math.min(DETAIL_W_DEFAULT, max);
  return Math.round(Math.min(max, Math.max(DETAIL_W_MIN, w)));
}

/** 本机记的宽度（读不出来用默认）。 */
export function loadDetailWidth(saved: string | null, viewport: number): number {
  const n = saved === null ? NaN : Number(saved);
  return clampDetailWidth(Number.isFinite(n) && n > 0 ? n : DETAIL_W_DEFAULT, viewport);
}

/**
 * ↑ ↓ 换选中的任务：ids 是列表里的显示顺序。没选中（或选中的不在列表里）时 ↓ 选第一件、↑ 选最后一件；
 * 到头了不动（返回 null）。
 */
export function nextTaskId(ids: readonly string[], current: string | null, dir: 1 | -1): string | null {
  if (!ids.length) return null;
  const i = current ? ids.indexOf(current) : -1;
  if (i < 0) return (dir === 1 ? ids[0] : ids[ids.length - 1]) ?? null;
  return ids[i + dir] ?? null;
}

/**
 * 桌面布局下这一页的任务详情用浮层，不占右列（Rei 2026-11-09 00:25「项目 看板 不显示详情第三列，点击不显示详情」、
 * 00:28「切换到看板视图后，不要显示侧边的详情column」）：项目页切到看板视图时，看板占满，右列不出现，点卡片弹出详情浮层
 * （components/task/DetailModal.tsx）。侧栏的日历页（路由 agenda，原来的时间轴）也一样（Rei 2026-11-10「点击任务不显示详情侧边栏」）。
 * 侧栏「项目」总览页（路由 groups，只列项目卡片）也一样：没有右列，从搜索等处打开任务时弹浮层（Rei 2026-11-11「项目列表页 不显示任务详情侧边栏」）。
 * 日记页看窗口宽度（Rei 2026-11-13 01:21「正确应该不要挤压」）：右列放上去日记还剩 JOURNAL_MIN 就并排，放不下就用浮层盖在日记上，
 * 日记一点不挤；viewport 不传当作够宽。
 * 项目页的列表、时间轴、任务链视图和别的页面照旧用右列；手机布局本来就是整页详情，不走这里。
 */
export function detailInModal(route: { page: string; id?: string }, projectViews: Record<string, unknown>, viewport: number = Infinity): boolean {
  if (route.page === 'agenda' || route.page === 'groups') return true;
  if (route.page === 'journal') return !paneFits(viewport, JOURNAL_MIN);
  return route.page === 'group' && !!route.id && normalizePrefs(projectViews[route.id]).view === 'board';
}
