/**
 * 项目里的任务自动进我的一天（Rei 2026-11-02「直接出现在我的一天，而不是出现在的建议里」「项目编辑窗口中可以设置switch on/off」）。
 */
// 日期是今天的任务都按「早就定好、今天到了」建（joinMyDay: false），不走「日期设成今天就放进我的一天」（myday-date-join.test.ts）
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { SyncEngine } from '../src/sync/engine';
import { MemoryRemote } from '../src/sync/memory-remote';
import { AUTO_MY_DAY_HLC, entriesFor, isAutoEntry, isStaleAutoEntry, myDayEntryId, recentlyUnlocked, suggestions } from '../src/myday';
import { toDateKey } from '../src/dates';
import { local } from './helpers';

async function open(deviceId = 'dev1', t0 = local(2026, 11, 2, 9).getTime()) {
  let t = t0;
  const store = await Store.open(new MemoryAdapter(), { deviceId, now: () => new Date(t) });
  return { store, advance: (ms: number) => (t += ms), now: () => t };
}

async function devices() {
  const remote = new MemoryRemote();
  const dev = async (id: string) => {
    const d = await open(id);
    const engine = new SyncEngine(d.store, remote.transport(), { account: 'rei@example.com', now: () => new Date(d.now()), timers: { set: () => 0, clear: () => {} } });
    return { ...d, sync: () => engine.syncNow() };
  };
  return [await dev('devA'), await dev('devB')] as const;
}

const group = (store: Store, my_day_auto = true) =>
  store.insert('group', { name: '搬家', icon: '🏠', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto });

const today = (s: Store) => toDateKey(s.now());
const inDay = (s: Store) => entriesFor(s.list('my_day'), today(s)).map((e) => e.task_id);
const sugg = (s: Store) => {
  const tasks = s.list('task');
  const derived = s.derived();
  const unlocked = recentlyUnlocked(tasks, s.edges(), derived, new Date(s.now().getTime() - 24 * 3600_000).toISOString());
  return suggestions({ tasks, entries: s.list('my_day'), checkIns: s.list('check_in'), derived, recentlyUnlocked: unlocked, today: today(s), now: s.now(), groups: s.list('group') }).map((x) => x.task.id);
};

