/**
 * 类型页每个大类下的类型「显示为：列表 / 图标」（Rei 2026-11-11 08:33）。列表是原来的一行一个；图标是图标格子、名字在图标下面。
 * 存本机设置 categoryViewStyle，不同步，所有分组一起切。值和侧栏项目的显示方式（lib/pinned-style）同一套：list / icons，认不出来就当列表。
 */
import { useSettings } from './settings';
import { normalizePinnedStyle, type PinnedStyle } from './pinned-style';

export type CategoryViewStyle = PinnedStyle;

export function normalizeCategoryView(v: unknown): CategoryViewStyle {
  return normalizePinnedStyle(v);
}

export function useCategoryViewStyle(): [CategoryViewStyle, (v: CategoryViewStyle) => void] {
  const { settings, set } = useSettings();
  return [normalizeCategoryView(settings.categoryViewStyle), (v) => set('categoryViewStyle', v)];
}
