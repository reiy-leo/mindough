/**
 * 日历视图跟着账户同步（Rei 2026-11-13 06:00「日历页的显示方式也要同步」）：
 * 三个偏好 calendar.view / view_days / view_weeks；账户里没有的用本机老设置；老设置只在登录同步完、账户里没有时写上去一次。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CAL_VIEW, type FieldValue, type Store } from '@mindough/core';
import { CAL_VIEW_DAYS_PREF, CAL_VIEW_PREF, CAL_VIEW_WEEKS_PREF, installCalViewMigration, migrateCalView, readyToMigrate, setSyncedCalView, syncedCalView } from './calendar-view';
import type { SyncView } from './sync';

function prefs(init: Record<string, FieldValue> = {}) {
  const m = new Map<string, FieldValue>(Object.entries(init));
  const writes: string[] = [];
  return {
    m,
    writes,
    pref: (k: string) => m.get(k),
    setPref: (k: string, v: FieldValue) => {
      if (JSON.stringify(m.get(k)) === JSON.stringify(v)) return;
      writes.push(`${k}=${JSON.stringify(v)}`);
      m.set(k, v);
    },
  };
}

describe('syncedCalView', () => {
  it('都没有：默认周', () => {
    expect(syncedCalView(() => undefined, null)).toEqual(DEFAULT_CAL_VIEW);
  });
  it('账户里没有：用本机老设置', () => {
    expect(syncedCalView(() => undefined, { kind: 'days', days: 5, weeks: 3 })).toEqual({ kind: 'days', days: 5, weeks: 3 });
  });
  it('账户里有：账户优先，缺的那项用本机', () => {
    const p = prefs({ [CAL_VIEW_PREF]: 'month', [CAL_VIEW_DAYS_PREF]: 7 });
    expect(syncedCalView(p.pref, { kind: 'days', days: 5, weeks: 3 })).toEqual({ kind: 'month', days: 7, weeks: 3 });
  });
  it('坏值回默认、越界夹住', () => {
    const p = prefs({ [CAL_VIEW_PREF]: 'hour', [CAL_VIEW_DAYS_PREF]: 99, [CAL_VIEW_WEEKS_PREF]: 0 });
    expect(syncedCalView(p.pref, null)).toEqual({ kind: 'week', days: 14, weeks: 1 });
  });
});

describe('setSyncedCalView', () => {
  it('三项都写，没变的不写', () => {
    const p = prefs();
    setSyncedCalView(p, { kind: 'weeks', days: 3, weeks: 4 });
    expect(p.writes).toEqual([`${CAL_VIEW_PREF}="weeks"`, `${CAL_VIEW_DAYS_PREF}=3`, `${CAL_VIEW_WEEKS_PREF}=4`]);
    setSyncedCalView(p, { kind: 'weeks', days: 3, weeks: 5 });
    expect(p.writes.slice(3)).toEqual([`${CAL_VIEW_WEEKS_PREF}=5`]);
  });
});

describe('migrateCalView', () => {
  it('账户里没有、本机有：写上去', () => {
    const p = prefs();
    expect(migrateCalView(p, { kind: 'year', days: 4, weeks: 2 })).toBe(true);
    expect(syncedCalView(p.pref, null)).toEqual({ kind: 'year', days: 4, weeks: 2 });
  });
  it('账户里已经有（哪怕一项）：不动', () => {
    const p = prefs({ [CAL_VIEW_DAYS_PREF]: 9 });
    expect(migrateCalView(p, { kind: 'year', days: 4, weeks: 2 })).toBe(false);
    expect(p.writes).toEqual([]);
  });
  it('本机没存过：不写，账户保持没有（读出来是默认周）', () => {
    const p = prefs();
    expect(migrateCalView(p, null)).toBe(false);
    expect(p.writes).toEqual([]);
  });
});

describe('installCalViewMigration', () => {
  const off: SyncView = { enabled: false };
  const syncing: SyncView = { enabled: true, phase: 'syncing', lastSyncedAt: null, error: null, needsLogin: false };
  const synced: SyncView = { enabled: true, phase: 'idle', lastSyncedAt: '2026-11-13T00:00:00Z', error: null, needsLogin: false } as SyncView;

  it('没登录、还没拉完都不迁移；第一次同步完迁移一次，之后不再管', () => {
    const p = prefs();
    let v: SyncView = off;
    const subs = new Set<() => void>();
    const emit = () => [...subs].forEach((f) => f());
    const stop = installCalViewMigration(p as unknown as Store, () => v, (f) => (subs.add(f), () => subs.delete(f)), () => ({ kind: 'month', days: 3, weeks: 2 }));
    expect(p.writes).toEqual([]);
    v = syncing;
    emit();
    expect(p.writes).toEqual([]);
    expect(readyToMigrate(v)).toBe(false);
    // 第一次拉完：账户里有了别的设备的值，就不写
    p.m.set(CAL_VIEW_PREF, 'days');
    v = synced;
    emit();
    expect(p.writes).toEqual([]);
    expect(subs.size).toBe(0);
    stop();
  });

  it('同步完账户里没有：写本机老值', () => {
    const p = prefs();
    installCalViewMigration(p as unknown as Store, () => synced, () => () => {}, () => ({ kind: 'month', days: 3, weeks: 2 }));
    expect(syncedCalView(p.pref, null)).toEqual({ kind: 'month', days: 3, weeks: 2 });
  });
});
