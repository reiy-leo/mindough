import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { SyncEngine } from '../src/sync/engine';
import { MemoryRemote } from '../src/sync/memory-remote';
import { groupIconFromPicker, groupIconName, normalizeGroupName } from '../src/group';
import { local } from './helpers';

async function open(adapter = new MemoryAdapter(), deviceId = 'dev1', t0 = local(2026, 11, 1, 9).getTime()) {
  let t = t0;
  const store = await Store.open(adapter, { deviceId, now: () => new Date(t) });
  return { store, adapter, advance: (ms: number) => (t += ms), now: () => t };
}

async function devices() {
  const remote = new MemoryRemote();
  const dev = async (id: string) => {
    const d = await open(new MemoryAdapter(), id);
    const engine = new SyncEngine(d.store, remote.transport(), { account: 'rei@example.com', now: () => new Date(d.now()), timers: { set: () => 0, clear: () => {} } });
    return { ...d, sync: () => engine.syncNow() };
  };
  return [await dev('devA'), await dev('devB')] as const;
}

const mk = (store: Store, name = '搬家', icon = '🏠') =>
  store.insert('group', { name, icon, start_at: null, end_at: null, category_id: null, default_type_id: null });

describe('项目图标的存法（group.ts）', () => {
  it('lucide 名加前缀，emoji 原样，空的给文件夹', () => {
    expect(groupIconFromPicker('briefcase')).toBe('lucide:briefcase');
    expect(groupIconFromPicker('gamepad-2')).toBe('lucide:gamepad-2');
    expect(groupIconFromPicker('lucide:star')).toBe('lucide:star');
    expect(groupIconFromPicker('🎬')).toBe('🎬');
    expect(groupIconFromPicker('  ')).toBe('📁');
    expect(groupIconFromPicker('lucide:Bad Name')).toBe('📁');
  });
  it('画图标前去掉前缀；老数据（emoji、空）照常', () => {
    expect(groupIconName('lucide:briefcase')).toBe('briefcase');
    expect(groupIconName('🏠')).toBe('🏠');
    expect(groupIconName('')).toBe('📁');
    expect(groupIconName(undefined)).toBe('📁');
  });
  it('名字去首尾空白、并空格；空名返回 null', () => {
    expect(normalizeGroupName('  新家   装修 ')).toBe('新家 装修');
    expect(normalizeGroupName('   ')).toBeNull();
  });
});

describe('改项目名字、图标（Rei 2026-11-01）', () => {
  it('改名、换 lucide 图标、换回 emoji', async () => {
    const { store } = await open();
    const g = mk(store);
    expect(store.updateGroup(g.id, { name: ' 新家 ' })!.name).toBe('新家');
    expect(store.updateGroup(g.id, { icon: 'home' })!.icon).toBe('lucide:home');
    expect(store.updateGroup(g.id, { icon: '🏡' })!.icon).toBe('🏡');
  });
  it('空名字不改；没变不写', async () => {
    const { store } = await open();
    const g = mk(store);
    const before = store.get('group', g.id)!.updated_at;
    expect(store.updateGroup(g.id, { name: '  ' })!.name).toBe('搬家');
    store.updateGroup(g.id, { name: '搬家', icon: '🏠' });
    expect(store.get('group', g.id)!.updated_at).toBe(before);
  });
  it('改名和图标同步到另一台设备（行级 LWW）', async () => {
    const [a, b] = await devices();
    const g = mk(a.store);
    await a.sync();
    await b.sync();
    a.advance(1000);
    a.store.updateGroup(g.id, { name: '新家', icon: 'home' });
    await a.sync();
    await b.sync();
    expect(b.store.get('group', g.id)).toMatchObject({ name: '新家', icon: 'lucide:home' });
  });
});

