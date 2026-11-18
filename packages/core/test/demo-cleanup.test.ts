import { describe, expect, it } from 'vitest';
import { Store, MemoryAdapter, seedDemo, clearOldDemoRows, demoBatchWrites, oldDemoRows, TABLES, type BaseRow } from '../src';

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

  it('不给 outbox 记录：改过的演示任务认不出来，留着（同步过的设备）', async () => {
    const { store, stamp } = await seeded();
    const withGroup = store.tasks().find((t) => t.group_id)!;
    store.updateTask(withGroup.id, { body_md: '我改过这件\n' });
    clearOldDemoRows(store, stamp);
    expect(store.get('task', withGroup.id)).toBeTruthy();
    expect(store.get('group', withGroup.group_id!)).toBeTruthy();
  });

  it('outbox 里还有当初那一笔：改过的演示任务也删，它的项目也删（Rei 2026-11-19「不要留」）', async () => {
    const { store, stamp } = await seeded();
    await store.flush();
    const withGroup = store.tasks().find((t) => t.group_id)!;
    store.updateTask(withGroup.id, { body_md: '我改过这件\n' });
    await store.flush();
    const batch = await demoBatchWrites(store, stamp);
    expect(batch.size).toBeGreaterThan(0);
    clearOldDemoRows(store, stamp, batch);
    expect(store.get('task', withGroup.id)).toBeFalsy();
    expect(store.get('group', withGroup.group_id!)).toBeFalsy();
    expect(store.tasks().length).toBe(0);
    expect(oldDemoRows(store, stamp, await demoBatchWrites(store, stamp))).toEqual([]);
  });

  it('在演示打卡上新打的卡、打卡存档出来的任务：跟着删', async () => {
    const { store, stamp } = await seeded();
    await store.flush();
    const habit = store.tasks().find((t) => t.completion_mode === 'count') ?? store.tasks().find((t) => t.recurrence)!;
    store.updateTask(habit.id, { body_md: '演示打卡\n\n今天的心得' });
    store.insert('check_in', { task_id: habit.id, period_key: '2026-11-02', kind: 'done', value: 1, note: '', at: new Date().toISOString() } as never);
    await store.flush();
    const batch = await demoBatchWrites(store, stamp);
    clearOldDemoRows(store, stamp, batch);
    expect(store.get('task', habit.id)).toBeFalsy();
    expect(store.list('check_in').filter((c) => (c as { task_id: string }).task_id === habit.id)).toEqual([]);
    expect(store.tasks().length).toBe(0);
  });

  it('演示建的类型不删，改成不显示', async () => {
    const { store, stamp } = await seeded();
    const before = store.categories().filter((c) => !c.hidden && store.categoryState(c.id) !== 'hidden').length;
    clearOldDemoRows(store, stamp);
    const after = store.categories().filter((c) => store.categoryState(c.id) !== 'hidden').length;
    expect(after).toBeLessThan(before);
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
