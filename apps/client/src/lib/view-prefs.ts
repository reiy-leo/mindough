/**
 * 列表页的视图 / 分区 / 排序跟着账户同步（Rei 2026-11-16 17:01「项目的视图、分区、排序这些设置也要同步，我的一天、待安排的设置也要同步」）。
 * 做法照日历视图（lib/calendar-view，docs/CALENDAR.md）：存同步的偏好（pref 表，一个 key 一行，各设备按 key LWW），每项一个 key，
 * 一台设备改分区、另一台改排序，同步后两处都留着。
 *
 * 同步的（pref key）：
 * - 我的一天：`list_view.myday.section`、`list_view.myday.sort`；
 * - 等待安排：`list_view.backlog.section`；
 * - 每个项目：`project_view.<项目 id>.view` / `.sort` / `.dir` / `.scale` / `.section`（视图、排序、正倒序、时间轴缩放、分区）。
 * 只在本机的（本机设置 mindough:settings，不同步）：分区收起了哪几段（collapsed）、项目「已结束」那段展开没有（endedOpen），
 * 这两个是看的时候随手点的展开状态，各设备各记；过期积压只有收起状态，也只在本机。
 *
 * 读：账户里有就用账户的，缺的那项退回本机老设置（以前全存在本机 listViews / projectViews），都没有按默认。
 * 写：同步的那几项写进偏好（没登录、离线也照样写进本机数据库，马上生效，登录 / 联网后再推上去），本机老设置里的这几项不再写。
 * 迁移：登录后第一次同步拉完（installViewPrefsMigration），某一页 / 某个项目在账户里一项都还没有、本机老设置里有，就把本机的值写上去一次；
 * 账户里已经有了（别的设备先迁过、或改过）就用账户的。等拉完再写，免得本机刚写的新时间戳盖掉账户里已有的值。
 * 只认还在的项目（删了的项目不迁）。没登录时不写，读的时候直接退回本机老值，看着一样。
 */
import type { FieldValue, Store } from '@mindough/core';
import { readyToMigrate } from './calendar-view';
import { readLocalSettings } from './settings';
import { getSyncView, subscribeSyncView, type SyncView } from './sync';
import { normalizeListView, type ListPage, type ListViewPrefs } from './list-views';
import { normalizePrefs, type ProjectViewPrefs } from './project-view';

type PrefReader = (key: string) => FieldValue | undefined;
type PrefStore = Pick<Store, 'pref' | 'setPref'>;

/** 每页同步哪几项；过期积压只有收起状态，没有要同步的。 */
export const LIST_SYNCED: Record<ListPage, readonly ('section' | 'sort')[]> = {
  myday: ['section', 'sort'],
  backlog: ['section'],
  doable: [],
};
export const PROJECT_SYNCED = ['view', 'sort', 'dir', 'scale', 'section'] as const satisfies readonly (keyof ProjectViewPrefs)[];

export const listViewPrefKey = (page: ListPage, field: string) => `list_view.${page}.${field}`;
export const projectViewPrefKey = (groupId: string, field: string) => `project_view.${groupId}.${field}`;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const given = (v: FieldValue | undefined): v is FieldValue => v !== undefined && v !== null;

/** 我的一天 / 等待安排 / 过期积压：账户里的值优先，缺的退回本机老设置，收起状态只看本机。 */
export function syncedListView(pref: PrefReader, page: ListPage, local: unknown): ListViewPrefs {
  const merged: Record<string, unknown> = { ...obj(local) };
  for (const f of LIST_SYNCED[page]) {
    const v = pref(listViewPrefKey(page, f));
    if (given(v)) merged[f] = v;
  }
  return normalizeListView(page, merged);
}

/** 一个项目：同上。 */
export function syncedProjectView(pref: PrefReader, groupId: string, local: unknown): ProjectViewPrefs {
  const merged: Record<string, unknown> = { ...obj(local) };
  for (const f of PROJECT_SYNCED) {
    const v = pref(projectViewPrefKey(groupId, f));
    if (given(v)) merged[f] = v;
  }
  return normalizePrefs(merged);
}

