/**
 * 日历页的视图跟着账户同步（Rei 2026-11-13 06:00「日历页的显示方式也要同步」，docs/CALENDAR.md）。
 * 存三个同步的偏好（各设备一样，做法同 tasks.new_task_focus）：
 * - calendar.view：周 / 月 / 年 / 多日 / 多周（core CalViewKind）；
 * - calendar.view_days：多日的天数（2–14）；
 * - calendar.view_weeks：多周的周数（1–6）。
 * 分三个键：一台设备改视图、另一台改天数，同步后两处改动都留着（偏好按键 LWW）。
 * 当前看的是哪一段（翻到哪个月）不同步，每台设备自己记在页面里。
 *
 * 读：账户里有就用账户的，没有的那项用本机老设置 settings.calendarView（之前只记在本机），都没有按默认周。
 * 写：改了就写进偏好；没登录、离线也照样写进本机数据库，马上生效，登录 / 联网后再推上去。
 * 迁移：本机老设置是第一次的初始值，只在账户里三项都还没有时写上去。
 * 要等登录后第一次同步拉完再判断（installCalViewMigration），免得本机刚写的新时间戳盖掉账户里已有的值；
 * 没登录时不写，读的时候直接退回本机老设置，效果一样。
 */
import { normalizeCalView, type CalView, type FieldValue, type Store } from '@mindough/core';
import { readLocalSettings } from './settings';
import { getSyncView, subscribeSyncView, type SyncView } from './sync';

export const CAL_VIEW_PREF = 'calendar.view';
export const CAL_VIEW_DAYS_PREF = 'calendar.view_days';
export const CAL_VIEW_WEEKS_PREF = 'calendar.view_weeks';
export const CAL_VIEW_PREFS = [CAL_VIEW_PREF, CAL_VIEW_DAYS_PREF, CAL_VIEW_WEEKS_PREF] as const;

type PrefReader = (key: string) => FieldValue | undefined;

/** 账户里的值优先，缺的那项用本机老设置，坏值按 core normalizeCalView 回默认。 */
export function syncedCalView(pref: PrefReader, local: unknown): CalView {
  const old = (local && typeof local === 'object' ? local : {}) as Partial<Record<keyof CalView, unknown>>;
  const pick = (key: string, fallback: unknown) => {
    const v = pref(key);
    return v === undefined || v === null ? fallback : v;
  };
  return normalizeCalView({
    kind: pick(CAL_VIEW_PREF, old.kind),
    days: pick(CAL_VIEW_DAYS_PREF, old.days),
    weeks: pick(CAL_VIEW_WEEKS_PREF, old.weeks),
  });
}

/** 改视图：三项都写（值没变的 setPref 不写）。 */
export function setSyncedCalView(store: Pick<Store, 'setPref'>, view: CalView): void {
  const v = normalizeCalView(view);
  store.setPref(CAL_VIEW_PREF, v.kind);
  store.setPref(CAL_VIEW_DAYS_PREF, v.days);
  store.setPref(CAL_VIEW_WEEKS_PREF, v.weeks);
}

/** 账户里三项都还没有、本机有老设置：把老设置写上去。写了返回 true。 */
export function migrateCalView(store: Pick<Store, 'pref' | 'setPref'>, local: unknown): boolean {
  if (local === null || local === undefined) return false;
  if (CAL_VIEW_PREFS.some((k) => store.pref(k) !== undefined)) return false;
  setSyncedCalView(store, normalizeCalView(local));
  return true;
}

/** 登录、第一次同步拉完以后才迁移（这时账户里有没有这项才算数）。 */
export function readyToMigrate(v: SyncView): boolean {
  return v.enabled && !!v.lastSyncedAt;
}

/**
 * 主窗口打开 Store 后调用（StoreProvider）：等同步第一次成功，做一次迁移就不再管。
 * 没登录就一直不迁移，日历读的时候退回本机老设置。
 */
export function installCalViewMigration(store: Store, view: () => SyncView = getSyncView, subscribe: (fn: () => void) => () => void = subscribeSyncView, local: () => unknown = () => readLocalSettings().calendarView): () => void {
  let done = false;
  let unsub: (() => void) | null = null;
  const check = () => {
    if (done || !readyToMigrate(view())) return;
    done = true;
    migrateCalView(store, local());
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