describe('项目里的任务直接进我的一天', () => {
  it('今天到期、日期段含今天、倒数日到了的项目任务自动加进来，不再进建议；过期、没到的不加（2026-11-08）；不在项目里的照旧只建议', async () => {
    const { store } = await open();
    const g = group(store);
    const d = today(store);
    const due = store.createTask({ body_md: '打包', group_id: g.id, scheduled_date: d }, { joinMyDay: false });
    const late = store.createTask({ body_md: '退押金', group_id: g.id, scheduled_date: '2026-10-30' });
    const range = store.createTask({ body_md: '搬箱子', group_id: g.id, scheduled_date: '2026-11-01', end_date: '2026-11-05' }, { joinMyDay: false });
    const cd = store.createTask({ body_md: '交房', group_id: g.id, completion_mode: 'countdown', target_date: d });
    const later = store.createTask({ body_md: '下周的事', group_id: g.id, scheduled_date: '2026-11-09' });
    const loose = store.createTask({ body_md: '不在项目里', scheduled_date: d }, { joinMyDay: false });
    expect(store.syncAutoMyDay()).toBe(3);
    expect(new Set(inDay(store))).toEqual(new Set([due.id, range.id, cd.id]));
    // 只有当前的才自动进（Rei 2026-11-08）：过期的、没到的都不加
    expect(inDay(store)).not.toContain(late.id);
    expect(inDay(store)).not.toContain(later.id);
    expect(inDay(store)).not.toContain(loose.id);
    expect(sugg(store)).toEqual([loose.id]);
    // 再调一次什么都不写
    const v = store.version;
    expect(store.syncAutoMyDay()).toBe(0);
    expect(store.version).toBe(v);
  });

  it('自动加的行：id 由任务 + 日期算、时间戳是最早的固定值', async () => {
    const { store } = await open();
    const g = group(store);
    const t = store.createTask({ body_md: '打包', group_id: g.id, scheduled_date: today(store) }, { joinMyDay: false });
    store.syncAutoMyDay();
    const row = store.raw('my_day', myDayEntryId(t.id, today(store)))!;
    expect(row.deleted).toBe(false);
    expect(row.updated_at).toBe(AUTO_MY_DAY_HLC);
    expect(myDayEntryId(t.id, '2026-11-02')).toBe(myDayEntryId(t.id, '2026-11-02'));
    expect(myDayEntryId(t.id, '2026-11-02')).not.toBe(myDayEntryId(t.id, '2026-11-03'));
  });

  it('移出后当天不再冒出来，第二天还该做就再加', async () => {
    const { store, advance } = await open();
    const g = group(store);
    const t = store.createTask({ body_md: '退押金', group_id: g.id, scheduled_date: '2026-11-01', end_date: '2026-11-05' });
    store.syncAutoMyDay();
    store.removeFromMyDay(t.id);
    expect(store.syncAutoMyDay()).toBe(0);
    expect(inDay(store)).toEqual([]);
    // 移出的不进建议（它在项目里，本来就不建议）
    expect(sugg(store)).toEqual([]);
    advance(24 * 3600_000);
    expect(store.syncAutoMyDay()).toBe(1);
    expect(inDay(store)).toEqual([t.id]);
  });

  it('手动加过、又移出的（老的随机 id 行）当天也不再加', async () => {
    const { store } = await open();
    const g = group(store);
    const t = store.createTask({ body_md: '打包', group_id: g.id, scheduled_date: today(store) }, { joinMyDay: false });
    store.insert('my_day', { task_id: t.id, date: today(store), sort: 1, added_at: store.now().toISOString() });
    store.removeFromMyDay(t.id);
    expect(store.syncAutoMyDay()).toBe(0);
    expect(store.raw('my_day', myDayEntryId(t.id, today(store)))?.deleted).toBe(true);
  });

  it('项目关了「出现在我的一天」：不自动加，回到建议里；完成了的不加', async () => {
    const { store } = await open();
    const off = group(store, false);
    const on = group(store);
    const a = store.createTask({ body_md: '关着的项目', group_id: off.id, scheduled_date: today(store) }, { joinMyDay: false });
    const b = store.createTask({ body_md: '做完了', group_id: on.id, scheduled_date: today(store) }, { joinMyDay: false });
    store.updateTask(b.id, { status: '完成' });
    expect(store.syncAutoMyDay()).toBe(0);
    expect(sugg(store)).toEqual([a.id]);
    store.updateGroup(off.id, { my_day_auto: true });
    expect(store.get('group', off.id)?.my_day_auto).toBe(true);
    expect(store.syncAutoMyDay()).toBe(1);
    expect(sugg(store)).toEqual([]);
  });

  it('老数据没有 my_day_auto 字段：当成开', async () => {
    const { store } = await open();
    const g = store.insert('group', { name: '旧', icon: '📁', start_at: null, end_at: null, category_id: null, default_type_id: null } as never);
    store.createTask({ body_md: 'x', group_id: g.id, scheduled_date: today(store) }, { joinMyDay: false });
    expect(store.syncAutoMyDay()).toBe(1);
    // 老客户端推来的行：applyRemote 补成 true
    const old = { ...store.get('group', g.id)!, updated_at: '9999999999999-0000-old' } as Record<string, unknown>;
    delete old.my_day_auto;
    store.applyRemote([{ table: 'group', row: old } as never]);
    expect(store.get('group', g.id)?.my_day_auto).toBe(true);
  });

  it('刚解锁的项目任务也直接加', async () => {
    const { store } = await open();
    const g = group(store);
    const a = store.createTask({ body_md: '先', group_id: g.id });
    const b = store.createTask({ body_md: '后', group_id: g.id });
    store.addDependency(a.id, b.id);
    expect(store.syncAutoMyDay()).toBe(0);
    store.updateTask(a.id, { status: '完成', done_at: store.now().toISOString() });
    expect(store.syncAutoMyDay()).toBe(1);
    expect(inDay(store)).toEqual([b.id]);
  });
});

