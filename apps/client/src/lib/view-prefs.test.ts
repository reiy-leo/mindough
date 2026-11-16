/**
 * 列表页视图设置跟着账户同步（Rei 2026-11-16 17:01「项目的视图、分区、排序这些设置也要同步，我的一天、待安排的设置也要同步」）：
 * 同步项走偏好 list_view.<页>.* / project_view.<id>.*，账户里没有的退回本机老设置；收起状态只在本机；
 * 老设置只在登录同步完、账户里这一页 / 这个项目一项都没有时写上去一次。
 */
import { describe, expect, it } from 'vitest';
import type { FieldValue, Store } from '@mindough/core';
import { installViewPrefsMigration, listViewPrefKey, localListPatch, localProjectPatch, migrateViewPrefs, projectViewPrefKey, syncedListView, syncedProjectView, writeListView, writeProjectView } from './view-prefs';
import { normalizeListView } from './list-views';
import { normalizePrefs } from './project-view';
import type { SyncView } from './sync';

function prefs(init: Record<string, FieldValue> = {}, groups: string[] = ['g1', 'g2']) {
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
    get: ((table: string, id: string) => (table === 'group' && groups.includes(id) ? { id } : undefined)) as unknown as Store['get'],
  };
}

describe('syncedListView', () => {
  it('都没有：不分区、手动', () => {
    expect(syncedListView(() => undefined, 'backlog', undefined)).toEqual({ section: 'none', sort: 'manual', collapsed: [] });
  });
  it('账户里没有：用本机老设置', () => {
    expect(syncedListView(() => undefined, 'myday', { section: 'mood', sort: 'mood', collapsed: ['mood:happy'] })).toEqual({ section: 'mood', sort: 'mood', collapsed: ['mood:happy'] });
  });
  it('账户里有：账户优先，缺的那项用本机；收起状态只看本机', () => {
    const p = prefs({ [listViewPrefKey('myday', 'section')]: 'type' });
    expect(syncedListView(p.pref, 'myday', { section: 'mood', sort: 'mood', collapsed: ['x'] })).toEqual({ section: 'type', sort: 'mood', collapsed: ['x'] });
  });
  it('等待安排：按项目 / 按心情 / 按类型能选，按目标日期不行；没有排序', () => {
    for (const s of ['project', 'mood', 'type'] as const) expect(syncedListView(prefs({ [listViewPrefKey('backlog', 'section')]: s }).pref, 'backlog', undefined).section).toBe(s);
    expect(syncedListView(prefs({ [listViewPrefKey('backlog', 'section')]: 'due' }).pref, 'backlog', undefined).section).toBe('none');
    expect(normalizeListView('backlog', { sort: 'mood' }).sort).toBe('manual');
  });
  it('过期积压：只有收起状态，账户里的不看', () => {
    const p = prefs({ [listViewPrefKey('doable', 'section')]: 'mood' });
    expect(syncedListView(p.pref, 'doable', { collapsed: ['overdue:week'] })).toEqual({ section: 'date', sort: 'manual', collapsed: ['overdue:week'] });
  });
  it('坏值回默认', () => {
    const p = prefs({ [listViewPrefKey('myday', 'section')]: 42, [listViewPrefKey('myday', 'sort')]: 'abc' });
    expect(syncedListView(p.pref, 'myday', undefined)).toMatchObject({ section: 'none', sort: 'manual' });
  });
});

describe('writeListView', () => {
  it('改分区：这一页的同步项都写，没变的不写', () => {
    const p = prefs();
    const next = normalizeListView('myday', { section: 'project', sort: 'manual' });
    expect(writeListView(p, 'myday', next, { section: 'project' })).toBe(true);
    expect(p.writes).toEqual([`list_view.myday.section="project"`, `list_view.myday.sort="manual"`]);
    writeListView(p, 'myday', { ...next, sort: 'mood' }, { sort: 'mood' });
    expect(p.writes.slice(2)).toEqual([`list_view.myday.sort="mood"`]);
  });
  it('只改收起状态：不写偏好，本机那份只留收起', () => {
    const p = prefs();
    expect(writeListView(p, 'backlog', normalizeListView('backlog', {}), { collapsed: ['project:none'] })).toBe(false);
    expect(p.writes).toEqual([]);
    expect(localListPatch({ collapsed: ['project:none'] })).toEqual({ collapsed: ['project:none'] });
    expect(localListPatch({ section: 'mood' })).toEqual({});
  });
  it('等待安排只写分区', () => {
    const p = prefs();
    writeListView(p, 'backlog', normalizeListView('backlog', { section: 'type' }), { section: 'type' });
    expect(p.writes).toEqual([`list_view.backlog.section="type"`]);
  });
});

