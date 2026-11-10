/**
 * 删资料库（Rei 2026-11-10「空资料库可以删，有内容的不可以」）：判空、删除、同步墓碑、内置不给删 / 不被补齐复活。
 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { SyncEngine } from '../src/sync/engine';
import { MemoryRemote } from '../src/sync/memory-remote';
import { BUILTIN_TYPE_IDS as T } from '../src/seed/builtin-types';
import { TypeDeleteError, isArchivedType, isTypeContentEmpty, typeDeleteBlock } from '../src/index';
import { local } from './helpers';

async function open(adapter = new MemoryAdapter(), deviceId = 'dev1', t0 = local(2026, 11, 10, 9).getTime()) {
  let t = t0;
  const store = await Store.open(adapter, { deviceId, now: () => new Date(t) });
  return { store, adapter, advance: (ms: number) => (t += ms), now: () => t };
}

const none = { tasks: 0, items: 0, groups: 0 };

describe('判空（纯函数）', () => {
  it('三样都是 0 才算空', () => {
    expect(isTypeContentEmpty(none)).toBe(true);
    expect(isTypeContentEmpty({ ...none, tasks: 1 })).toBe(false);
    expect(isTypeContentEmpty({ ...none, items: 1 })).toBe(false);
    expect(isTypeContentEmpty({ ...none, groups: 1 })).toBe(false);
  });

  it('能不能删：普通 / 人物 fixed，内置 builtin（空的也不行），自定义有内容 not_empty，自定义空的 null', () => {
    expect(typeDeleteBlock({ id: T.plain, builtin: true }, none)).toBe('fixed');
    expect(typeDeleteBlock({ id: T.person, builtin: true }, none)).toBe('fixed');
    expect(typeDeleteBlock({ id: T.game, builtin: true }, none)).toBe('builtin');
    // 种子 id 就算 builtin 字段被改坏了也不给删
    expect(typeDeleteBlock({ id: T.game, builtin: false }, none)).toBe('builtin');
    expect(typeDeleteBlock({ id: 'x', builtin: false }, { ...none, items: 2 })).toBe('not_empty');
    expect(typeDeleteBlock({ id: 'x', builtin: false }, none)).toBeNull();
  });
});

describe('Store 判空', () => {
  it('新建的资料库是空的；有任务、资料、项目默认资料库任一样就不空', async () => {
    const { store } = await open();
    const t = store.createType({ name: '新类型' });
    expect(store.typeContent(t.id)).toEqual(none);
    expect(store.isTypeEmpty(t.id)).toBe(true);
    expect(store.canDeleteType(t.id)).toBe(true);

    const a = store.createType({ name: 'A' });
    store.createLibraryItem(a.id, { name: '只有资料' });
    expect(store.typeContent(a.id)).toEqual({ tasks: 0, items: 1, groups: 0 });
    expect(store.typeDeleteBlock(a.id)).toBe('not_empty');

    const b = store.createType({ name: 'B' });
    store.insert('group', { name: '听', icon: '🎧', start_at: null, end_at: null, category_id: null, default_type_id: b.id, my_day_auto: true });
    expect(store.typeContent(b.id)).toEqual({ tasks: 0, items: 0, groups: 1 });
    expect(store.canDeleteType(b.id)).toBe(false);

    const c = store.createType({ name: 'C' });
    const task = store.createTask({ type_id: c.id, body_md: '只选了库没选资料\n' });
    expect(store.typeContent(c.id).tasks).toBe(1);
    // 完成、关闭的任务也算内容
    store.updateTask(task.id, { status: 'done' });
    expect(store.canDeleteType(c.id)).toBe(false);
  });

  it('删掉的任务、资料不算：删完就是空的', async () => {
    const { store } = await open();
    const t = store.createType({ name: '播客' });
    const task = store.createTask({ type_id: t.id, type_data: { name: '忽左忽右' } });
    expect(store.isTypeEmpty(t.id)).toBe(false);
    const item = store.itemOf(store.get('task', task.id)!)!;
    store.deleteTask(task.id);
    expect(store.typeContent(t.id)).toEqual({ tasks: 0, items: 1, groups: 0 });
    store.deleteLibraryItem(item.id);
    expect(store.isTypeEmpty(t.id)).toBe(true);
    expect(store.canDeleteType(t.id)).toBe(true);
  });

  it('归档的项目、归档的资料库照样判断', async () => {
    const { store } = await open();
    const t = store.createType({ name: '播客' });
    const g = store.insert('group', { name: '听', icon: '🎧', start_at: null, end_at: null, category_id: null, default_type_id: t.id, my_day_auto: true });
    store.archiveGroup(g.id);
    expect(store.canDeleteType(t.id)).toBe(false);
    const e = store.createType({ name: '空的' });
    store.archiveType(e.id);
    expect(store.canDeleteType(e.id)).toBe(true);
  });
});

describe('删除', () => {
  it('空的自定义资料库：行打墓碑，列表里都没有了；顺序、侧边栏偏好里去掉', async () => {
    const { store } = await open();
    const t = store.createType({ name: '新类型' });
    store.setLibraryInSidebar(t.id, true);
    expect(store.pref('type_order')).toContain(t.id);
    store.deleteType(t.id);
    expect(store.get('task_type', t.id)).toBeUndefined();
    for (const list of [store.pickableTypes(), store.orderedTypes(), store.editableTypes(), store.archivedTypes()]) expect(list.map((x) => x.id)).not.toContain(t.id);
    expect(store.pref('type_order')).not.toContain(t.id);
    expect(store.isLibraryInSidebar(t.id)).toBe(false);
    expect(store.sidebarLibraries().map((x) => x.id)).not.toContain(t.id);
  });

  it('归档着的空资料库也能删', async () => {
    const { store } = await open();
    const t = store.createType({ name: '新类型' });
    store.archiveType(t.id);
    store.deleteType(t.id);
    expect(store.get('task_type', t.id)).toBeUndefined();
    expect(store.archivedTypes().map((x) => x.id)).not.toContain(t.id);
  });

  it('有内容的、内置的、普通 / 人物都抛 TypeDeleteError，行不动', async () => {
    const { store } = await open();
    const t = store.createType({ name: '播客' });
    store.createLibraryItem(t.id, { name: '忽左忽右' });
    expect(() => store.deleteType(t.id)).toThrow(TypeDeleteError);
    try {
      store.deleteType(t.id);
    } catch (e) {
      expect((e as TypeDeleteError).reason).toBe('not_empty');
    }
    expect(store.get('task_type', t.id)).toMatchObject({ deleted: false });
    for (const id of [T.game, T.book, T.plain, T.person]) {
      expect(() => store.deleteType(id)).toThrow(TypeDeleteError);
      expect(store.get('task_type', id)).toBeDefined();
    }
    // 空的内置资料库（新数据里一般没有游戏）也不给删
    expect(store.isTypeEmpty(T.game)).toBe(true);
    expect(store.typeDeleteBlock(T.game)).toBe('builtin');
  });

  it('复制出来的（自定义）空资料库能删', async () => {
    const { store } = await open();
    const copy = store.duplicateType(T.book);
    expect(store.canDeleteType(copy.id)).toBe(true);
    store.deleteType(copy.id);
    expect(store.get('task_type', copy.id)).toBeUndefined();
  });

  it('删完重开：内置补齐、找回被引用的类型都不会把它补回来', async () => {
    const adapter = new MemoryAdapter();
    const { store } = await open(adapter);
    const t = store.createType({ name: '新类型' });
    const builtinCount = store.list('task_type').filter((x) => x.builtin).length;
    store.deleteType(t.id);
    await store.flush();
    const { store: again } = await open(adapter, 'dev1', local(2026, 11, 11, 9).getTime());
    expect(again.get('task_type', t.id)).toBeUndefined();
    expect(again.list('task_type').filter((x) => x.builtin).length).toBe(builtinCount);
    expect(again.archivedTypes().map((x) => x.id)).not.toContain(t.id);
  });
});

describe('删除的同步', () => {
  async function device(remote: MemoryRemote, deviceId: string, t0: number) {
    const d = await open(new MemoryAdapter(), deviceId, t0);
    const engine = new SyncEngine(d.store, remote.transport(), { account: 'rei@example.com', now: () => new Date(d.now()), timers: { set: () => 0, clear: () => {} } });
    return { ...d, sync: () => engine.syncNow() };
  }
  const t0 = local(2026, 11, 10, 9).getTime();

  it('A 删了，B 同步后也没有；B 重开不复活，再推也不复活 A', async () => {
    const remote = new MemoryRemote();
    const A = await device(remote, 'devA', t0);
    const B = await device(remote, 'devB', t0);
    const t = A.store.createType({ name: '新类型' });
    await A.sync();
    await B.sync();
    expect(B.store.get('task_type', t.id)).toBeDefined();
    A.advance(1000);
    A.store.deleteType(t.id);
    await A.sync();
    await B.sync();
    expect(B.store.get('task_type', t.id)).toBeUndefined();
    await B.store.flush();
    const { store: B2 } = await open(B.adapter, 'devB', t0 + 5000);
    expect(B2.get('task_type', t.id)).toBeUndefined();
    B.advance(2000);
    B.store.updateType(T.movie, { color: '#123456' }); // B 别的改动推上去
    await B.sync();
    await A.sync();
    expect(A.store.get('task_type', t.id)).toBeUndefined();
  });

  it('LWW：比墓碑早的旧改动（还没拉到删除的旧客户端）推上来不复活', async () => {
    const remote = new MemoryRemote();
    const A = await device(remote, 'devA', t0);
    const B = await device(remote, 'devB', t0);
    const t = A.store.createType({ name: '新类型' });
    await A.sync();
    await B.sync();
    B.advance(500);
    B.store.updateType(t.id, { name: '改了名' }); // 早于删除
    A.advance(1000);
    A.store.deleteType(t.id);
    await A.sync();
    await B.sync();
    await A.sync();
    for (const s of [A.store, B.store]) expect(s.get('task_type', t.id)).toBeUndefined();
  });

  it('删除后别的设备才改（HLC 更晚）：整行 LWW，改的那边赢，资料库回来（和别的表一样）', async () => {
    const remote = new MemoryRemote();
    const A = await device(remote, 'devA', t0);
    const B = await device(remote, 'devB', t0);
    const t = A.store.createType({ name: '新类型' });
    await A.sync();
    await B.sync();
    A.advance(1000);
    A.store.deleteType(t.id);
    B.advance(3000);
    B.store.updateType(t.id, { name: '还要用' });
    await A.sync();
    await B.sync();
    await A.sync();
    for (const s of [A.store, B.store]) expect(s.get('task_type', t.id)).toMatchObject({ name: '还要用', deleted: false });
  });

  it('A 删空库的同时 B 往里加了任务：同步后重开，资料库找回来、是归档状态，任务不丢', async () => {
    const remote = new MemoryRemote();
    const A = await device(remote, 'devA', t0);
    const B = await device(remote, 'devB', t0);
    const t = A.store.createType({ name: '播客' });
    await A.sync();
    await B.sync();
    A.advance(1000);
    A.store.deleteType(t.id);
    B.advance(500);
    B.store.createTask({ type_id: t.id, type_data: { name: '忽左忽右' } });
    await A.sync();
    await B.sync();
    await A.sync();
    await A.store.flush();
    const { store: A2 } = await open(A.adapter, 'devA', t0 + 5000);
    const back = A2.get('task_type', t.id)!;
    expect(back).toMatchObject({ deleted: false, hidden: true });
    expect(isArchivedType(back)).toBe(true);
    expect(A2.libraryEntries(t.id).map((e) => e.name)).toEqual(['忽左忽右']);
  });
});
