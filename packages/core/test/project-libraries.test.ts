/**
 * 项目关联资料库（Rei 2026-11-10，见 src/project-libraries.ts）：
 * 关联后库里已有的、以后加进来的任务都进项目；属于别的项目的挪过来；取消关联只移出因这个库进来的（到无项目）；
 * 一个库只关联一个项目（改关联时任务跟着走）；挂上 / 去掉资料同步进出；手动挪出后不再自动挪；
 * 删掉的任务不算，完成 / 关闭 / 归档的照样挪；严格模式锁住的不动；老客户端的行；两台设备同步。
 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { SqlAdapter, migrate } from '../src/storage/sql';
import { SyncEngine } from '../src/sync/engine';
import { MemoryRemote } from '../src/sync/memory-remote';
import { BUILTIN_TYPE_IDS } from '../src/seed/builtin-types';
import { LIB_OPT_OUT, groupLibraryId, manualVia, placeTask } from '../src/project-libraries';
import { local } from './helpers';
import { NodeSqliteDriver } from './sql-drivers';
import type { Task } from '../src/types';

const MOVIE = BUILTIN_TYPE_IDS.movie;
const BOOK = BUILTIN_TYPE_IDS.book;
const PERSON = BUILTIN_TYPE_IDS.person;

async function open(adapter: MemoryAdapter | SqlAdapter = new MemoryAdapter(), deviceId = 'dev1') {
  let t = local(2026, 11, 10, 9).getTime();
  const store = await Store.open(adapter, { deviceId, now: () => new Date((t += 10)) });
  return store;
}
const group = (store: Store, name = '观影') =>
  store.insert('group', { name, icon: '🎬', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto: true });
/** 一件挂了某个库资料的任务。 */
function taskWith(store: Store, typeId: string, name: string, extra: Partial<Task> = {}) {
  const item = store.createLibraryItem(typeId, { name });
  const t = store.createTask({ body_md: name, ...extra });
  store.addTaskItem(t.id, item.id);
  return { task: store.get('task', t.id)!, item };
}
const gid = (store: Store, id: string) => store.get('task', id)!.group_id;
const via = (store: Store, id: string) => store.get('task', id)!.lib_via ?? null;

describe('placeTask / manualVia（纯函数）', () => {
  const links: Record<string, { groupId: string; archived: boolean }> = { L: { groupId: 'P', archived: false }, M: { groupId: 'Q', archived: false }, A: { groupId: 'Z', archived: true } };
  const linkOf = (id: string) => links[id];
  const alive = () => true;
  it('没关联、手动放的、手动挪出过的不动', () => {
    expect(placeTask({ group_id: null, lib_via: null }, ['X'], linkOf, alive)).toBeNull();
    expect(placeTask({ group_id: 'P', lib_via: null }, ['L'], linkOf, alive)).toBeNull();
    expect(placeTask({ group_id: null, lib_via: LIB_OPT_OUT }, ['L'], linkOf, alive)).toBeNull();
  });
  it('库里的任务挪进关联的项目，第一个库优先；归档项目不再收新任务', () => {
    expect(placeTask({ group_id: null, lib_via: null }, ['L'], linkOf, alive)).toEqual({ group_id: 'P', lib_via: 'L' });
    expect(placeTask({ group_id: 'R', lib_via: null }, ['M', 'L'], linkOf, alive)).toEqual({ group_id: 'Q', lib_via: 'M' });
    expect(placeTask({ group_id: null, lib_via: null }, ['A'], linkOf, alive)).toBeNull();
  });
  it('因库进来的：库取消关联 → 移出到无项目；改关联 → 跟着库走；资料去掉但别的库也关联这里 → 换库', () => {
    expect(placeTask({ group_id: 'P', lib_via: 'U' }, ['U'], linkOf, alive)).toEqual({ group_id: null, lib_via: null });
    expect(placeTask({ group_id: 'P', lib_via: 'M' }, ['M'], linkOf, alive)).toEqual({ group_id: 'Q', lib_via: 'M' });
    expect(placeTask({ group_id: 'P', lib_via: 'X' }, ['L'], linkOf, alive)).toEqual({ group_id: 'P', lib_via: 'L' });
    expect(placeTask({ group_id: 'P', lib_via: 'L' }, [], linkOf, alive)).toEqual({ group_id: null, lib_via: null });
  });
  it('manualVia：挪进关联项目交回资料库；挪出 → !；无关 → 空', () => {
    expect(manualVia('P', ['L'], linkOf)).toBe('L');
    expect(manualVia(null, ['L'], linkOf)).toBe(LIB_OPT_OUT);
    expect(manualVia('R', ['L'], linkOf)).toBe(LIB_OPT_OUT);
    expect(manualVia('R', ['X'], linkOf)).toBeNull();
  });
});

