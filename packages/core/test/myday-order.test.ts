/**
 * 我的一天：分未完成 / 已完成两段、新加的在最上面、改日期不是今天就移出（Rei 2026-11-08）。
 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { SyncEngine } from '../src/sync/engine';
import { MemoryRemote } from '../src/sync/memory-remote';
import { autoSort, entriesFor, keepsMyDayAfterDate, myDayItems, myDaySections, reorderSection, topSort } from '../src/myday';
import { toDateKey } from '../src/dates';
import { local } from './helpers';

async function open(deviceId = 'dev1', t0 = local(2026, 11, 8, 9).getTime()) {
  let t = t0;
  const store = await Store.open(new MemoryAdapter(), { deviceId, now: () => new Date(t) });
  return { store, advance: (ms: number) => (t += ms), now: () => t };
}
const today = (s: Store) => toDateKey(s.now());
const order = (s: Store) => entriesFor(s.list('my_day'), today(s)).map((e) => e.task_id);
const items = (s: Store) => myDayItems(s.list('my_day'), new Map(s.list('task').map((t) => [t.id, t])), s.list('check_in'), today(s), s.now());
const group = (store: Store) => store.insert('group', { name: '搬家', icon: '🏠', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto: true });

describe('新加进我的一天的排最上面', () => {
  it('手动加、在我的一天新建、带回今天：后加的在上', async () => {
    const { store, advance } = await open();
    const a = store.createTask({ body_md: 'a' });
    const b = store.createTask({ body_md: 'b' });
    const c = store.createTask({ body_md: 'c' });
    store.addToMyDay(a.id);
    advance(1000);
    store.addToMyDay(b.id);
    store.addToMyDay(c.id); // 同一毫秒也往上叠
    expect(order(store)).toEqual([c.id, b.id, a.id]);
  });

  it('拖过的顺序照旧，新加的插到最上面', async () => {
    const { store, advance } = await open();
    const [a, b, c] = ['a', 'b', 'c'].map((x) => store.createTask({ body_md: x }));
    store.addToMyDay(a!.id);
    store.addToMyDay(b!.id);
    store.reorderMyDay(today(store), [a!.id, b!.id]);
    expect(order(store)).toEqual([a!.id, b!.id]);
    advance(1000);
    store.addToMyDay(c!.id);
    expect(order(store)).toEqual([c!.id, a!.id, b!.id]);
  });

  it('老数据（sort 1..N）和老客户端加的（max + 1）：新加的照样在最上', async () => {
    const { store } = await open();
    const [a, b, c] = ['a', 'b', 'c'].map((x) => store.createTask({ body_md: x }));
    store.insert('my_day', { task_id: a!.id, date: today(store), sort: 1, added_at: store.now().toISOString() });
    store.insert('my_day', { task_id: b!.id, date: today(store), sort: 2, added_at: store.now().toISOString() });
    store.addToMyDay(c!.id);
    expect(order(store)).toEqual([c!.id, a!.id, b!.id]);
  });

  it('自动加的：白天因为改了日期加进来的排在之前手动加的上面；一早加的排在当天手动加的下面', async () => {
    const { store, advance } = await open();
    const g = group(store);
    const early = store.createTask({ body_md: '一早', group_id: g.id, scheduled_date: today(store) });
    store.syncAutoMyDay();
    advance(1000);
    const m = store.createTask({ body_md: '手动' });
    store.addToMyDay(m.id);
    advance(1000);
    const later = store.createTask({ body_md: '改到今天', group_id: g.id, scheduled_date: '2026-11-20' });
    store.updateTask(later.id, { scheduled_date: today(store) });
    store.syncAutoMyDay();
    expect(order(store)).toEqual([later.id, m.id, early.id]);
  });

  it('autoSort 各设备一样：只看数据，不看几点算的；不早于那天 00:00', () => {
    const d = '2026-11-08';
    expect(autoSort(d, [])).toBe(-Date.parse('2026-11-08T00:00:00.000Z'));
    expect(autoSort(d, ['0001700000000-0000-x'])).toBe(-Date.parse('2026-11-08T00:00:00.000Z'));
    const ms = Date.parse('2026-11-08T05:00:00.000Z');
    expect(autoSort(d, [`${ms}-0001-devA`, 'auto'])).toBe(-ms);
  });

  it('topSort：空的一天用 -毫秒；比已有的都小', () => {
    expect(topSort([], '2026-11-08', 5000)).toBe(-5000);
    expect(topSort([{ id: 'x', updated_at: '', deleted: false, task_id: 't', date: '2026-11-08', sort: -9000, added_at: '' }], '2026-11-08', 5000)).toBe(-9001);
  });

  it('同步：别的设备拉下来顺序一样，老客户端只看 sort 也一样', async () => {
    const remote = new MemoryRemote();
    const A = await open('devA');
    const B = await open('devB');
    const eA = new SyncEngine(A.store, remote.transport(), { account: 'r@x', now: () => new Date(A.now()), timers: { set: () => 0, clear: () => {} } });
    const eB = new SyncEngine(B.store, remote.transport(), { account: 'r@x', now: () => new Date(B.now()), timers: { set: () => 0, clear: () => {} } });
    const a = A.store.createTask({ body_md: 'a' });
    const b = A.store.createTask({ body_md: 'b' });
    A.store.addToMyDay(a.id);
    A.advance(1000);
    A.store.addToMyDay(b.id);
    await eA.syncNow();
    await eB.syncNow();
    expect(order(B.store)).toEqual([b.id, a.id]);
    const bySort = [...B.store.list('my_day')].sort((x, y) => x.sort - y.sort).map((e) => e.task_id);
    expect(bySort).toEqual([b.id, a.id]);
  });
});

describe('分两段', () => {
  it('完成、关闭进已完成段，其余在未完成段；段内拖动只动自己那段', async () => {
    const { store, advance } = await open();
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((x) => store.createTask({ body_md: x }));
    for (const t of [a, b, c, d]) {
      store.addToMyDay(t!.id);
      advance(10);
    }
    store.completeTask(b!.id);
    store.closeTask(d!.id);
    const s = myDaySections(items(store));
    expect(s.open.map((i) => i.task.id)).toEqual([c!.id, a!.id]);
    expect(s.done.map((i) => i.task.id)).toEqual([d!.id, b!.id]);
    const next = reorderSection(items(store), 'open', [a!.id, c!.id]);
    expect(next).toEqual([a!.id, c!.id, d!.id, b!.id]);
    store.reorderMyDay(today(store), next);
    expect(myDaySections(items(store)).open.map((i) => i.task.id)).toEqual([a!.id, c!.id]);
    expect(reorderSection(items(store), 'done', [b!.id, d!.id])).toEqual([a!.id, c!.id, b!.id, d!.id]);
  });
});

describe('改日期不是今天：移出我的一天', () => {
  it('改到以后、以前：移出，自动加当天不再加回来', async () => {
    const { store } = await open();
    const g = group(store);
    const t = store.createTask({ body_md: '打包', group_id: g.id, scheduled_date: today(store) });
    store.syncAutoMyDay();
    expect(store.isInMyDay(t.id)).toBe(true);
    store.updateTask(t.id, { scheduled_date: '2026-11-10' });
    expect(store.isInMyDay(t.id)).toBe(false);
    store.updateTask(t.id, { scheduled_date: '2026-11-01' }); // 改回过期，本该自动加，但当天移出过
    expect(store.syncAutoMyDay()).toBe(0);
    expect(store.isInMyDay(t.id)).toBe(false);
    const u = store.createTask({ body_md: 'x' });
    store.addToMyDay(u.id);
    store.updateTask(u.id, { scheduled_date: '2026-11-07' });
    expect(store.isInMyDay(u.id)).toBe(false);
  });

  it('改成今天、清空日期、日期段含今天、只改别的字段：留着', async () => {
    const { store } = await open();
    const t = store.createTask({ body_md: 'x', scheduled_date: '2026-11-08' });
    store.addToMyDay(t.id);
    store.updateTask(t.id, { scheduled_date: null });
    store.updateTask(t.id, { scheduled_date: today(store) });
    store.updateTask(t.id, { scheduled_date: '2026-11-06', end_date: '2026-11-09' });
    store.updateTask(t.id, { body_md: 'y' });
    expect(store.isInMyDay(t.id)).toBe(true);
  });

  it('不在我的一天里的改日期不写我的一天', async () => {
    const { store } = await open();
    const t = store.createTask({ body_md: 'x' });
    store.updateTask(t.id, { scheduled_date: '2026-11-10' });
    expect(store.listAll('my_day')).toEqual([]);
  });

  it('同步拉下来的改日期不再移一次（只在改的那台设备写墓碑）', async () => {
    const remote = new MemoryRemote();
    const A = await open('devA');
    const B = await open('devB');
    const sync = (d: typeof A) => new SyncEngine(d.store, remote.transport(), { account: 'r@x', now: () => new Date(d.now()), timers: { set: () => 0, clear: () => {} } }).syncNow();
    const t = A.store.createTask({ body_md: 'x' });
    A.store.addToMyDay(t.id);
    await sync(A);
    await sync(B);
    expect(B.store.isInMyDay(t.id)).toBe(true);
    A.store.updateTask(t.id, { scheduled_date: '2026-11-12' });
    await sync(A);
    const v = B.store.listAll('my_day').length;
    await sync(B);
    expect(B.store.isInMyDay(t.id)).toBe(false);
    expect(B.store.listAll('my_day').length).toBe(v);
  });

  it('keepsMyDayAfterDate', () => {
    expect(keepsMyDayAfterDate(null, null, ['2026-11-08'])).toBe(true);
    expect(keepsMyDayAfterDate('2026-11-08', null, ['2026-11-08'])).toBe(true);
    expect(keepsMyDayAfterDate('2026-11-09', null, ['2026-11-08'])).toBe(false);
    expect(keepsMyDayAfterDate('2026-11-09', null, ['2026-11-08', '2026-11-09'])).toBe(true);
    expect(keepsMyDayAfterDate('2026-11-01', '2026-11-08', ['2026-11-08'])).toBe(true);
    expect(keepsMyDayAfterDate('2026-11-01', '2026-11-07', ['2026-11-08'])).toBe(false);
  });
});
