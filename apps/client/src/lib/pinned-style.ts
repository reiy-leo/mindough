/**
 * 侧栏里放进来的项目怎么显示（Rei 2026-11-11）：列表（默认，图标 + 名字一行一个）或图标（只放图标，按行排、放不下折行，不左右滚）。
 * 存本机设置 pinnedGroupStyle，不同步。资料库那一串先不跟（Rei 2026-11-11「先不做，只管项目」）。
 * 中等宽度的图标栏本来就只有图标、一行一个，不按这个排（pinnedGroupGrid）。
 */
import { useSettings, type Settings } from './settings';

export type PinnedStyle = 'list' | 'icons';
export const PINNED_STYLES: readonly PinnedStyle[] = ['list', 'icons'];

/** 存的值认不出来（老数据、手改）就当列表。 */
export function normalizePinnedStyle(v: unknown): PinnedStyle {
  return v === 'icons' ? 'icons' : 'list';
}

/** 这次要不要排成图标网格：选了图标，且不是中等宽度的图标栏。 */
export function pinnedGroupGrid(settings: Pick<Settings, 'pinnedGroupStyle'>, narrow: boolean): boolean {
  return !narrow && normalizePinnedStyle(settings.pinnedGroupStyle) === 'icons';
}

export function usePinnedGroupStyle(): [PinnedStyle, (v: PinnedStyle) => void] {
  const { settings, set } = useSettings();
  return [normalizePinnedStyle(settings.pinnedGroupStyle), (v) => set('pinnedGroupStyle', v)];
}
