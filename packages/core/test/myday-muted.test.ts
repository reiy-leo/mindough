/**
 * 项目关了「出现在我的一天」以后，这个项目的任务不再自己出现在我的一天（Rei 2026-11-22「项目中我关闭了"出现在我的一天"后，我的一天中还有这个项目的任务」）。
 * 系统加的行（isAutoEntry）只在读的时候藏，不删、不写墓碑，重新打开开关就回来；手动加的、置顶的照常。
 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { SyncEngine } from '../src/sync/engine';
import { MemoryRemote } from '../src/sync/memory-remote';
import { checkInDayItems, isAutoEntry, makeupDayItems, myDayEntryId, myDayItems, recentlyUnlocked, suggestions, yesterdayUnfinished } from '../src/myday';
import { toDateKey } from '../src/dates';
import { local } from './helpers';

const DAY = 24 * 3600_000;

async function open(deviceId = 'dev1', t0 = local(2026, 11, 2, 9).getTime()) {
  let t = t0;
  const store = await Store.open(new MemoryAdapter(), { deviceId, now: () => new Date(t) });
  return { store, advance: (ms: number) => (t += ms), now: () => t };
}
const today = (s: Store) => toDateKey(s.now());
const group = (store: Store, my_day_auto = true) =>
  store.insert('group', { name: '搬家', icon: '🏠', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto });

/** 和 client lib/myday-items.ts dayItems 一样拼出当天看得见的清单（不含置顶）。 */
function visible(store: Store): string[] {
  const d = today(store);
  const now = store.now();
  const tasks = store.list('task');
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const checkIns = store.list('check_in');
  const groups = store.list('group');
  const seen = new Set(store.listAll('my_day').filter((e) => e.date === d).map((e) => e.task_id));
  const items = myDayItems(store.visibleMyDayRows(), byId, checkIns, d, now);
  const virt = [...checkInDayItems(tasks, groups, checkIns, d, now, seen, store.pinnedAt), ...makeupDayItems(tasks, groups, store.listAll('my_day'), checkIns, d, now, seen, store.pinnedAt)];
  return [...items, ...virt].map((i) => i.task.id);
}
const sugg = (s: Store) => {
  const tasks = s.list('task');
  const derived = s.derived();
  const unlocked = recentlyUnlocked(tasks, s.blockingEdges(), derived, new Date(s.now().getTime() - DAY).toISOString());
  return suggestions({ tasks, entries: s.visibleMyDayRows(), checkIns: s.list('check_in'), derived, recentlyUnlocked: unlocked, today: today(s), now: s.now(), groups: s.list('group'), pinOf: s.pinnedAt }).map((x) => x.task.id);
};

