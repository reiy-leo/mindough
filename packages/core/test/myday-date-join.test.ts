/**
 * 日期设成今天，自动放进今天的我的一天（Rei 2026-11-08「如果日期设置的今天，自动添加到我的一天」）。
 * 和「改日期不是今天就移出」（myday-order.test.ts）对称。
 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { SyncEngine } from '../src/sync/engine';
import { MemoryRemote } from '../src/sync/memory-remote';
import { entriesFor, myDayEntryId } from '../src/myday';
import { toDateKey } from '../src/dates';
import { local } from './helpers';

async function open(deviceId = 'dev1', t0 = local(2026, 11, 8, 9).getTime()) {
  let t = t0;
  const store = await Store.open(new MemoryAdapter(), { deviceId, now: () => new Date(t) });
  return { store, advance: (ms: number) => (t += ms), now: () => t };
}
const today = (s: Store) => toDateKey(s.now());
const order = (s: Store) => entriesFor(s.list('my_day'), today(s)).map((e) => e.task_id);
const group = (store: Store, extra: Record<string, unknown> = {}) =>
  store.insert('group', { name: '搬家', icon: '🏠', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto: false, ...extra });

describe('日期设成今天：放进我的一天', () => {
  it('没日期 / 以后 / 以前 改成今天：加进来，排在最上面', async () => {
    const { store, advance } = await open();
    const a = store.createTask({ body_md: 'a' });
    const b = store.createTask({ body_md: 'b', scheduled_date: '2026-11-12' });
    const c = store.createTask({ body_md: 'c', scheduled_date: '2026-11-01' });
    const x = store.createTask({ body_md: 'x' });
    store.addToMyDay(x.id);
    store.reorderMyDay(today(store), [x.id]); // 拖过的行 sort = 1
    advance(1000);
    store.updateTask(a.id, { scheduled_date: today(store) });
    advance(1000);
    store.updateTask(b.id, { scheduled_date: today(store) });
    advance(1000);
    store.updateTask(c.id, { scheduled_date: today(store) });
    expect(order(store)).toEqual([c.id, b.id, a.id, x.id]);
    const row = store.list('my_day').find((e) => e.task_id === a.id)!;
    expect(row.sort).toBeLessThan(0);
    expect(row.added_at).not.toBe(`${today(store)}T00:00:00.000Z`); // 手动加入的样子，不是自动行
  });

  it('日期段从不含今天变成含今天：加；本来就含今天、只改结束日：不加', async () => {
    const { store } = await open();
    const t = store.createTask({ body_md: 't', scheduled_date: '2026-11-01', end_date: '2026-11-05' });
    expect(store.isInMyDay(t.id)).toBe(false);
    store.updateTask(t.id, { end_date: '2026-11-10' });
    expect(store.isInMyDay(t.id)).toBe(true);

    const u = store.createTask({ body_md: 'u', scheduled_date: '2026-11-06', end_date: '2026-11-09' });
    expect(store.isInMyDay(u.id)).toBe(true); // 新建时段含今天
    store.removeFromMyDay(u.id);
    store.updateTask(u.id, { end_date: '2026-11-12' }); // 改前改后都含今天
    expect(store.isInMyDay(u.id)).toBe(false);
  });

  it('新建带今天的日期：加；带别的日子、没日期：不加', async () => {
    const { store } = await open();
    const a = store.createTask({ body_md: 'a', scheduled_date: '2026-11-08' });
    const b = store.createTask({ body_md: 'b', scheduled_date: '2026-11-09' });
    const c = store.createTask({ body_md: 'c' });
    expect(store.isInMyDay(a.id)).toBe(true);
    expect(store.isInMyDay(b.id)).toBe(false);
    expect(store.isInMyDay(c.id)).toBe(false);
    const d = store.createTask({ body_md: 'd', scheduled_date: '2026-11-08' }, { joinMyDay: false });
    expect(store.isInMyDay(d.id)).toBe(false);
  });

  it('当天手动移出过：用户又把日期改成今天，加回来（墓碑翻回来，同一个行 id）', async () => {
    const { store, advance } = await open();
    const t = store.createTask({ body_md: 't', scheduled_date: '2026-11-08' });
    store.removeFromMyDay(t.id);
    expect(store.isInMyDay(t.id)).toBe(false);
    store.updateTask(t.id, { scheduled_date: '2026-11-10' });
    advance(1000);
    store.updateTask(t.id, { scheduled_date: '2026-11-08' });
    expect(store.isInMyDay(t.id)).toBe(true);
    const rows = store.listAll('my_day').filter((e) => e.task_id === t.id);
    expect(rows.map((e) => e.id)).toEqual([myDayEntryId(t.id, today(store))]);
    expect(rows[0]!.deleted).toBe(false);
  });

  it('不处理：已在、置顶、完成 / 关闭、打卡归档、归档项目、重复', async () => {
    const { store } = await open();
    const inDay = store.createTask({ body_md: 'in' });
    store.addToMyDay(inDay.id);
    const sortBefore = store.list('my_day').find((e) => e.task_id === inDay.id)!.sort;
    store.updateTask(inDay.id, { scheduled_date: today(store) });
    expect(store.list('my_day').find((e) => e.task_id === inDay.id)!.sort).toBe(sortBefore);

    const pinned = store.createTask({ body_md: 'p' });
    store.pinTask(pinned.id);
    store.updateTask(pinned.id, { scheduled_date: today(store) });

    const done = store.createTask({ body_md: 'd', status: '完成' });
    store.updateTask(done.id, { scheduled_date: today(store) });
    const closed = store.createTask({ body_md: 'c', status: '关闭', scheduled_date: today(store) });

    const archived = store.createTask({ body_md: 'a', archived_at: store.now().toISOString() });
    store.updateTask(archived.id, { scheduled_date: today(store) });

    const g = group(store);
    store.archiveGroup(g.id);
    const inArchived = store.createTask({ body_md: 'g', group_id: g.id });
    store.updateTask(inArchived.id, { scheduled_date: today(store) });

    const habit = store.createTask({ body_md: 'h', completion_mode: 'count', recurrence: 'FREQ=DAILY' });
    store.updateTask(habit.id, { scheduled_date: today(store) });

    for (const t of [pinned, done, closed, archived, inArchived, habit]) expect(store.isInMyDay(t.id)).toBe(false);
  });

  it('倒数日：按开始日算，和普通任务一样；只改目标日不算', async () => {
    const { store } = await open();
    const cd = store.createTask({ body_md: '生日', completion_mode: 'countdown', target_date: '2026-12-01' });
    store.updateTask(cd.id, { target_date: today(store) });
    expect(store.isInMyDay(cd.id)).toBe(false);
    store.updateTask(cd.id, { scheduled_date: today(store) });
    expect(store.isInMyDay(cd.id)).toBe(true);
  });

  it('改回别的日子（撤销）：按「改日期不是今天就移出」移出；清空日期留着', async () => {
    const { store } = await open();
    const t = store.createTask({ body_md: 't', scheduled_date: '2026-11-12' });
    store.updateTask(t.id, { scheduled_date: today(store) });
    expect(store.isInMyDay(t.id)).toBe(true);
    store.updateTask(t.id, { scheduled_date: '2026-11-12' });
    expect(store.isInMyDay(t.id)).toBe(false);
    const u = store.createTask({ body_md: 'u' });
    store.updateTask(u.id, { scheduled_date: today(store) });
    store.updateTask(u.id, { scheduled_date: null });
    expect(store.isInMyDay(u.id)).toBe(true);
  });

  it('同步拉下来的改日期不加第二次（只有改的那台设备写这一行）', async () => {
    const remote = new MemoryRemote();
    const A = await open('devA');
    const B = await open('devB');
    const sync = (d: typeof A) => new SyncEngine(d.store, remote.transport(), { account: 'r@x', now: () => new Date(d.now()), timers: { set: () => 0, clear: () => {} } }).syncNow();
    const t = A.store.createTask({ body_md: 'x', scheduled_date: '2026-11-12' });
    await sync(A);
    await sync(B);
    A.store.updateTask(t.id, { scheduled_date: '2026-11-08' });
    await sync(A);
    await sync(B);
    expect(B.store.isInMyDay(t.id)).toBe(true);
    expect(B.store.listAll('my_day').filter((e) => e.task_id === t.id).length).toBe(1);
    expect(B.store.listAll('my_day').length).toBe(A.store.listAll('my_day').length);
  });
});
