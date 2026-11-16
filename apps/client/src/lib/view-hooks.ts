/**
 * 列表页视图设置的读写 hook（规则见 lib/view-prefs）：分区 / 排序 / 视图走同步偏好，收起状态走本机设置。
 */
import type { Store } from '@mindough/core';
import { useStore } from '../store/StoreProvider';
import { useSettings, type Settings } from './settings';
import { normalizeListView, type ListPage, type ListViewPrefs } from './list-views';
import type { ProjectViewPrefs } from './project-view';
import { localListPatch, localProjectPatch, syncedListView, syncedProjectView, writeListView, writeProjectView } from './view-prefs';

export function useListView(page: ListPage): [ListViewPrefs, (patch: Partial<ListViewPrefs>) => void] {
  const store = useStore();
  const { settings, set } = useSettings();
  const all = settings.listViews ?? {};
  const prefs = syncedListView((k) => store.pref(k), page, all[page]);
  return [
    prefs,
    (patch) => {
      const next = normalizeListView(page, { ...prefs, ...patch });
      writeListView(store, page, next, patch);
      const local = localListPatch(patch);
      if (Object.keys(local).length) set('listViews', { ...all, [page]: { ...(all[page] && typeof all[page] === 'object' ? all[page] : {}), ...local } });
    },
  ];
}

/** 某个项目的视图设置（App 判断看板浮层也用它，不经 hook）。 */
export function projectPrefsOf(store: Pick<Store, 'pref'>, projectViews: Settings['projectViews'], id: string): ProjectViewPrefs {
  return syncedProjectView((k) => store.pref(k), id, projectViews?.[id]);
}

export function useProjectPrefs(id: string): [ProjectViewPrefs, (patch: Partial<ProjectViewPrefs>) => void] {
  const store = useStore();
  const { settings, set } = useSettings();
  const all = settings.projectViews ?? {};
  const prefs = projectPrefsOf(store, all, id);
  return [
    prefs,
    (patch) => {
      writeProjectView(store, id, { ...prefs, ...patch }, patch);
      const local = localProjectPatch(patch);
      if (Object.keys(local).length) set('projectViews', { ...all, [id]: { ...(all[id] && typeof all[id] === 'object' ? (all[id] as object) : {}), ...local } });
    },
  ];
}
