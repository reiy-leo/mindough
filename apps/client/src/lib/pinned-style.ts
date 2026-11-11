/**
 * 侧栏里放进来的项目 / 资料库怎么显示：列表（默认，图标 + 名字一行一个）或图标（只放图标，按行排、放不下折行，不左右滚）。
 * 项目那串（Rei 2026-11-11）存本机设置 pinnedGroupStyle；资料库那串（Rei 2026-11-12 00:24）存 pinnedLibraryStyle，两个各管各的，都不同步。
 * 中等宽度的图标栏本来就只有图标、一行一个，不按这个排（pinnedGrid）。
 */
import { useSettings, type Settings } from './settings';

export type PinnedStyle = 'list' | 'icons';
export const PINNED_STYLES: readonly PinnedStyle[] = ['list', 'icons'];
/** 哪一串：放进侧栏的项目（「计划」里）还是资料库（「管理」里）。 */
export type PinnedStyleKind = 'group' | 'library';

const KEY = { group: 'pinnedGroupStyle', library: 'pinnedLibraryStyle' } as const;

/** 存的值认不出来（老数据、手改）就当列表。 */
export function normalizePinnedStyle(v: unknown): PinnedStyle {
  return v === 'icons' ? 'icons' : 'list';
}

/** 这次要不要排成图标网格：这一串选了图标，且不是中等宽度的图标栏。 */
export function pinnedGrid(settings: Partial<Pick<Settings, 'pinnedGroupStyle' | 'pinnedLibraryStyle'>>, kind: PinnedStyleKind, narrow: boolean): boolean {
  return !narrow && normalizePinnedStyle(settings[KEY[kind]]) === 'icons';
}

export function pinnedGroupGrid(settings: Pick<Settings, 'pinnedGroupStyle'>, narrow: boolean): boolean {
  return pinnedGrid(settings, 'group', narrow);
}

export function usePinnedStyle(kind: PinnedStyleKind): [PinnedStyle, (v: PinnedStyle) => void] {
  const { settings, set } = useSettings();
  return [normalizePinnedStyle(settings[KEY[kind]]), (v) => set(KEY[kind], v)];
}

export function usePinnedGroupStyle(): [PinnedStyle, (v: PinnedStyle) => void] {
  return usePinnedStyle('group');
}