/** 改了同步的那几项：这一页的同步项全写（值没变的 setPref 不写）。改的只有本机项时什么也不写，返回 false。 */
export function writeListView(store: PrefStore, page: ListPage, next: ListViewPrefs, patch: Partial<ListViewPrefs>): boolean {
  const fields = LIST_SYNCED[page];
  if (!fields.some((f) => f in patch)) return false;
  for (const f of fields) store.setPref(listViewPrefKey(page, f), next[f]);
  return true;
}

export function writeProjectView(store: PrefStore, groupId: string, next: ProjectViewPrefs, patch: Partial<ProjectViewPrefs>): boolean {
  if (!PROJECT_SYNCED.some((f) => f in patch)) return false;
  for (const f of PROJECT_SYNCED) store.setPref(projectViewPrefKey(groupId, f), next[f]);
  return true;
}

/** 本机老设置里只留本机项（收起状态），同步项不再写进去（老值留着当没登录时的退路，不删）。 */
export function localListPatch(patch: Partial<ListViewPrefs>): Partial<ListViewPrefs> {
  return 'collapsed' in patch ? { collapsed: patch.collapsed ?? [] } : {};
}
export function localProjectPatch(patch: Partial<ProjectViewPrefs>): Partial<ProjectViewPrefs> {
  const out: Partial<ProjectViewPrefs> = {};
  if ('collapsed' in patch) out.collapsed = patch.collapsed ?? [];
  if ('endedOpen' in patch) out.endedOpen = !!patch.endedOpen;
  return out;
}

/**
 * 迁移一次：本机老设置 → 账户。某页 / 某项目在账户里一项都没有、本机老设置里存过同步项，才写上去（写规范化后的值）。
 * 返回写上去的范围（`list:myday`、`project:<id>`），测试用。
 */
export function migrateViewPrefs(store: PrefStore & Pick<Store, 'get'>, local: { listViews?: unknown; projectViews?: unknown }): string[] {
  const done: string[] = [];
  const lists = obj(local.listViews);
  for (const page of Object.keys(LIST_SYNCED) as ListPage[]) {
    const fields = LIST_SYNCED[page];
    const old = obj(lists[page]);
    if (!fields.length || !fields.some((f) => old[f] !== undefined)) continue;
    if (fields.some((f) => store.pref(listViewPrefKey(page, f)) !== undefined)) continue;
    const v = normalizeListView(page, old);
    for (const f of fields) store.setPref(listViewPrefKey(page, f), v[f]);
    done.push(`list:${page}`);
  }
  for (const [gid, raw] of Object.entries(obj(local.projectViews))) {
    const old = obj(raw);
    if (!PROJECT_SYNCED.some((f) => old[f] !== undefined)) continue;
    if (!store.get('group', gid)) continue;
    if (PROJECT_SYNCED.some((f) => store.pref(projectViewPrefKey(gid, f)) !== undefined)) continue;
    const v = normalizePrefs(old);
    for (const f of PROJECT_SYNCED) store.setPref(projectViewPrefKey(gid, f), v[f]);
    done.push(`project:${gid}`);
  }
  return done;
}

/**
 * 主窗口打开 Store 后调用（StoreProvider）：等同步第一次成功，迁移一次就不再管（同 installCalViewMigration）。
 * 没登录就一直不迁移，读的时候退回本机老设置。
 */
export function installViewPrefsMigration(
  store: Store,
  view: () => SyncView = getSyncView,
  subscribe: (fn: () => void) => () => void = subscribeSyncView,
  local: () => { listViews?: unknown; projectViews?: unknown } = readLocalSettings,
): () => void {
  let done = false;
  let unsub: (() => void) | null = null;
  const check = () => {
    if (done || !readyToMigrate(view())) return;
    done = true;
    migrateViewPrefs(store, local());
    unsub?.();
    unsub = null;
  };
  unsub = subscribe(check);
  check();
  return () => {
    unsub?.();
    unsub = null;
  };
}
