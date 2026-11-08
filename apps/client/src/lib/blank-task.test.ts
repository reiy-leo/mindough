// @vitest-environment happy-dom
/** 打卡 / 倒数日页「新建」直接建空任务进详情（Rei 2026-11-09 01:31）。 */
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryAdapter, Store } from '@mindough/core';
import { createBlankTask, sweepBlankTasks, wantsBodyFocus } from './blank-task';

async function setup() {
  const store = await Store.open(new MemoryAdapter(), { now: () => new Date(2026, 10, 9, 9) });
  const opened: (string | null)[] = [];
  return { store, opened, open: (id: string | null) => opened.push(id) };
}
const alive = (store: Store, id: string) => !!store.get('task', id) && !store.get('task', id)!.deleted;

beforeEach(() => sessionStorage.clear());

describe('createBlankTask', () => {
  it('打卡：每天、计数、目标 2，正文空，选中并要光标', async () => {
    const { store, opened, open } = await setup();
    const t = createBlankTask(store, open, 'checkin', null);
    expect(t.recurrence).toContain('DAILY');
    expect(t.completion_mode).toBe('count');
    expect(t.target_value).toBe(2);
    expect(t.body_md).toBe('');
    expect(opened).toEqual([t.id]);
    expect(wantsBodyFocus(t.id)).toBe(true);
    expect(wantsBodyFocus('other')).toBe(false);
  });
  it('倒数日：目标日期空，带上筛选中的类型', async () => {
    const { store, open } = await setup();
    const c = store.createCategory('纪念日');
    const t = createBlankTask(store, open, 'countdown', c.id);
    expect(t.completion_mode).toBe('countdown');
    expect(t.target_date).toBeNull();
    expect(t.recurrence).toBeNull();
    expect(t.category_id).toBe(c.id);
  });
});

describe('sweepBlankTasks：正文空着离开就删', () => {
  it('还选着不删；离开且空着删掉', async () => {
    const { store, open } = await setup();
    const t = createBlankTask(store, open, 'checkin');
    expect(sweepBlankTasks(store, t.id)).toEqual([]);
    expect(alive(store, t.id)).toBe(true);
    expect(sweepBlankTasks(store, null)).toEqual([t.id]);
    expect(alive(store, t.id)).toBe(false);
  });
  it('写了字就留下，以后也不再管', async () => {
    const { store, open } = await setup();
    const t = createBlankTask(store, open, 'countdown');
    store.updateTask(t.id, { body_md: '生日' });
    expect(sweepBlankTasks(store, null)).toEqual([]);
    store.updateTask(t.id, { body_md: '' });
    expect(sweepBlankTasks(store, null)).toEqual([]);
    expect(alive(store, t.id)).toBe(true);
  });
  it('只有空白也算空；连建两条，切到第二条时删第一条', async () => {
    const { store, open } = await setup();
    const a = createBlankTask(store, open, 'checkin');
    store.updateTask(a.id, { body_md: '  \n' });
    const b = createBlankTask(store, open, 'checkin');
    expect(sweepBlankTasks(store, b.id)).toEqual([a.id]);
    expect(alive(store, b.id)).toBe(true);
  });
  it('别的任务不管', async () => {
    const { store } = await setup();
    const x = store.createTask({ body_md: '' });
    expect(sweepBlankTasks(store, null)).toEqual([]);
    expect(alive(store, x.id)).toBe(true);
  });
});
