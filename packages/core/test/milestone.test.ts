/**
 * 项目里程碑（Rei 2026-11-13，见 src/milestone.ts）：每个项目一张里程碑列表；任务最多一个里程碑，只在项目里能设；
 * 移出项目 / 换项目清掉；同项目不重名（忽略大小写、首尾空白）；归档不删；选择器的过滤和「新建」；
 * 迁移 v24、两台设备同步、老客户端推上来的行、导出导入、搜索、解散项目的撤销。
 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { SqlAdapter, migrate } from '../src/storage/sql';
import { SCHEMA_VERSION } from '../src/storage/schema';
import { SyncEngine } from '../src/sync/engine';
import { MemoryRemote } from '../src/sync/memory-remote';
import { cleanMilestoneName, milestoneNameKey, milestoneOptions, sortMilestones } from '../src/milestone';
import { exportArchive, fromUtf8, planImport, applyImport } from '../src/archive';
import { search } from '../src/search';
import { local } from './helpers';
import { NodeSqliteDriver } from './sql-drivers';
import type { Milestone } from '../src/types';

async function open(adapter: MemoryAdapter | SqlAdapter = new MemoryAdapter(), deviceId = 'dev1') {
  let t = local(2026, 11, 13, 9).getTime();
  return Store.open(adapter, { deviceId, now: () => new Date((t += 10)) });
}
const project = (store: Store, name = '装修') =>
  store.insert('group', { name, icon: '🏠', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto: true });
const ms = (id: string, name: string, extra: Partial<Milestone> = {}): Milestone => ({ id, name, group_id: 'g', sort: 0, archived_at: null, created_at: '2026-11-13T00:00:00.000Z', updated_at: '', deleted: false, ...extra });

describe('纯函数', () => {
  it('名字整理和重名键：首尾空白去掉、连续空白并一个，比较忽略大小写和全角', () => {
    expect(cleanMilestoneName('  第一期   设计 \n ')).toBe('第一期 设计');
    expect(cleanMilestoneName('   ')).toBeNull();
    expect(milestoneNameKey(' Beta ')).toBe(milestoneNameKey('beta'));
    expect(milestoneNameKey('ＢＥＴＡ')).toBe('beta');
  });

  it('按 sort 排，一样时先建的在前', () => {
    const list = [ms('b', 'B', { sort: 2 }), ms('a', 'A', { sort: 1 }), ms('c', 'C', { sort: 1, created_at: '2026-11-14T00:00:00.000Z' })];
    expect(sortMilestones(list).map((m) => m.id)).toEqual(['a', 'c', 'b']);
  });

  it('选择器：不搜时列没归档的；搜时过滤，没有完全同名的最后给「新建」', () => {
    const list = [ms('a', '设计', { sort: 1 }), ms('b', '施工', { sort: 2 }), ms('c', '验收', { sort: 3, archived_at: '2026-11-13T00:00:00.000Z' }), ms('d', '删了', { deleted: true })];
    expect(milestoneOptions(list, '').map((o) => (o.kind === 'milestone' ? o.milestone.id : 'new'))).toEqual(['a', 'b']);
    // 现在挂着的归档里程碑也列上
    expect(milestoneOptions(list, '', 'c').map((o) => (o.kind === 'milestone' ? o.milestone.id : 'new'))).toEqual(['a', 'b', 'c']);
    const hits = milestoneOptions(list, '施');
    expect(hits.map((o) => (o.kind === 'milestone' ? o.milestone.id : `new:${o.name}`))).toEqual(['b', 'new:施']);
    // 完全同名（忽略大小写、首尾空白）就不给新建
    expect(milestoneOptions(list, ' 施工 ').some((o) => o.kind === 'create')).toBe(false);
    // 拼音首字母
    expect(milestoneOptions(list, 'sg').some((o) => o.kind === 'milestone' && o.milestone.id === 'b')).toBe(true);
    // 归档的同名：给「新建」（选了就是取消归档）
    expect(milestoneOptions(list, '验收').map((o) => o.kind)).toEqual(['create']);
  });
});

describe('Store：建、改名、归档、设到任务上', () => {
  it('每个项目各自一张列表；同名不重复建，归档的同名取消归档', async () => {
    const store = await open();
    const A = project(store, '装修');
    const B = project(store, '搬家');
    const a1 = store.createMilestone(A.id, ' 设计 ')!;
    const a2 = store.createMilestone(A.id, '施工')!;
    const b1 = store.createMilestone(B.id, '设计')!;
    expect(a1.name).toBe('设计');
    expect(store.milestones(A.id).map((m) => m.id)).toEqual([a1.id, a2.id]);
    expect(store.milestones(B.id).map((m) => m.id)).toEqual([b1.id]);
    expect(store.createMilestone(A.id, '设计 ')!.id).toBe(a1.id);
    expect(store.createMilestone(A.id, '   ')).toBeUndefined();
    expect(store.createMilestone('nope', 'x')).toBeUndefined();
    store.setMilestoneArchived(a1.id, true);
    expect(store.milestones(A.id).map((m) => m.id)).toEqual([a2.id]);
    expect(store.milestones(A.id, true).map((m) => m.id)).toEqual([a1.id, a2.id]);
    const again = store.createMilestone(A.id, '设计')!;
    expect(again.id).toBe(a1.id);
    expect(again.archived_at).toBeNull();
  });

  it('改名：空的、同项目重名的不改；别的项目同名可以', async () => {
    const store = await open();
    const A = project(store);
    const B = project(store, '搬家');
    const a1 = store.createMilestone(A.id, '设计')!;
    store.createMilestone(A.id, '施工');
    store.createMilestone(B.id, '验收');
    expect(store.renameMilestone(a1.id, ' ')).toBe('empty');
    expect(store.renameMilestone(a1.id, 'SHI工'.replace('SHI', '施'))).toBe('duplicate');
    expect(store.renameMilestone(a1.id, '验收')).toBe('ok');
    expect(store.get('milestone', a1.id)!.name).toBe('验收');
    expect(store.renameMilestone('nope', 'x')).toBe('missing');
  });

  it('只有项目里的任务能设，里程碑要是这个项目的', async () => {
    const store = await open();
    const A = project(store);
    const B = project(store, '搬家');
    const a1 = store.createMilestone(A.id, '设计')!;
    const b1 = store.createMilestone(B.id, '打包')!;
    const loose = store.createTask({ body_md: '散的' });
    const t = store.createTask({ body_md: '量尺寸', group_id: A.id });
    expect(store.setTaskMilestone(loose.id, a1.id)).toBe(false);
    expect(store.setTaskMilestone(t.id, b1.id)).toBe(false);
    expect(store.get('task', t.id)!.milestone_id).toBeNull();
    expect(store.setTaskMilestone(t.id, a1.id)).toBe(true);
    expect(store.milestoneOf(store.get('task', t.id))?.id).toBe(a1.id);
    expect(store.setTaskMilestone(t.id, null)).toBe(true);
    expect(store.get('task', t.id)!.milestone_id).toBeNull();
  });

  it('移出项目、换项目：里程碑清掉（换回来也不恢复）；归档里程碑照常挂着', async () => {
    const store = await open();
    const A = project(store);
    const B = project(store, '搬家');
    const a1 = store.createMilestone(A.id, '设计')!;
    const t = store.createTask({ body_md: '量尺寸', group_id: A.id });
    store.setTaskMilestone(t.id, a1.id);
    store.setMilestoneArchived(a1.id, true);
    expect(store.milestoneOf(store.get('task', t.id))?.id).toBe(a1.id);
    store.updateTask(t.id, { group_id: B.id });
    expect(store.get('task', t.id)!.milestone_id).toBeNull();
    store.updateTask(t.id, { group_id: A.id });
    expect(store.get('task', t.id)!.milestone_id).toBeNull();
    store.setTaskMilestone(t.id, a1.id);
    store.updateTask(t.id, { group_id: null });
    expect(store.get('task', t.id)!.milestone_id).toBeNull();
    // 直接写别的项目的里程碑也写不进去
    store.updateTask(t.id, { group_id: B.id, milestone_id: a1.id });
    expect(store.get('task', t.id)!.milestone_id).toBeNull();
  });

  it('解散项目清掉里程碑，撤销后连里程碑一起放回', async () => {
    const store = await open();
    const A = project(store);
    const a1 = store.createMilestone(A.id, '设计')!;
    const t = store.createTask({ body_md: '量尺寸', group_id: A.id });
    store.setTaskMilestone(t.id, a1.id);
    const r = store.dissolveGroup(A.id)!;
    expect(store.get('task', t.id)!.milestone_id).toBeNull();
    store.undoGroupRemoval(r.undo);
    expect(store.get('task', t.id)!.group_id).toBe(A.id);
    expect(store.get('task', t.id)!.milestone_id).toBe(a1.id);
  });

  it('新建任务可以直接带里程碑', async () => {
    const store = await open();
    const A = project(store);
    const a1 = store.createMilestone(A.id, '设计')!;
    expect(store.createTask({ body_md: 'x', group_id: A.id, milestone_id: a1.id }).milestone_id).toBe(a1.id);
    expect(store.createTask({ body_md: 'y', milestone_id: a1.id }).milestone_id).toBeNull();
  });
});

describe('迁移、同步、老客户端', () => {
  it(`SQLite：迁移到 v${SCHEMA_VERSION}，milestone 表和 task.milestone_id 存得下、读得回`, async () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(24);
    const driver = new NodeSqliteDriver();
    await migrate(driver);
    const store = await open(new SqlAdapter(driver));
    const A = project(store);
    const a1 = store.createMilestone(A.id, '设计')!;
    store.setMilestoneArchived(a1.id, true);
    const t = store.createTask({ body_md: '量尺寸', group_id: A.id, milestone_id: a1.id });
    await store.flush();
    const again = await open(new SqlAdapter(driver));
    expect(again.get('task', t.id)!.milestone_id).toBe(a1.id);
    expect(again.get('milestone', a1.id)).toMatchObject({ name: '设计', group_id: A.id });
    expect(again.get('milestone', a1.id)!.archived_at).not.toBeNull();
  });

  it('老库打开：任务没有 milestone_id 当没设', async () => {
    const adapter = new MemoryAdapter();
    const s1 = await open(adapter);
    const t = s1.createTask({ body_md: 'x' });
    await s1.flush();
    const raw = (await adapter.loadAll()).task.find((r) => r.id === t.id)! as unknown as Record<string, unknown>;
    delete raw.milestone_id;
    const s2 = await open(adapter);
    expect(s2.get('task', t.id)!.milestone_id ?? null).toBeNull();
  });

  it('两台设备：A 建里程碑、设到任务上，B 同步后看到；B 换项目清掉，A 也清掉', async () => {
    const remote = new MemoryRemote();
    const dev = async (id: string) => {
      const store = await open(new MemoryAdapter(), id);
      const engine = new SyncEngine(store, remote.transport(), { account: 'rei@example.com', now: () => store.now(), timers: { set: () => 0, clear: () => {} } });
      return { store, sync: () => engine.syncNow() };
    };
    const A = await dev('devA');
    const B = await dev('devB');
    const P = project(A.store);
    const Q = project(A.store, '搬家');
    const m = A.store.createMilestone(P.id, '设计')!;
    const t = A.store.createTask({ body_md: '量尺寸', group_id: P.id });
    A.store.setTaskMilestone(t.id, m.id);
    await A.sync();
    await B.sync();
    expect(B.store.milestones(P.id).map((x) => x.name)).toEqual(['设计']);
    expect(B.store.milestoneOf(B.store.get('task', t.id))?.id).toBe(m.id);
    B.store.updateTask(t.id, { group_id: Q.id });
    await B.sync();
    await A.sync();
    expect(A.store.get('task', t.id)!.group_id).toBe(Q.id);
    expect(A.store.get('task', t.id)!.milestone_id).toBeNull();
  });

  it('老客户端推上来的任务行没有 milestone_id：项目没变沿用本机，项目变了清掉', async () => {
    const store = await open();
    const A = project(store);
    const B = project(store, '搬家');
    const m = store.createMilestone(A.id, '设计')!;
    const t = store.createTask({ body_md: '量尺寸', group_id: A.id, milestone_id: m.id });
    const old = { ...store.get('task', t.id)!, body_md: '量尺寸（老客户端）', updated_at: '9999999999990-0000-old' } as Record<string, unknown>;
    delete old.milestone_id;
    store.applyRemote([{ table: 'task', row: old }] as never);
    expect(store.get('task', t.id)!.body_md).toBe('量尺寸（老客户端）');
    expect(store.get('task', t.id)!.milestone_id).toBe(m.id);
    const moved = { ...store.get('task', t.id)!, group_id: B.id, updated_at: '9999999999991-0000-old' } as Record<string, unknown>;
    delete moved.milestone_id;
    store.applyRemote([{ table: 'task', row: moved }] as never);
    expect(store.get('task', t.id)!.milestone_id).toBeNull();
  });

  it('同步来的行里程碑和项目对不上（并发改）：显示当没有', async () => {
    const store = await open();
    const A = project(store);
    const B = project(store, '搬家');
    const m = store.createMilestone(A.id, '设计')!;
    const t = store.createTask({ body_md: 'x', group_id: A.id });
    store.applyRemote([{ table: 'task', row: { ...store.get('task', t.id)!, group_id: B.id, milestone_id: m.id, updated_at: '9999999999990-0000-zzz' } }]);
    expect(store.milestoneOf(store.get('task', t.id))).toBeUndefined();
  });
});

describe('导出导入、搜索', () => {
  it('导出带 _meta/milestones.json 和任务的 milestone，导入到新库接回', async () => {
    const store = await open();
    const A = project(store);
    const m = store.createMilestone(A.id, '设计')!;
    const arch = store.createMilestone(A.id, '旧里程碑')!;
    store.setMilestoneArchived(arch.id, true);
    const t = store.createTask({ body_md: '量尺寸', group_id: A.id, milestone_id: m.id });
    const { files } = exportArchive(store);
    expect(files.some((f) => f.path === '_meta/milestones.json')).toBe(true);
    expect(files.some((f) => f.path.endsWith('.md') && fromUtf8(f.data).includes(`milestone: ${m.id}`))).toBe(true);
    const dst = await open(new MemoryAdapter(), 'dev2');
    applyImport(dst, planImport(dst, files));
    expect(dst.get('task', t.id)!.milestone_id).toBe(m.id);
    expect(dst.milestones(A.id, true).map((x) => x.name)).toEqual(['设计', '旧里程碑']);
    expect(dst.get('milestone', arch.id)!.archived_at).not.toBeNull();
  });

  it('搜索：里程碑名字能搜到任务', async () => {
    const store = await open();
    const A = project(store);
    const m = store.createMilestone(A.id, '水电改造')!;
    const t = store.createTask({ body_md: '买线管', group_id: A.id, milestone_id: m.id });
    const hits = search({ tasks: store.tasks(), types: [], people: [], groups: store.list('group'), taskPeople: [], milestones: store.list('milestone') }, '水电');
    expect(hits.some((h) => h.kind === 'task' && h.id === t.id)).toBe(true);
  });
});
