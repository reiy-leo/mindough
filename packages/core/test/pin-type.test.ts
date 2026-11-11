/**
 * 置顶改成内置类型「置顶」（Rei 2026-11-12 03:44「置顶任务应该用"类型"，一个叫做"置顶"的类型」、03:46「有置顶类型就置顶。没就不置顶不就好了」）：
 * - 挂了「置顶」= 置顶，没挂 = 不置顶；类型设成不显示 = 没有置顶功能（Store.pinnedAt / isPinned / pinEnabled）。
 * - pinTask / unpinTask 就是挂上 / 摘掉；在类型选择器里选它一样（setTaskCategories）。
 * - pinned_at 双写：挂类型时写成现在、摘时清空；老客户端照旧看它。只有类型没有 pinned_at 的，用关联行的时间兜底。
 * - 迁移 / 老客户端：pinned_at 有值没挂的补挂（id 由任务 + 类型算出、时间用任务行的，各设备一样）；老客户端取消置顶摘掉。
 * - 「置顶」不当主类型（单值 category_id），倒数日记录不抄它。
 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { SyncEngine } from '../src/sync/engine';
import { MemoryRemote } from '../src/sync/memory-remote';
import { myDayItems, myDaySections, pinnedDayItems, withPinned } from '../src/myday';
import { toDateKey } from '../src/dates';
import { PIN_CATEGORY_ID, BUILTIN_CATEGORY_IDS, BUILTIN_CATEGORIES } from '../src/seed/builtin-checkin-categories';
import { refsMirrorOf, taskCategoryId } from '../src/task-refs';
import { local } from './helpers';

async function open(adapter = new MemoryAdapter(), deviceId = 'dev1', t0 = local(2026, 11, 12, 9).getTime()) {
  let t = t0;
  const store = await Store.open(adapter, { deviceId, now: () => new Date(t) });
  return { store, adapter, advance: (ms: number) => (t += ms), now: () => t };
}

const openIds = (s: Store) => {
  const tasks = s.list('task');
  const date = toDateKey(s.now());
  const items = withPinned(myDayItems(s.list('my_day'), new Map(tasks.map((t) => [t.id, t])), s.list('check_in'), date, s.now()), pinnedDayItems(tasks, s.list('group'), s.list('check_in'), date, s.now(), s.pinnedAt));
  return myDaySections(items).open.map((i) => i.task.id);
};
const pinLink = (s: Store, taskId: string) => s.listAll('task_category').find((l) => l.id === taskCategoryId(taskId, PIN_CATEGORY_ID));

describe('内置类型「置顶」', () => {
  it('固定 id、红色 Lucide pin、内置，老用户打开时补上', async () => {
    const pin = BUILTIN_CATEGORIES.find((c) => c.id === PIN_CATEGORY_ID)!;
    expect(pin).toMatchObject({ name: '置顶', icon: 'pin', builtin: true, hidden: false });
    expect(Object.values(BUILTIN_CATEGORY_IDS)).not.toContain(PIN_CATEGORY_ID);
    const { store } = await open();
    expect(store.get('category', PIN_CATEGORY_ID)?.name).toBe('置顶');
    expect(store.pinEnabled()).toBe(true);
  });
});

describe('置顶 = 挂了「置顶」类型', () => {
  it('pinTask 挂上（排在最后、不当主类型）并写 pinned_at；unpinTask 摘掉并清空', async () => {
    const { store, advance } = await open();
    const sport = BUILTIN_CATEGORY_IDS.sport;
    const t = store.createTask({ body_md: '跑步', category_id: sport });
    advance(1000);
    store.pinTask(t.id);
    expect(store.categoryIdsOfTask(t.id)).toEqual([sport, PIN_CATEGORY_ID]);
    expect(store.get('task', t.id)!.category_id).toBe(sport);
    expect(store.get('task', t.id)!.pinned_at).toBe(new Date(local(2026, 11, 12, 9).getTime() + 1000).toISOString());
    expect(store.get('task', t.id)!.refs_mirror).toBe(refsMirrorOf(store.get('task', t.id)!));
    expect(store.isPinned(t.id)).toBe(true);
    expect(store.categoriesOfTaskNoPin(t.id).map((c) => c.id)).toEqual([sport]);
    store.unpinTask(t.id);
    expect(store.categoryIdsOfTask(t.id)).toEqual([sport]);
    expect(store.get('task', t.id)!.pinned_at).toBeNull();
    expect(store.isPinned(t.id)).toBe(false);
  });

  it('在类型选择器里选它一样：setTaskCategories 挂上就置顶、去掉就取消；只挂了它时主类型是空', async () => {
    const { store } = await open();
    const t = store.createTask({ body_md: 'A' });
    store.setTaskCategories(t.id, [PIN_CATEGORY_ID]);
    expect(store.isPinned(t.id)).toBe(true);
    expect(store.get('task', t.id)!.pinned_at).toBeTruthy();
    expect(store.get('task', t.id)!.category_id).toBeNull();
    expect(openIds(store)).toEqual([t.id]);
    store.setTaskCategories(t.id, []);
    expect(store.isPinned(t.id)).toBe(false);
    expect(store.get('task', t.id)!.pinned_at).toBeNull();
    expect(openIds(store)).toEqual([]);
  });

  it('后置顶的在上；改别的类型不动置顶时间', async () => {
    const { store, advance } = await open();
    const a = store.createTask({ body_md: 'A' });
    const b = store.createTask({ body_md: 'B' });
    store.pinTask(a.id);
    advance(1000);
    store.pinTask(b.id);
    expect(openIds(store)).toEqual([b.id, a.id]);
    advance(1000);
    const at = store.get('task', a.id)!.pinned_at;
    store.setTaskCategories(a.id, [BUILTIN_CATEGORY_IDS.study, PIN_CATEGORY_ID]);
    expect(store.get('task', a.id)!.pinned_at).toBe(at);
    expect(openIds(store)).toEqual([b.id, a.id]);
  });

  it('「置顶」设成不显示：谁都不算置顶，挂着的照常挂着；再显示回来照旧', async () => {
    const { store } = await open();
    const t = store.createTask({ body_md: 'A' });
    store.pinTask(t.id);
    store.setCategoryState(PIN_CATEGORY_ID, 'hidden');
    expect(store.pinEnabled()).toBe(false);
    expect(store.isPinned(t.id)).toBe(false);
    expect(store.categoryIdsOfTask(t.id)).toEqual([PIN_CATEGORY_ID]);
    expect(openIds(store)).toEqual([]);
    expect(store.backlog().map((x) => x.id)).toContain(t.id);
    store.setCategoryState(PIN_CATEGORY_ID, 'normal');
    expect(store.isPinned(t.id)).toBe(true);
    expect(openIds(store)).toEqual([t.id]);
  });

  it('直接写 pinned_at（导入、老代码路径）也挂上 / 摘掉类型', async () => {
    const { store } = await open();
    const t = store.createTask({ body_md: 'A', pinned_at: '2026-11-01T00:00:00.000Z' });
    expect(store.categoryIdsOfTask(t.id)).toEqual([PIN_CATEGORY_ID]);
    expect(store.pinnedAt(store.get('task', t.id)!)).toBe('2026-11-01T00:00:00.000Z');
    store.updateTask(t.id, { pinned_at: null });
    expect(store.categoryIdsOfTask(t.id)).toEqual([]);
  });

  it('重复倒数日的记录不抄「置顶」', async () => {
    const { store, advance } = await open();
    const t = store.createTask({ body_md: '交房租', completion_mode: 'countdown', target_date: '2026-11-12', recurrence: 'FREQ=MONTHLY;BYMONTHDAY=12' });
    store.pinTask(t.id);
    advance(2 * 24 * 3600_000);
    store.rollRecurringCountdowns();
    const records = store.list('task').filter((x) => x.id !== t.id);
    expect(records.length).toBeGreaterThan(0);
    for (const r of records) expect(store.isPinned(r)).toBe(false);
  });
});

describe('迁移、老客户端、同步', () => {
  it('打开时：pinned_at 有值没挂的补挂；行 id 和时间各设备一样，再打开不重复', async () => {
    const adapter = new MemoryAdapter();
    const old = {
      id: 't-old', updated_at: '1762900000000-0000-dev0', deleted: false, body_md: '老置顶', status: '待办', completion_mode: 'once', sort: 1,
      created_at: '2026-11-08T00:00:00.000Z', pinned_at: '2026-11-08T01:00:00.000Z', category_id: null, library_item_id: null, refs_mirror: '|',
    };
    await adapter.applyRemoteChanges([{ table: 'task', row: old } as never]);
    const { store } = await open(adapter);
    const link = pinLink(store, 't-old')!;
    expect(link).toMatchObject({ deleted: false, category_id: PIN_CATEGORY_ID, updated_at: old.updated_at });
    expect(store.isPinned('t-old')).toBe(true);
    expect(store.pinnedAt(store.get('task', 't-old')!)).toBe(old.pinned_at);
    await store.flush();
    const { store: again } = await open(adapter);
    expect(again.listAll('task_category').filter((l) => l.task_id === 't-old')).toHaveLength(1);
    // 另一台设备各补一遍：同一行
    const other = new MemoryAdapter();
    await other.applyRemoteChanges([{ table: 'task', row: old } as never]);
    const { store: b } = await open(other, 'dev2');
    expect(pinLink(b, 't-old')).toEqual(link);
  });

  it('老客户端置顶（只写 pinned_at、签名没有 P）：补挂；老客户端取消置顶（签名有 P、pinned_at 空）：摘掉', async () => {
    const { store } = await open();
    const t = store.createTask({ body_md: 'A' });
    const row = store.get('task', t.id)!;
    store.applyRemote([{ table: 'task', row: { ...row, pinned_at: '2026-11-12T02:00:00.000Z', updated_at: '9000000000000-0000-old' } } as never]);
    expect(store.isPinned(t.id)).toBe(true);
    expect(pinLink(store, t.id)?.updated_at).toBe('9000000000000-0000-old');
    store.applyRemote([{ table: 'task', row: { ...store.get('task', t.id)!, refs_mirror: '||P', pinned_at: null, updated_at: '9000000000001-0000-old' } } as never]);
    expect(store.isPinned(t.id)).toBe(false);
    expect(pinLink(store, t.id)?.deleted).toBe(true);
  });

  it('新客户端写的行签名对得上，不当成老客户端：改正文不动置顶', async () => {
    const { store } = await open();
    const t = store.createTask({ body_md: 'A' });
    store.pinTask(t.id);
    store.updateTask(t.id, { body_md: 'A2' });
    expect(store.isPinned(t.id)).toBe(true);
    expect(store.get('task', t.id)!.refs_mirror).toBe('||P');
  });

  it('只同步来类型、没有 pinned_at：用关联行的时间排', async () => {
    const { store } = await open();
    const t = store.createTask({ body_md: 'A' });
    const link = { id: taskCategoryId(t.id, PIN_CATEGORY_ID), updated_at: `${String(Date.UTC(2026, 10, 12, 1)).padStart(13, '0')}-0000-devX`, deleted: false, task_id: t.id, category_id: PIN_CATEGORY_ID, sort: 0, created_at: '2026-11-12T01:00:00.000Z' };
    store.applyRemote([{ table: 'task_category', row: link } as never]);
    expect(store.get('task', t.id)!.pinned_at).toBeNull();
    expect(store.pinnedAt(store.get('task', t.id)!)).toBe('2026-11-12T01:00:00.000Z');
    expect(openIds(store)).toEqual([t.id]);
  });

  it('两台设备：置顶、取消置顶都过去（类型行和 pinned_at 一起）', async () => {
    const remote = new MemoryRemote();
    const dev = async (id: string) => {
      const d = await open(new MemoryAdapter(), id);
      const engine = new SyncEngine(d.store, remote.transport(), { account: 'rei@example.com', now: () => new Date(d.now()), timers: { set: () => 0, clear: () => {} } });
      return { ...d, sync: () => engine.syncNow() };
    };
    const a = await dev('devA');
    const b = await dev('devB');
    const t = a.store.createTask({ body_md: 'A' });
    a.advance(1000);
    a.store.pinTask(t.id);
    await a.sync();
    await b.sync();
    expect(b.store.isPinned(t.id)).toBe(true);
    expect(b.store.get('task', t.id)!.pinned_at).toBe(a.store.get('task', t.id)!.pinned_at);
    b.advance(5000);
    b.store.unpinTask(t.id);
    await b.sync();
    await a.sync();
    expect(a.store.isPinned(t.id)).toBe(false);
    expect(a.store.get('task', t.id)!.pinned_at).toBeNull();
  });
});
