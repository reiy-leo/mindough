/**
 * 我的一天、积压页的分区 / 排序（Rei 2026-11-08）：存在本机设置 settings.listViews[页名]，不同步（和项目页的 projectViews 一样）。
 * - 我的一天：分区 不分区（默认）/ 按心情 / 按项目；排序 手动（默认，拖动排的）/ 心情。分区只管「未完成」那段，置顶的总在最上面、不进分区。
 * - 过期积压：只有按日期分段一种（Rei 2026-11-10「过期积压不显示分区按钮」），section 字段不再用，只用 collapsed（收起了哪几段）。
 * - 已完成：固定按日期分段、没有分区按钮（Rei 2026-11-12 10:19「默认按照日期分区，不能修改」），不经这里；旧设置里的 listViews.done 不读。
 */
import { useSettings } from './settings';
import { normalizeSectionBy, type SectionBy } from './sections';

export type ListPage = 'myday' | 'doable';

export const MYDAY_SECTIONS: readonly SectionBy[] = ['none', 'mood', 'project', 'type'];

export interface ListViewPrefs {
  /** 积压固定是 date（按日期分段，没有菜单） */
  section: SectionBy | 'date';
  sort: 'manual' | 'mood';
  collapsed: string[];
}

export function normalizeListView(page: ListPage, v: unknown): ListViewPrefs {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const section = page === 'myday' ? normalizeSectionBy(o.section, MYDAY_SECTIONS) : 'date';
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