describe('项目关联资料库（Store）', () => {
  it('关联：库里已有的任务都进来（含别的项目里的、完成 / 关闭的），删掉的不算；记下是因哪个库进来的', async () => {
    const store = await open();
    const P = group(store);
    const other = group(store, '别的');
    const a = taskWith(store, MOVIE, '沙丘').task;
    const b = taskWith(store, MOVIE, '花样年华', { group_id: other.id }).task;
    const c = taskWith(store, MOVIE, '教父').task;
    store.setStatus(c.id, '关闭');
    const d = taskWith(store, MOVIE, '已删').task;
    store.deleteTask(d.id);
    const plain = store.createTask({ body_md: '普通' });
    const book = taskWith(store, BOOK, '三体').task;
    expect(store.libraryJoinCount(P.id, [MOVIE])).toBe(3);
    expect(store.setGroupLibraries(P.id, [MOVIE])).toBe(3);
    for (const t of [a, b, c]) {
      expect(gid(store, t.id)).toBe(P.id);
      expect(via(store, t.id)).toBe(MOVIE);
    }
    expect(store.raw('task', d.id)!.group_id).toBeNull();
    expect(gid(store, plain.id)).toBeNull();
    expect(gid(store, book.id)).toBeNull();
    expect(store.groupLibraryIds(P.id)).toEqual([MOVIE]);
    expect(store.libraryGroupId(MOVIE)).toBe(P.id);
  });

  it('以后新加进库的任务自动进来；去掉资料就移出', async () => {
    const store = await open();
    const P = group(store);
    store.setGroupLibraries(P.id, [MOVIE]);
    const { task, item } = taskWith(store, MOVIE, '沙丘');
    expect(gid(store, task.id)).toBe(P.id);
    expect(via(store, task.id)).toBe(MOVIE);
    store.removeTaskItem(task.id, item.id);
    expect(gid(store, task.id)).toBeNull();
    expect(via(store, task.id)).toBeNull();
    // 挂回来又进来
    store.addTaskItem(task.id, item.id);
    expect(gid(store, task.id)).toBe(P.id);
  });

  it('人物库：关联了人的任务算在人物库里', async () => {
    const store = await open();
    const P = group(store, '朋友');
    const person = store.insert('person', { name: '小明', avatar_asset_id: null, relation: null, birthday: null, note_md: '' });
    const t = store.createTask({ body_md: '约饭' });
    store.setGroupLibraries(P.id, [PERSON]);
    expect(gid(store, t.id)).toBeNull();
    store.linkPerson(t.id, person.id);
    expect(gid(store, t.id)).toBe(P.id);
    store.unlinkPerson(t.id, person.id);
    expect(gid(store, t.id)).toBeNull();
  });

  it('取消关联：因这个库进来的移出到无项目（不回原项目），手动放进来的不动', async () => {
    const store = await open();
    const P = group(store);
    const other = group(store, '别的');
    const auto = taskWith(store, MOVIE, '沙丘', { group_id: other.id }).task;
    store.setGroupLibraries(P.id, [MOVIE]);
    const manual = store.createTask({ body_md: '手动放的', group_id: P.id });
    expect(gid(store, auto.id)).toBe(P.id);
    store.setGroupLibraries(P.id, []);
    expect(gid(store, auto.id)).toBeNull();
    expect(via(store, auto.id)).toBeNull();
    expect(gid(store, manual.id)).toBe(P.id);
    expect(store.groupLibraryIds(P.id)).toEqual([]);
    expect(store.raw('group_library', groupLibraryId(MOVIE))!.deleted).toBe(true);
  });

  it('一个库只关联一个项目：改关联到 Q，因它进 P 的任务跟着到 Q', async () => {
    const store = await open();
    const P = group(store, 'P');
    const Q = group(store, 'Q');
    const t = taskWith(store, MOVIE, '沙丘').task;
    store.setGroupLibraries(P.id, [MOVIE]);
    store.setGroupLibraries(Q.id, [MOVIE]);
    expect(store.libraryGroupId(MOVIE)).toBe(Q.id);
    expect(store.groupLibraryIds(P.id)).toEqual([]);
    expect(gid(store, t.id)).toBe(Q.id);
    expect(store.list('group_library')).toHaveLength(1);
  });

  it('手动挪出：到无项目或别的项目都记 !，资料库不再自动拉回；挪回关联项目又交给资料库管', async () => {
    const store = await open();
    const P = group(store, 'P');
    const R = group(store, 'R');
    const t = taskWith(store, MOVIE, '沙丘').task;
    store.setGroupLibraries(P.id, [MOVIE]);
    store.updateTask(t.id, { group_id: null });
    expect(via(store, t.id)).toBe(LIB_OPT_OUT);
    // 再挂一条电影资料也不拉回
    store.addTaskItem(t.id, store.createLibraryItem(MOVIE, { name: '沙丘 2' }).id);
    expect(gid(store, t.id)).toBeNull();
    store.updateTask(t.id, { group_id: R.id });
    expect(via(store, t.id)).toBe(LIB_OPT_OUT);
    store.updateTask(t.id, { group_id: P.id });
    expect(via(store, t.id)).toBe(MOVIE);
    // 交回以后取消关联照样移出
    store.setGroupLibraries(P.id, []);
    expect(gid(store, t.id)).toBeNull();
  });

  it('重新关联时库里所有任务都进来，包括以前手动挪出去的', async () => {
    const store = await open();
    const P = group(store, 'P');
    const t = taskWith(store, MOVIE, '沙丘').task;
    store.setGroupLibraries(P.id, [MOVIE]);
    store.updateTask(t.id, { group_id: null });
    store.setGroupLibraries(P.id, []);
    store.setGroupLibraries(P.id, [MOVIE]);
    expect(gid(store, t.id)).toBe(P.id);
    expect(via(store, t.id)).toBe(MOVIE);
  });

  it('严格模式下完成 / 关闭的任务不动，其余照挪', async () => {
    const store = await open();
    const P = group(store);
    const done = taskWith(store, MOVIE, '看过了').task;
    store.setStatus(done.id, '完成');
    const todo = taskWith(store, MOVIE, '想看').task;
    store.strictDone = true;
    store.setGroupLibraries(P.id, [MOVIE]);
    expect(gid(store, done.id)).toBeNull();
    expect(gid(store, todo.id)).toBe(P.id);
  });

  it('解散项目：任务移出、lib_via 清空；撤销后回来、又归资料库管；项目删了关联不生效', async () => {
    const store = await open();
    const P = group(store);
    const t = taskWith(store, MOVIE, '沙丘').task;
    store.setGroupLibraries(P.id, [MOVIE]);
    const res = store.dissolveGroup(P.id)!;
    expect(gid(store, t.id)).toBeNull();
    expect(via(store, t.id)).toBeNull();
    expect(store.libraryGroupId(MOVIE)).toBeUndefined();
    // 删了的项目不收新任务
    const n = taskWith(store, MOVIE, '新片').task;
    expect(gid(store, n.id)).toBeNull();
    store.undoGroupRemoval(res.undo);
    expect(gid(store, t.id)).toBe(P.id);
    expect(via(store, t.id)).toBe(MOVIE);
    // 撤销后关联生效，新片也进来
    expect(gid(store, n.id)).toBe(P.id);
  });

  it('归档的项目不再收新任务，取消归档后补进来', async () => {
    const store = await open();
    const P = group(store);
    store.setGroupLibraries(P.id, [MOVIE]);
    store.archiveGroup(P.id);
    const t = taskWith(store, MOVIE, '沙丘').task;
    expect(gid(store, t.id)).toBeNull();
    store.unarchiveGroup(P.id);
    expect(gid(store, t.id)).toBe(P.id);
  });

  it('删空资料库时关联一起去掉', async () => {
    const store = await open();
    const P = group(store);
    const lib = store.createType({ name: '播客' });
    store.setGroupLibraries(P.id, [lib.id]);
    expect(store.groupLibraryIds(P.id)).toEqual([lib.id]);
    store.deleteType(lib.id);
    expect(store.raw('group_library', groupLibraryId(lib.id))!.deleted).toBe(true);
  });

  it('老客户端推上来的任务没有 lib_via：项目没变沿用本机的值；项目变了按手动挪出算，不被拉回', async () => {
    const store = await open();
    const P = group(store);
    const t = taskWith(store, MOVIE, '沙丘').task;
    store.setGroupLibraries(P.id, [MOVIE]);
    const cur = store.get('task', t.id)!;
    const old = { ...cur, body_md: '老客户端改了正文', updated_at: `${Date.now() + 1e9}-0000-old` } as Record<string, unknown>;
    delete old.lib_via;
    store.applyRemote([{ table: 'task', row: old as unknown as Task }]);
    expect(via(store, t.id)).toBe(MOVIE);
    const moved = { ...old, group_id: null, updated_at: `${Date.now() + 2e9}-0000-old` };
    store.applyRemote([{ table: 'task', row: moved as unknown as Task }]);
    expect(via(store, t.id)).toBe(LIB_OPT_OUT);
    store.settleAfterSync();
    expect(gid(store, t.id)).toBeNull();
  });

  it('SQLite：迁移后 group_library 和 task.lib_via 存得下、读得回', async () => {
    const driver = new NodeSqliteDriver();
    await migrate(driver);
    const adapter = new SqlAdapter(driver);
    const store = await open(adapter);
    const P = group(store);
    const t = taskWith(store, MOVIE, '沙丘').task;
    store.setGroupLibraries(P.id, [MOVIE]);
    await store.flush();
    const again = await open(new SqlAdapter(driver), 'dev1');
    expect(again.get('task', t.id)!.lib_via).toBe(MOVIE);
    expect(again.groupLibraryIds(P.id)).toEqual([MOVIE]);
  });
});

