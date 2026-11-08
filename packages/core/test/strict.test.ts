/** 严格模式（Rei 2026-11-08「严格模式开启后完成的任务不能修改」，23:38「完成和关闭的任务都锁」）：Store 层的保护。 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { StrictModeError, violatesStrict } from '../src/strict';
import { local } from './helpers';

async function open() {
  const store = await Store.open(new MemoryAdapter(), { deviceId: 'dev1', now: () => local(2026, 11, 8, 9) });
  const done = store.createTask({ body_md: '做完的', scheduled_date: '2026-11-08' }, { joinMyDay: false });
  const other = store.createTask({ body_md: '别的' }, { joinMyDay: false });
  store.completeTask(done.id);
  store.strictDone = true;
  return { store, done: store.get('task', done.id)!, other };
}

describe('严格模式', () => {
  it('关着时照常能改', async () => {
    const { store, done } = await open();
    store.strictDone = false;
    store.updateTask(done.id, { body_md: '改了' });
    expect(store.get('task', done.id)!.body_md).toBe('改了');
  });

  it('完成的任务：正文、日期、置顶、我的一天、关系、类型、打卡都不能改', async () => {
    const { store, done, other } = await open();
    expect(store.isLocked(done.id)).toBe(true);
    const before = store.get('task', done.id)!;
    expect(() => store.updateTask(done.id, { body_md: '改了' })).toThrow(StrictModeError);
    expect(() => store.updateTask(done.id, { scheduled_date: '2026-11-09' })).toThrow(StrictModeError);
    expect(() => store.pinTask(done.id)).toThrow(StrictModeError);
    expect(() => store.addToMyDay(done.id)).toThrow(StrictModeError);
    expect(() => store.addDependency(done.id, other.id)).toThrow(StrictModeError);
    expect(() => store.addDependency(other.id, done.id)).toThrow(StrictModeError);
    expect(() => store.linkTasks(done.id, other.id)).toThrow(StrictModeError);
    expect(() => store.checkIn(done.id, 'done')).toThrow(StrictModeError);
    const cat = store.categories()[0]!;
    expect(() => store.addTaskCategory(done.id, cat.id)).toThrow(StrictModeError);
    expect(store.get('task', done.id)).toEqual(before);
    expect(store.edges()).toHaveLength(0);
  });

  it('没结束的任务不受影响', async () => {
    const { store, other } = await open();
    store.updateTask(other.id, { body_md: '改了' });
    expect(store.isLocked(other.id)).toBe(false);
    expect(store.get('task', other.id)!.body_md).toBe('改了');
  });

  it('关闭的任务也锁（Rei 23:38「完成和关闭的任务都锁」）：正文、日期、置顶、我的一天、关系、类型、计数都不能改', async () => {
    const { store, other, done } = await open();
    store.closeTask(other.id);
    expect(store.isLocked(other.id)).toBe(true);
    const before = store.get('task', other.id)!;
    expect(() => store.updateTask(other.id, { body_md: '关了还想改' })).toThrow(StrictModeError);
    expect(() => store.updateTask(other.id, { scheduled_date: '2026-11-09' })).toThrow(StrictModeError);
    expect(() => store.pinTask(other.id)).toThrow(StrictModeError);
    expect(() => store.addToMyDay(other.id)).toThrow(StrictModeError);
    expect(() => store.linkTasks(other.id, done.id)).toThrow(StrictModeError);
    const fresh = store.createTask({ body_md: '新的' }, { joinMyDay: false });
    expect(() => store.addDependency(other.id, fresh.id)).toThrow(StrictModeError);
    expect(() => store.addDependency(fresh.id, other.id)).toThrow(StrictModeError);
    expect(() => store.checkIn(other.id, 'done')).toThrow(StrictModeError);
    expect(() => store.addTaskCategory(other.id, store.categories()[0]!.id)).toThrow(StrictModeError);
    expect(store.get('task', other.id)).toEqual(before);
  });

  it('完成和关闭不能互换（算改），关闭的能重新打开、能删除', async () => {
    const { store, done, other } = await open();
    expect(() => store.closeTask(done.id)).toThrow(StrictModeError);
    expect(store.get('task', done.id)!.status).toBe('完成');
    store.closeTask(other.id);
    expect(() => store.updateTask(other.id, { status: '完成' })).toThrow(StrictModeError);
    store.reopenTask(other.id);
    expect(store.isLocked(other.id)).toBe(false);
    store.updateTask(other.id, { body_md: '又能改了' });
    expect(store.get('task', other.id)!.body_md).toBe('又能改了');
    store.closeTask(other.id);
    store.deleteTask(other.id);
    expect(store.get('task', other.id)).toBeUndefined();
  });

  it('能重新打开，打开后又能改', async () => {
    const { store, done } = await open();
    store.reopenTask(done.id);
    expect(store.isLocked(done.id)).toBe(false);
    store.updateTask(done.id, { body_md: '改了' });
    expect(store.get('task', done.id)!.body_md).toBe('改了');
  });

  it('能删除，连带的关系墓碑一起放行', async () => {
    const { store, done, other } = await open();
    store.strictDone = false;
    store.addDependency(done.id, other.id);
    store.strictDone = true;
    store.deleteTask(done.id);
    expect(store.get('task', done.id)).toBeUndefined();
    expect(store.edges()).toHaveLength(0);
  });

  it('同步拉下来的行不拦', async () => {
    const { store, done } = await open();
    const row = { ...store.get('task', done.id)!, body_md: '别的设备改的', updated_at: 'zzzz' };
    store.applyRemote([{ table: 'task', row }]);
    expect(store.get('task', done.id)!.body_md).toBe('别的设备改的');
  });

  it('violatesStrict：附件按 owner 算', () => {
    const locked = (id: string) => id === 't1';
    expect(violatesStrict([{ table: 'attachment', row: { id: 'a', updated_at: '', deleted: false, owner_type: 'task', owner_id: 't1' } as never }], locked)).toBe(true);
    expect(violatesStrict([{ table: 'attachment', row: { id: 'a', updated_at: '', deleted: false, owner_type: 'journal', owner_id: 't1' } as never }], locked)).toBe(false);
  });
});