describe('多端：同一件不重复，移出不复活', () => {
  it('两台设备各自自动加，同步后只有一行', async () => {
    const [A, B] = await devices();
    const g = group(A.store);
    const t = A.store.createTask({ body_md: '打包', group_id: g.id, scheduled_date: today(A.store) }, { joinMyDay: false });
    await A.sync();
    await B.sync();
    A.store.syncAutoMyDay();
    B.store.syncAutoMyDay();
    await A.sync();
    await B.sync();
    await A.sync();
    for (const s of [A.store, B.store]) {
      expect(s.list('my_day').filter((e) => e.task_id === t.id)).toHaveLength(1);
      expect(inDay(s)).toEqual([t.id]);
    }
  });

  it('A 上移出，B 离线时又自动加了一遍：同步后两边都没有', async () => {
    const [A, B] = await devices();
    const g = group(A.store);
    const t = A.store.createTask({ body_md: '打包', group_id: g.id, scheduled_date: today(A.store) }, { joinMyDay: false });
    A.store.syncAutoMyDay();
    await A.sync();
    await B.sync();
    A.advance(60_000);
    A.store.removeFromMyDay(t.id);
    // B 还没拉到墓碑：它的行已经在了（同步来的），不会再写；就算 B 是新装的、自己又加了一遍，时间戳也比墓碑早
    B.advance(120_000);
    B.store.syncAutoMyDay();
    await B.sync();
    await A.sync();
    await B.sync();
    expect(inDay(A.store)).toEqual([]);
    expect(inDay(B.store)).toEqual([]);
  });

  it('B 从来没同步过这一天，自己自动加了；A 上移出（只有手动行）也盖得住', async () => {
    const [A, B] = await devices();
    const g = group(A.store);
    const t = A.store.createTask({ body_md: '打包', group_id: g.id, scheduled_date: today(A.store) }, { joinMyDay: false });
    await A.sync();
    await B.sync();
    // A：用户先手动加（老的随机 id），再移出；B 离线时自动加
    A.store.insert('my_day', { task_id: t.id, date: today(A.store), sort: 1, added_at: A.store.now().toISOString() });
    A.advance(60_000);
    A.store.removeFromMyDay(t.id);
    B.advance(120_000);
    expect(B.store.syncAutoMyDay()).toBe(1);
    await B.sync();
    await A.sync();
    await B.sync();
    expect(inDay(A.store)).toEqual([]);
    expect(inDay(B.store)).toEqual([]);
  });
});

describe('只有当前的才自动进（Rei 2026-11-08）', () => {
  it('过期的、没到的不加；日期改到今天就加；打卡、没日期的刚解锁照旧', async () => {
    const { store } = await open();
    const g = group(store);
    const late = store.createTask({ body_md: '过期', group_id: g.id, scheduled_date: '2026-10-30' });
    const rangeOver = store.createTask({ body_md: '段已过', group_id: g.id, scheduled_date: '2026-10-28', end_date: '2026-11-01' });
    const future = store.createTask({ body_md: '下周', group_id: g.id, scheduled_date: '2026-11-09' });
    const habit = store.createTask({ body_md: '喝水', group_id: g.id, recurrence: 'FREQ=DAILY', completion_mode: 'count', target_value: 8 });
    expect(store.syncAutoMyDay()).toBe(1);
    expect(inDay(store)).toEqual([habit.id]);
    store.updateTask(late.id, { scheduled_date: today(store) });
    // 改日期那一下就放进来了（myday-date-join.test.ts），自动加不用再加
    expect(store.syncAutoMyDay()).toBe(0);
    expect(inDay(store)).toContain(late.id);
    expect(inDay(store)).not.toContain(rangeOver.id);
    expect(inDay(store)).not.toContain(future.id);
  });

  it('早上自动加进来的（规则改之前），现在过期了：当天不显示；手动加的过期任务照常显示', async () => {
    const { store } = await open();
    const g = group(store);
    const d = today(store);
    const auto = store.createTask({ body_md: '自动的', group_id: g.id, scheduled_date: '2026-10-30' });
    const manual = store.createTask({ body_md: '手动的', group_id: g.id, scheduled_date: '2026-10-30' });
    // 老版本写的自动行：added_at 是那天 00:00Z
    store.insert('my_day', { task_id: auto.id, date: d, sort: 0, added_at: `${d}T00:00:00.000Z` });
    store.addToMyDay(manual.id);
    const rows = store.list('my_day').filter((e) => e.date === d);
    const stale = rows.filter((e) => isStaleAutoEntry(e, store.get('task', e.task_id), store.now())).map((e) => e.task_id);
    expect(stale).toEqual([auto.id]);
    expect(isAutoEntry(rows.find((e) => e.task_id === manual.id)!)).toBe(false);
  });
});