describe('项目视图', () => {
  it('账户优先、缺的用本机；已结束展开、收起状态只看本机', () => {
    const p = prefs({ [projectViewPrefKey('g1', 'view')]: 'board', [projectViewPrefKey('g1', 'sort')]: 'due', [projectViewPrefKey('g1', 'dir')]: 'asc' });
    expect(syncedProjectView(p.pref, 'g1', { view: 'timeline', scale: 'month', section: 'mood', collapsed: ['mood:sad'], endedOpen: true })).toEqual({
      view: 'board',
      sort: 'due',
      dir: 'asc',
      scale: 'month',
      section: 'mood',
      collapsed: ['mood:sad'],
      endedOpen: true,
    });
    // 别的项目不受影响
    expect(syncedProjectView(p.pref, 'g2', undefined).view).toBe('list');
  });
  it('改视图：五项都写，改收起 / 已结束不写偏好', () => {
    const p = prefs();
    const cur = normalizePrefs(undefined);
    expect(writeProjectView(p, 'g1', { ...cur, view: 'chain' }, { view: 'chain' })).toBe(true);
    expect(p.writes).toEqual(['project_view.g1.view="chain"', 'project_view.g1.sort="created"', 'project_view.g1.dir="desc"', 'project_view.g1.scale="week"', 'project_view.g1.section="none"']);
    expect(writeProjectView(p, 'g1', { ...cur, endedOpen: true }, { endedOpen: true })).toBe(false);
    expect(localProjectPatch({ endedOpen: true, view: 'board' })).toEqual({ endedOpen: true });
    expect(localProjectPatch({ collapsed: ['due:today'] })).toEqual({ collapsed: ['due:today'] });
  });
});

describe('migrateViewPrefs', () => {
  const local = {
    listViews: { myday: { section: 'mood', sort: 'mood', collapsed: ['mood:happy'] }, doable: { collapsed: ['overdue:week'] }, countdown: { section: 'type' } },
    projectViews: { g1: { view: 'board', sort: 'due', dir: 'asc' }, g2: { endedOpen: true }, gone: { view: 'timeline' } },
  };
  it('账户里没有：把本机的分区 / 排序 / 视图写上去；只有收起状态的、删了的项目、倒数日不迁', () => {
    const p = prefs();
    expect(migrateViewPrefs(p, local)).toEqual(['list:myday', 'project:g1']);
    expect(syncedListView(p.pref, 'myday', undefined)).toMatchObject({ section: 'mood', sort: 'mood' });
    expect(syncedProjectView(p.pref, 'g1', undefined)).toMatchObject({ view: 'board', sort: 'due', dir: 'asc', scale: 'week', section: 'none' });
    expect([...p.m.keys()].some((k) => k.includes('gone') || k.includes('g2') || k.includes('doable') || k.includes('countdown'))).toBe(false);
  });
  it('账户里已经有（哪怕一项）：那一页 / 那个项目不动，用账户的', () => {
    const p = prefs({ [listViewPrefKey('myday', 'sort')]: 'manual', [projectViewPrefKey('g1', 'section')]: 'type' });
    expect(migrateViewPrefs(p, local)).toEqual([]);
    expect(p.writes).toEqual([]);
    expect(syncedListView(p.pref, 'myday', undefined)).toMatchObject({ section: 'none', sort: 'manual' });
  });
  it('第二次跑不再写（账户里已经有了）', () => {
    const p = prefs();
    migrateViewPrefs(p, local);
    const n = p.writes.length;
    expect(migrateViewPrefs(p, local)).toEqual([]);
    expect(p.writes.length).toBe(n);
  });
});

describe('installViewPrefsMigration', () => {
  const local = () => ({ listViews: { myday: { section: 'project' } }, projectViews: {} });
  it('没登录不迁；第一次同步拉完才迁，只迁一次', () => {
    const p = prefs();
    let v: SyncView = { enabled: false };
    const subs = new Set<() => void>();
    const stop = installViewPrefsMigration(p as unknown as Store, () => v, (f) => (subs.add(f), () => subs.delete(f)), local);
    expect(p.writes).toEqual([]);
    v = { enabled: true, state: 'syncing', lastSyncedAt: null } as unknown as SyncView;
    subs.forEach((f) => f());
    expect(p.writes).toEqual([]);
    v = { enabled: true, state: 'idle', lastSyncedAt: '2026-11-16T09:00:00Z' } as unknown as SyncView;
    subs.forEach((f) => f());
    expect(p.writes).toEqual(['list_view.myday.section="project"', 'list_view.myday.sort="manual"']);
    expect(subs.size).toBe(0);
    stop();
  });
});
