import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { SyncEngine } from '../src/sync/engine';
import { MemoryRemote } from '../src/sync/memory-remote';
import { BUILTIN_TYPE_IDS as T } from '../src/seed/builtin-types';
import {
  GROUP_SIDEBAR_ORDER_PREF,
  GROUP_SIDEBAR_PREF,
  LIBRARY_SIDEBAR_PREF,
  LIBRARY_SIDEBAR_ORDER_PREF,
  moveInList,
  nextSidebarOrder,
  orderBySidebar,
  withSidebarLibrary,
} from '../src/library';
import { local } from './helpers';

async function open(adapter = new MemoryAdapter(), deviceId = 'dev1', t0 = local(2026, 11, 10, 12).getTime()) {
  let t = t0;
  const store = await Store.open(adapter, { deviceId, now: () => new Date(t) });
  return { store, adapter, advance: (ms: number) => (t += ms), now: () => t };
}

const mk = (store: Store, name: string) =>
  store.insert('group', { name, icon: '📁', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto: true });

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('侧边栏置顶项拖动排序：纯函数（Rei 2026-11-10）', () => {
  const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }));

  it('没排过按原顺序；排过的在前、没排到的按原顺序接后面；坏值丢掉', () => {
    expect(ids(orderBySidebar(items, undefined))).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(orderBySidebar(items, []))).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(orderBySidebar(items, ['c', 'a']))).toEqual(['c', 'a', 'b', 'd']);
    expect(ids(orderBySidebar(items, ['x', 'd', 3, 'd', 'b']))).toEqual(['d', 'b', 'a', 'c']);
    expect(ids(orderBySidebar(items, 'oops'))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('没排到的按放进侧边栏的先后排（新放进来的最后）', () => {
    expect(ids(orderBySidebar(items, ['c'], ['c', 'd', 'a', 'b']))).toEqual(['c', 'd', 'a', 'b']);
    // 没排过：不看放进来的先后，原样
    expect(ids(orderBySidebar(items, [], ['d', 'c', 'b', 'a']))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('写回顺序：看得见的在前，原来顺序里看不见的留在后面，去重', () => {
    expect(nextSidebarOrder(['b', 'a'], undefined)).toEqual(['b', 'a']);
    expect(nextSidebarOrder(['b', 'a'], ['a', 'z', 'b'])).toEqual(['b', 'a', 'z']);
    expect(nextSidebarOrder(['a', 'a', ''], ['a'])).toEqual(['a']);
  });

  it('moveInList：往前、往后、越界夹住、不在的不动', () => {
    expect(moveInList(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(moveInList(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
    expect(moveInList(['a', 'b', 'c'], 'a', 99)).toEqual(['b', 'c', 'a']);
    expect(moveInList(['a', 'b', 'c'], 'b', -5)).toEqual(['b', 'a', 'c']);
    expect(moveInList(['a', 'b'], 'x', 0)).toEqual(['a', 'b']);
  });
});

describe('侧边栏里的项目拖动排序', () => {
  it('升级后没拖过跟项目页顺序一样；放进来按先后排；拖完按新顺序', async () => {
    const { store } = await open();
    const a = mk(store, 'A');
    const b = mk(store, 'B');
    const c = mk(store, 'C');
    store.setPref(GROUP_SIDEBAR_PREF, [c.id, b.id, a.id]); // 老数据
    const pageOrder = store.list('group').map((g) => g.id);
    expect(ids(store.sidebarGroups())).toEqual(pageOrder);
    store.reorderSidebarGroups([c.id, a.id, b.id]);
    expect(ids(store.sidebarGroups())).toEqual([c.id, a.id, b.id]);
    expect(store.pref(GROUP_SIDEBAR_ORDER_PREF)).toEqual([c.id, a.id, b.id]);
  });

  it('新放进来的排最后：第一次放不写排序，第二次起先记下眼下顺序', async () => {
    const { store } = await open();
    const [a, b, c] = ['A', 'B', 'C'].map((n) => mk(store, n));
    store.setGroupInSidebar(c!.id, true);
    expect(store.pref(GROUP_SIDEBAR_ORDER_PREF)).toBeUndefined();
    store.setGroupInSidebar(a!.id, true);
    store.setGroupInSidebar(b!.id, true);
    expect(ids(store.sidebarGroups())).toEqual([c!.id, a!.id, b!.id]);
  });

  it('不改项目行、不改 group.sidebar；同样的顺序再写不产生改动', async () => {
    const { store } = await open();
    const a = mk(store, 'A');
    const b = mk(store, 'B');
    store.setGroupInSidebar(a.id, true);
    store.setGroupInSidebar(b.id, true);
    const before = store.get('group', a.id)!.updated_at;
    const pinned = store.pref(GROUP_SIDEBAR_PREF);
    store.reorderSidebarGroups([b.id, a.id]);
    expect(store.get('group', a.id)!.updated_at).toBe(before);
    expect(store.pref(GROUP_SIDEBAR_PREF)).toEqual(pinned);
    const v = store.version;
    store.reorderSidebarGroups([b.id, a.id]);
    expect(store.version).toBe(v);
  });

  it('新放进侧边栏的排最后；取消再放回也排最后', async () => {
    const { store } = await open();
    const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((n) => mk(store, n));
    for (const g of [a!, b!, c!]) store.setGroupInSidebar(g.id, true);
    store.reorderSidebarGroups([c!.id, b!.id, a!.id]);
    store.setGroupInSidebar(d!.id, true);
    expect(ids(store.sidebarGroups())).toEqual([c!.id, b!.id, a!.id, d!.id]);
    store.setGroupInSidebar(c!.id, false);
    expect(store.pref(GROUP_SIDEBAR_ORDER_PREF)).toEqual([b!.id, a!.id]);
    store.setGroupInSidebar(c!.id, true);
    expect(ids(store.sidebarGroups())).toEqual([b!.id, a!.id, d!.id, c!.id]);
  });

  it('没在侧边栏的 id 写不进顺序；删掉的项目不出现', async () => {
    const { store } = await open();
    const a = mk(store, 'A');
    const b = mk(store, 'B');
    const x = mk(store, 'X');
    store.setGroupInSidebar(a.id, true);
    store.setGroupInSidebar(b.id, true);
    store.reorderSidebarGroups([x.id, b.id, a.id, 'nope']);
    expect(store.pref(GROUP_SIDEBAR_ORDER_PREF)).toEqual([b.id, a.id]);
    store.remove('group', b.id);
    expect(ids(store.sidebarGroups())).toEqual([a.id]);
  });

  it('归档的置顶项目不显示，拖别的时位置留着，取消归档回到原来那一带', async () => {
    const { store } = await open();
    const [a, b, c] = ['A', 'B', 'C'].map((n) => mk(store, n));
    for (const g of [a!, b!, c!]) store.setGroupInSidebar(g.id, true);
    store.reorderSidebarGroups([b!.id, a!.id, c!.id]);
    store.archiveGroup(a!.id);
    expect(ids(store.sidebarGroups())).toEqual([b!.id, c!.id]);
    store.reorderSidebarGroups([c!.id, b!.id]);
    expect(store.pref(GROUP_SIDEBAR_ORDER_PREF)).toEqual([c!.id, b!.id, a!.id]);
    store.unarchiveGroup(a!.id);
    expect(ids(store.sidebarGroups())).toEqual([c!.id, b!.id, a!.id]);
  });

  it('老客户端开关 group.sidebar（不认识排序偏好）：顺序照旧，新加的排最后', async () => {
    const { store } = await open();
    const a = mk(store, 'A');
    const b = mk(store, 'B');
    const c = mk(store, 'C');
    store.setGroupInSidebar(a.id, true);
    store.setGroupInSidebar(b.id, true);
    store.reorderSidebarGroups([b.id, a.id]);
    // 老客户端：只按 withSidebarLibrary 改 group.sidebar
    store.setPref(GROUP_SIDEBAR_PREF, withSidebarLibrary(store.pref(GROUP_SIDEBAR_PREF) as string[], c.id, true));
    expect(ids(store.sidebarGroups())).toEqual([b.id, a.id, c.id]);
    store.setPref(GROUP_SIDEBAR_PREF, withSidebarLibrary(store.pref(GROUP_SIDEBAR_PREF) as string[], b.id, false));
    expect(ids(store.sidebarGroups())).toEqual([a.id, c.id]);
  });

  it('顺序同步到别的设备；两台都拖，后拖的赢', async () => {
    const remote = new MemoryRemote();
    const t0 = local(2026, 11, 10, 12).getTime();
    const dev = async (id: string) => {
      const d = await open(new MemoryAdapter(), id, t0);
      const engine = new SyncEngine(d.store, remote.transport(), { account: 'rei@example.com', now: () => new Date(d.now()), timers: { set: () => 0, clear: () => {} } });
      return { ...d, sync: () => engine.syncNow() };
    };
    const A = await dev('devA');
    const B = await dev('devB');
    const [a, b, c] = ['A', 'B', 'C'].map((n) => mk(A.store, n));
    for (const g of [a!, b!, c!]) A.store.setGroupInSidebar(g.id, true);
    await A.sync();
    await B.sync();
    expect(ids(B.store.sidebarGroups())).toEqual(ids(A.store.sidebarGroups()));

    A.advance(1000);
    A.store.reorderSidebarGroups([c!.id, a!.id, b!.id]);
    await A.sync();
    await B.sync();
    expect(ids(B.store.sidebarGroups())).toEqual([c!.id, a!.id, b!.id]);

    // 同时拖：A 先、B 后（时间更晚），B 赢
    A.advance(1000);
    A.store.reorderSidebarGroups([a!.id, b!.id, c!.id]);
    B.advance(5000);
    B.store.reorderSidebarGroups([b!.id, c!.id, a!.id]);
    await A.sync();
    await B.sync();
    await A.sync();
    expect(ids(A.store.sidebarGroups())).toEqual([b!.id, c!.id, a!.id]);
    expect(ids(B.store.sidebarGroups())).toEqual([b!.id, c!.id, a!.id]);
  });
});

describe('侧边栏里的资料库拖动排序', () => {
  it('没拖过按资料库顺序；拖完按新顺序；新放进来的排最后', async () => {
    const { store } = await open();
    store.setPref(LIBRARY_SIDEBAR_PREF, [T.movie, T.game]); // 升级前的数据
    const typeOrder = store.orderedTypes().map((t) => t.id).filter((id) => id === T.game || id === T.movie);
    expect(ids(store.sidebarLibraries())).toEqual(typeOrder);
    const flipped = [...typeOrder].reverse();
    store.reorderSidebarLibraries(flipped);
    expect(ids(store.sidebarLibraries())).toEqual(flipped);
    expect(store.pref(LIBRARY_SIDEBAR_ORDER_PREF)).toEqual(flipped);
    store.setLibraryInSidebar(T.book, true);
    expect(ids(store.sidebarLibraries())).toEqual([...flipped, T.book]);
    store.setLibraryInSidebar(flipped[0]!, false);
    expect(store.pref(LIBRARY_SIDEBAR_ORDER_PREF)).toEqual([flipped[1]]);
  });

  it('跟项目的顺序各管各的；同步到别的设备', async () => {
    const remote = new MemoryRemote();
    const t0 = local(2026, 11, 10, 12).getTime();
    const dev = async (id: string) => {
      const d = await open(new MemoryAdapter(), id, t0);
      const engine = new SyncEngine(d.store, remote.transport(), { account: 'rei@example.com', now: () => new Date(d.now()), timers: { set: () => 0, clear: () => {} } });
      return { ...d, sync: () => engine.syncNow() };
    };
    const A = await dev('devA');
    const B = await dev('devB');
    A.store.setLibraryInSidebar(T.game, true);
    A.store.setLibraryInSidebar(T.movie, true);
    A.advance(1000);
    const want = [...ids(A.store.sidebarLibraries())].reverse();
    A.store.reorderSidebarLibraries(want);
    expect(A.store.pref(GROUP_SIDEBAR_ORDER_PREF)).toBeUndefined();
    await A.sync();
    await B.sync();
    expect(ids(B.store.sidebarLibraries())).toEqual(want);
  });
});
