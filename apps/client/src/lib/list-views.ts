/**
 * 我的一天、积压、已完成页的分区 / 排序（Rei 2026-11-08）：存在本机设置 settings.listViews[页名]，不同步（和项目页的 projectViews 一样）。
 * - 我的一天：分区 不分区（默认）/ 按心情 / 按项目；排序 手动（默认，拖动排的）/ 心情。分区只管「未完成」那段，置顶的总在最上面、不进分区。
 * - 已完成：按天分段（date，默认）或「不分区」（Rei「所有列表支持不分区」）。
 * - 过期积压：只有按日期分段一种（Rei 2026-11-10「过期积压不显示分区按钮」），section 字段不再用，只用 collapsed（收起了哪几段）。
 */
import { useSettings } from './settings';
import { normalizeSectionBy, type SectionBy } from './sections';

export type ListPage = 'myday' | 'doable' | 'done';

export const MYDAY_SECTIONS: readonly SectionBy[] = ['none', 'mood', 'project'];
/** 积压、已完成：按日期（原来的分段）或不分区。 */
export type DateSection = 'date' | 'none';
export const DATE_SECTIONS: readonly DateSection[] = ['date', 'none'];

export interface ListViewPrefs {
  section: SectionBy | DateSection;
  sort: 'manual' | 'mood';
  collapsed: string[];
}

export function normalizeListView(page: ListPage, v: unknown): ListViewPrefs {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const section = page === 'myday' ? normalizeSectionBy(o.section, MYDAY_SECTIONS) : o.section === 'none' ? 'none' : 'date';
  return {
    section,
    sort: o.sort === 'mood' ? 'mood' : 'manual',
    collapsed: Array.isArray(o.collapsed) ? o.collapsed.filter((x): x is string => typeof x === 'string') : [],
  };
}

export function useListView(page: ListPage): [ListViewPrefs, (patch: Partial<ListViewPrefs>) => void] {
  const { settings, set } = useSettings();
  const all = settings.listViews ?? {};
  const prefs = normalizeListView(page, all[page]);
  return [prefs, (patch) => set('listViews', { ...all, [page]: { ...prefs, ...patch } })];
}
