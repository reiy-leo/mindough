import { describe, expect, it } from 'vitest';
import { Store, MemoryAdapter, seedDemo, clearOldDemoRows, oldDemoRows, TABLES, type BaseRow } from '../src';

async function seeded() {
  let t = Date.parse('2026-11-01T08:00:00Z');
  const store = await Store.open(new MemoryAdapter(), { deviceId: 'devA', now: () => new Date(t) });
  seedDemo(store);
  let stamp = '';
  for (const tb of TABLES) for (const r of store.listAll(tb) as BaseRow[]) if (r.updated_at > stamp) stamp = r.updated_at;
  t += 60 * 60 * 1000;
  return { store, stamp, later: () => (t += 1000) };
}

describe('清除旧演示数据', () => {
  it('没有 demo_stamp 就什么都不删', async () => {
    const { store } = await seeded();
    expect(oldDemoRows(store, '')).toEqual([]);
    expect(oldDemoRows(store, null)).toEqual([]);
  });

  it('没动过的演示行全删，类型留着，删完再查是空的', async () => {
    const { store, stamp } = await seeded();
    const before = store.tasks().length;
    expect(before).toBeGreaterThan(0);
    const n = clearOldDemoRows(store, stamp);
    expect(n).toBeGreaterThan(before);
    expect(store.tasks().length).toBe(0);
    expect(store.list('person').length).toBe(0);
    expect(store.categories().length).toBeGreaterThan(0);
    expect(oldDemoRows(store, stamp)).toEqual([]);
  });

  it('改过的演示任务留着，它挂着的演示行也留着', async () => {
    const { store, stamp } = await seeded();
    const withGroup = store.tasks().find((t) => t.group_id)!;
    store.updateTask(withGroup.id, { body_md: '我改过这件\n' });
    clearOldDemoRows(store, stamp);
    expect(store.get('task', withGroup.id)).toBeTruthy();
    expect(store.get('group', withGroup.group_id!)).toBeTruthy();
  });

  it('自己新建的任务挂着演示人物：人物留着', async () => {
    const { store, stamp } = await seeded();
    const person = store.list('person')[0]!;
    const mine = store.createTask({ body_md: '给妈妈打电话' });
    store.insert('task_person', { task_id: mine.id, person_id: person.id } as never);
    clearOldDemoRows(store, stamp);
    expect(store.get('task', mine.id)).toBeTruthy();
    expect(store.get('person', person.id)).toBeTruthy();
  });

  it('别的设备写的行（时间再早）也不动', async () => {
    const { store, stamp } = await seeded();
    const remote = { id: 'remote-task-1', updated_at: '0001761984000000-0000-devB', deleted: false } as BaseRow;
    const sample = store.tasks()[0]!;
    store.applyRemote([{ table: 'task', row: { ...sample, ...remote, body_md: '别的设备\n' } as never }]);
    clearOldDemoRows(store, stamp);
    expect(store.get('task', 'remote-task-1')).toBeTruthy();
  });

  it('删除进 outbox（登录了会同步删除）', async () => {
    const { store, stamp } = await seeded();
    await store.flush();
    const before = (await store.adapter.pendingOutbox(1e6)).length;
    const n = clearOldDemoRows(store, stamp);
    await store.flush();
    const after = (await store.adapter.pendingOutbox(1e6)).length;
    expect(after - before).toBeGreaterThan(0);
    expect(n).toBeGreaterThan(0);
  });
});
