/**
 * 我的一天、等待安排、过期积压的分区 / 排序（Rei 2026-11-08；等待安排 2026-11-16 加分区）。纯逻辑，读写的 hook 在 lib/view-hooks。
 * - 我的一天：分区 不分区（默认）/ 按心情 / 按项目 / 按类型；排序 手动（默认，拖动排的）/ 心情。分区只管「未完成」那段，置顶的总在最上面、不进分区。
 * - 等待安排（Rei 2026-11-16）：分区 不分区（默认）/ 按项目 / 按心情 / 按类型，菜单顺序照 Rei 说的；没有排序按钮（手动拖的顺序）。
 * - 过期积压：只有按日期分段一种（Rei 2026-11-10「过期积压不显示分区按钮」），section 字段不再用，只用 collapsed（收起了哪几段）。
 * - 已完成：固定按日期分段、没有分区按钮（Rei 2026-11-12 10:19「默认按照日期分区，不能修改」），不经这里；旧设置里的 listViews.done 不读。
 * 存法（Rei 2026-11-16 17:01 起）：分区、排序跟着账户同步（同步偏好 list_view.<页>.<项>，lib/view-prefs）；收起了哪几段只在本机（settings.listViews[页].collapsed）。
 */
import { normalizeSectionBy, type SectionBy } from './sections';

export type ListPage = 'myday' | 'backlog' | 'doable';

export const MYDAY_SECTIONS: readonly SectionBy[] = ['none', 'mood', 'project', 'type'];
export const BACKLOG_SECTIONS: readonly SectionBy[] = ['none', 'project', 'mood', 'type'];

export interface ListViewPrefs {
  /** 过期积压固定是 date（按日期分段，没有菜单） */
  section: SectionBy | 'date';
  sort: 'manual' | 'mood';
  collapsed: string[];
}

export function normalizeListView(page: ListPage, v: unknown): ListViewPrefs {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const section = page === 'myday' ? normalizeSectionBy(o.section, MYDAY_SECTIONS) : page === 'backlog' ? normalizeSectionBy(o.section, BACKLOG_SECTIONS) : 'date';
  return {
    section,
    // 等待安排没有排序按钮，永远是手动
    sort: page === 'myday' && o.sort === 'mood' ? 'mood' : 'manual',
    collapsed: Array.isArray(o.collapsed) ? o.collapsed.filter((x): x is string => typeof x === 'string') : [],
  };
}