describe('解散项目', () => {
  it('项目没了，任务留着、移出项目；撤销放回来', async () => {
    const { store } = await open();
    const g = mk(store);
    const t1 = store.createTask({ body_md: '打包', group_id: g.id });
    const t2 = store.createTask({ body_md: '退租', group_id: g.id, scheduled_date: '2026-11-03' });
    const other = store.createTask({ body_md: '别的' });
    const r = store.dissolveGroup(g.id)!;
    expect(r.tasks).toBe(2);
    expect(store.get('group', g.id)).toBeUndefined();
    expect(store.raw('group', g.id)!.deleted).toBe(true);
    expect(store.get('task', t1.id)!.group_id).toBeNull();
    expect(store.get('task', t2.id)).toMatchObject({ group_id: null, scheduled_date: '2026-11-03' });
    expect(store.get('task', other.id)).toBeDefined();
    // 没日期的回到待安排
    expect(store.backlog('2026-11-01').map((t) => t.id)).toContain(t1.id);
    store.undoGroupRemoval(r.undo);
    expect(store.get('group', g.id)).toBeDefined();
    expect(store.groupTasks(g.id).map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort());
  });
  it('撤销时，期间被放进别的项目的任务不动', async () => {
    const { store } = await open();
    const g = mk(store);
    const h = mk(store, '装修');
    const t = store.createTask({ group_id: g.id });
    const r = store.dissolveGroup(g.id)!;
    store.updateTask(t.id, { group_id: h.id });
    store.undoGroupRemoval(r.undo);
    expect(store.get('task', t.id)!.group_id).toBe(h.id);
  });
  it('从侧边栏消失', async () => {
    const { store } = await open();
    const g = mk(store);
    store.setGroupInSidebar(g.id, true);
    const r = store.dissolveGroup(g.id)!;
    expect(store.sidebarGroups()).toEqual([]);
    store.undoGroupRemoval(r.undo);
    expect(store.sidebarGroups().map((x) => x.id)).toEqual([g.id]);
  });
});

describe('删除项目', () => {
  it('项目和里面的任务一起打墓碑，连同前后关系、我的一天；项目外的任务不动', async () => {
    const { store } = await open();
    const g = mk(store);
    const t1 = store.createTask({ body_md: '打包', group_id: g.id });
    const t2 = store.createTask({ body_md: '搬', group_id: g.id });
    const outside = store.createTask({ body_md: '告诉朋友新地址' });
    store.addDependency(t1.id, t2.id);
    store.addDependency(t2.id, outside.id);
    store.addToMyDay(t1.id, '2026-11-01');
    const r = store.deleteGroup(g.id)!;
    expect(r.tasks).toBe(2);
    expect(store.get('group', g.id)).toBeUndefined();
    expect(store.get('task', t1.id)).toBeUndefined();
    expect(store.get('task', t2.id)).toBeUndefined();
    expect(store.get('task', outside.id)).toBeDefined();
    expect(store.edges()).toEqual([]);
    expect(store.list('my_day').filter((m) => m.task_id === t1.id)).toEqual([]);
    // 每行只打一次墓碑（两件任务之间的那条边不重复）
    const keys = r.undo.kind === 'delete' ? r.undo.rows.map((x) => `${x.table}/${x.id}`) : [];
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('撤销：项目、任务、前后关系、我的一天都回来', async () => {
    const { store } = await open();
    const g = mk(store);
    const t1 = store.createTask({ group_id: g.id });
    const t2 = store.createTask({ group_id: g.id });
    store.addDependency(t1.id, t2.id);
    store.addToMyDay(t1.id, '2026-11-01');
    const r = store.deleteGroup(g.id)!;
    store.undoGroupRemoval(r.undo);
    expect(store.get('group', g.id)).toBeDefined();
    expect(store.groupTasks(g.id)).toHaveLength(2);
    expect(store.edges()).toHaveLength(1);
    expect(store.list('my_day').filter((m) => m.task_id === t1.id)).toHaveLength(1);
  });
  it('删除和解散都同步到另一台设备（墓碑）', async () => {
    const [a, b] = await devices();
    const del = mk(a.store, '删掉的');
    const dis = mk(a.store, '解散的');
    const td = a.store.createTask({ group_id: del.id });
    const tk = a.store.createTask({ group_id: dis.id });
    await a.sync();
    await b.sync();
    expect(b.store.get('task', td.id)).toBeDefined();
    a.advance(1000);
    a.store.deleteGroup(del.id);
    a.store.dissolveGroup(dis.id);
    await a.sync();
    await b.sync();
    expect(b.store.get('group', del.id)).toBeUndefined();
    expect(b.store.get('task', td.id)).toBeUndefined();
    expect(b.store.get('group', dis.id)).toBeUndefined();
    expect(b.store.get('task', tk.id)!.group_id).toBeNull();
  });
  it('找不到的项目返回 null，不写', async () => {
    const { store } = await open();
    expect(store.deleteGroup('nope')).toBeNull();
    expect(store.dissolveGroup('nope')).toBeNull();
  });
});