describe('关了「出现在我的一天」：项目任务不自己出现', () => {
  it('今天已经自动加进来的：关了就藏，不删行、不写墓碑；再打开回来，不重复加', async () => {
    const { store } = await open();
    const g = group(store);
    const t = store.createTask({ body_md: '打包', group_id: g.id, scheduled_date: today(store) }, { joinMyDay: false });
    store.syncAutoMyDay();
    expect(visible(store)).toEqual([t.id]);
    const rowsBefore = store.listAll('my_day').length;

    store.updateGroup(g.id, { my_day_auto: false });
    store.syncAutoMyDay();
    expect(visible(store)).toEqual([]);
    expect(store.isInMyDay(t.id)).toBe(false);
    expect(store.listAll('my_day').length).toBe(rowsBefore);
    expect(store.listAll('my_day').every((e) => !e.deleted)).toBe(true);
    // 到了那天在建议里（开关下面的提示这么写）
    expect(sugg(store)).toContain(t.id);

    store.updateGroup(g.id, { my_day_auto: true });
    store.syncAutoMyDay();
    expect(visible(store)).toEqual([t.id]);
    expect(store.listAll('my_day').length).toBe(rowsBefore);
    expect(sugg(store)).not.toContain(t.id);
  });

  it('手动加进来的照常在；置顶的照常在', async () => {
    const { store } = await open();
    const g = group(store, false);
    const m = store.createTask({ body_md: '手动', group_id: g.id });
    store.addToMyDay(m.id);
    const p = store.createTask({ body_md: '置顶', group_id: g.id });
    store.pinTask(p.id);
    expect(visible(store)).toContain(m.id);
    expect(store.isInMyDay(m.id)).toBe(true);
    expect(store.isPinned(store.get('task', p.id)!)).toBe(true);
  });

  it('日期设成今天：开关关着不加（进建议）；开着加的是系统行，之后关了也藏', async () => {
    const { store } = await open();
    const off = group(store, false);
    const a = store.createTask({ body_md: 'a', group_id: off.id });
    store.updateTask(a.id, { scheduled_date: today(store) });
    const b = store.createTask({ body_md: 'b', group_id: off.id, scheduled_date: today(store) });
    expect(store.listAll('my_day').some((e) => e.task_id === a.id || e.task_id === b.id)).toBe(false);
    expect(visible(store)).toEqual([]);
    expect(sugg(store)).toEqual(expect.arrayContaining([a.id, b.id]));

    const on = group(store, true);
    const c = store.createTask({ body_md: 'c', group_id: on.id, scheduled_date: today(store) });
    const row = store.list('my_day').find((e) => e.task_id === c.id)!;
    expect(isAutoEntry(row)).toBe(true);
    expect(visible(store)).toEqual([c.id]);
    store.updateGroup(on.id, { my_day_auto: false });
    expect(visible(store)).toEqual([]);
    store.updateGroup(on.id, { my_day_auto: true });
    expect(visible(store)).toEqual([c.id]);
  });

  it('藏起来的那件，用户手动加入：改成手动行、排最上面，之后开关怎么拨都在', async () => {
    const { store, advance } = await open();
    const g = group(store);
    const t = store.createTask({ body_md: 't', group_id: g.id, scheduled_date: today(store) }, { joinMyDay: false });
    store.syncAutoMyDay();
    const x = store.createTask({ body_md: 'x' });
    advance(1000);
    store.addToMyDay(x.id);
    store.updateGroup(g.id, { my_day_auto: false });
    expect(store.isInMyDay(t.id)).toBe(false);
    advance(1000);
    store.addToMyDay(t.id);
    expect(store.isInMyDay(t.id)).toBe(true);
    expect(visible(store)).toEqual([t.id, x.id]);
    const rows = store.listAll('my_day').filter((e) => e.task_id === t.id);
    expect(rows.map((e) => e.id)).toEqual([myDayEntryId(t.id, today(store))]);
    expect(isAutoEntry(rows[0]!)).toBe(false);
  });

  it('打卡：今天要打的虚拟行不出（进建议），拖过落成的行也藏；再打开都回来；不在项目里的打卡不受影响', async () => {
    const { store } = await open();
    const g = group(store);
    const h = store.createTask({ body_md: '刷牙', group_id: g.id, recurrence: 'FREQ=DAILY' });
    const k = store.createTask({ body_md: '深蹲', group_id: g.id, completion_mode: 'count', target_value: 20, recurrence: 'FREQ=DAILY' });
    const free = store.createTask({ body_md: '喝水', recurrence: 'FREQ=DAILY' });
    store.reorderMyDay(today(store), [k.id]); // 拖过：落成真行
    expect(new Set(visible(store))).toEqual(new Set([h.id, k.id, free.id]));
    expect(isAutoEntry(store.list('my_day').find((e) => e.task_id === k.id)!)).toBe(true);

    store.updateGroup(g.id, { my_day_auto: false });
    expect(visible(store)).toEqual([free.id]);
    expect(store.isInMyDay(h.id)).toBe(false);
    expect(store.isInMyDay(k.id)).toBe(false);
    expect(sugg(store)).toEqual(expect.arrayContaining([h.id, k.id]));

    store.updateGroup(g.id, { my_day_auto: true });
    expect(new Set(visible(store))).toEqual(new Set([h.id, k.id, free.id]));
  });

  it('补打卡：点了那天的真行留着（手动），之后几天的虚拟行在关了开关的项目里不出', async () => {
    const { store, advance } = await open(); // 周一
    const g = group(store);
    const h = store.createTask({ body_md: '跑步', group_id: g.id, completion_mode: 'count', target_value: 3, recurrence: 'FREQ=WEEKLY;BYDAY=MO,TH' });
    advance(DAY); // 周二：能补周一
    expect(store.startMakeup(h.id)).toBe('2026-11-02');
    store.updateGroup(g.id, { my_day_auto: false });
    expect(visible(store)).toEqual([h.id]); // 手动点的
    advance(DAY); // 周三：本来虚拟行带着
    expect(visible(store)).toEqual([]);
    store.updateGroup(g.id, { my_day_auto: true });
    expect(visible(store)).toEqual([h.id]);
  });

  it('「昨天没做完」：昨天系统加的不列，昨天手动加的照常列', async () => {
    const { store, advance } = await open();
    const g = group(store);
    const auto = store.createTask({ body_md: 'auto', group_id: g.id, scheduled_date: today(store) }, { joinMyDay: false });
    const manual = store.createTask({ body_md: 'manual', group_id: g.id });
    store.syncAutoMyDay();
    store.addToMyDay(manual.id);
    store.updateGroup(g.id, { my_day_auto: false });
    advance(DAY);
    const tasks = store.list('task');
    const y = yesterdayUnfinished(store.visibleMyDayRows(), new Map(tasks.map((t) => [t.id, t])), store.list('check_in'), today(store), store.now(), store.pinnedAt);
    expect(y.map((t) => t.id)).toEqual([manual.id]);
  });

  it('等待安排：藏起来的自动行不算在今天，没日期的任务回到等待安排', async () => {
    const { store, advance } = await open();
    const g = group(store);
    const pred = store.createTask({ body_md: '前置' });
    const t = store.createTask({ body_md: '解锁', group_id: g.id });
    store.addDependency(pred.id, t.id);
    advance(1000);
    store.completeTask(pred.id);
    store.syncAutoMyDay(); // 刚解锁：自动加
    expect(store.isInMyDay(t.id)).toBe(true);
    expect(store.backlog().map((x) => x.id)).not.toContain(t.id);
    store.updateGroup(g.id, { my_day_auto: false });
    expect(store.backlog().map((x) => x.id)).toContain(t.id);
  });

  it('多设备：A 关了开关，同步后 B 也藏；A 再打开，B 也回来（没有墓碑挡着）', async () => {
    const remote = new MemoryRemote();
    const A = await open('devA');
    const B = await open('devB');
    const sync = (d: typeof A) => new SyncEngine(d.store, remote.transport(), { account: 'r@x', now: () => new Date(d.now()), timers: { set: () => 0, clear: () => {} } }).syncNow();
    const g = group(A.store);
    const t = A.store.createTask({ body_md: 't', group_id: g.id, scheduled_date: today(A.store) }, { joinMyDay: false });
    A.store.syncAutoMyDay();
    await sync(A);
    await sync(B);
    B.store.syncAutoMyDay();
    expect(visible(B.store)).toEqual([t.id]);
    A.advance(1000);
    A.store.updateGroup(g.id, { my_day_auto: false });
    await sync(A);
    await sync(B);
    B.store.syncAutoMyDay();
    expect(visible(B.store)).toEqual([]);
    A.advance(1000);
    A.store.updateGroup(g.id, { my_day_auto: true });
    await sync(A);
    await sync(B);
    B.store.syncAutoMyDay();
    expect(visible(B.store)).toEqual([t.id]);
    expect(B.store.listAll('my_day').filter((e) => e.task_id === t.id).length).toBe(1);
  });
});