describe('项目关联资料库：两台设备同步', () => {
  async function device(remote: MemoryRemote, id: string) {
    const store = await open(new MemoryAdapter(), id);
    const engine = new SyncEngine(store, remote.transport(), { account: 'rei@example.com', now: () => store.now(), timers: { set: () => 0, clear: () => {} } });
    return { store, sync: () => engine.syncNow() };
  }

  it('A 关联，B 离线时新加的库里任务，同步后也进项目；A 取消关联，B 那件也移出', async () => {
    const remote = new MemoryRemote();
    const A = await device(remote, 'devA');
    const B = await device(remote, 'devB');
    const P = group(A.store);
    const t1 = taskWith(A.store, MOVIE, '沙丘').task;
    await A.sync();
    await B.sync();
    A.store.setGroupLibraries(P.id, [MOVIE]);
    const t2 = taskWith(B.store, MOVIE, '花样年华').task; // B 还不知道关联
    expect(gid(B.store, t2.id)).toBeNull();
    await A.sync();
    await B.sync(); // B 拉到关联，拉完整理：t2 进项目
    expect(gid(B.store, t1.id)).toBe(P.id);
    expect(gid(B.store, t2.id)).toBe(P.id);
    await B.sync();
    await A.sync();
    expect(gid(A.store, t2.id)).toBe(P.id);
    A.store.setGroupLibraries(P.id, []);
    await A.sync();
    await B.sync();
    for (const s of [A.store, B.store]) {
      expect(gid(s, t1.id)).toBeNull();
      expect(gid(s, t2.id)).toBeNull();
      expect(s.get('task', t1.id)).toBeTruthy();
      expect(s.get('task', t2.id)).toBeTruthy();
    }
  });

  it('两台设备同时把同一个库关联到不同项目：后写的赢，任务最后都在赢的项目里，一件不少', async () => {
    const remote = new MemoryRemote();
    const A = await device(remote, 'devA');
    const B = await device(remote, 'devB');
    const P = group(A.store, 'P');
    const Q = group(A.store, 'Q');
    const ids = ['一', '二', '三'].map((n) => taskWith(A.store, MOVIE, n).task.id);
    await A.sync();
    await B.sync();
    A.store.setGroupLibraries(P.id, [MOVIE]);
    B.store.setGroupLibraries(Q.id, [MOVIE]); // B 的时钟晚一点，后写
    await A.sync();
    await B.sync();
    await A.sync();
    await B.sync();
    const win = A.store.libraryGroupId(MOVIE);
    expect(win).toBe(B.store.libraryGroupId(MOVIE));
    for (const s of [A.store, B.store]) for (const id of ids) expect(gid(s, id)).toBe(win);
  });
});
