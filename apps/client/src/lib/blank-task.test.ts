// @vitest-environment happy-dom
/** 打卡 / 倒数日页「新建」直接建空任务进详情（Rei 2026-11-09 01:31）。 */
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryAdapter, Store } from '@mindough/core';
import { createBlankTask, createDateDraftTask, sweepBlankTasks, wantsBodyFocus } from './blank-task';

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

describe('createDateDraftTask：日历「+」（Rei 2026-11-12 06:52）', () => {
  it('日期是那天、正文空、选中并要光标；是草稿，不进同步', async () => {
    const { store, opened, open } = await setup();
    const pushed: string[] = [];
    store.onLocalWrite((cs) => pushed.push(...cs.map((c) => c.row.id)));
    const t = createDateDraftTask(store, open, '2026-11-20');
    expect(t.scheduled_date).toBe('2026-11-20');
    expect(t.body_md).toBe('');
    expect(opened).toEqual([t.id]);
    expect(wantsBodyFocus(t.id)).toBe(true);
    expect(store.isDraftTask(t.id)).toBe(true);
    expect(pushed).toEqual([]);
  });
  it('没打字就关：丢掉，什么都不写', async () => {
    const { store, open } = await setup();
    const pushed: string[] = [];
    store.onLocalWrite((cs) => pushed.push(...cs.map((c) => c.row.id)));
    const t = createDateDraftTask(store, open, '2026-11-20');
    expect(sweepBlankTasks(store, t.id)).toEqual([]);
    expect(sweepBlankTasks(store, null)).toEqual([t.id]);
    expect(store.get('task', t.id)).toBeUndefined();
    expect(pushed).toEqual([]);
  });
  it('打了字：成了普通任务，关掉留着', async () => {
    const { store, open } = await setup();
    const t = createDateDraftTask(store, open, '2026-11-20');
    store.updateTask(t.id, { body_md: '看牙' });
    expect(store.isDraftTask(t.id)).toBe(false);
    expect(sweepBlankTasks(store, null)).toEqual([]);
    expect(alive(store, t.id)).toBe(true);
  });
  it('只改了日期、正文还空着关：留下（改过属性就不算空白，Rei 2026-11-12 09:22）', async () => {
    const { store, open } = await setup();
    const t = createDateDraftTask(store, open, '2026-11-20');
    store.updateTask(t.id, { scheduled_date: '2026-11-21' });
    expect(sweepBlankTasks(store, null)).toEqual([]);
    expect(alive(store, t.id)).toBe(true);
    expect(store.isDraftTask(t.id)).toBe(false);
  });
  it('写了字又删光、属性没动：删掉（已落盘，写墓碑）', async () => {
    const { store, open } = await setup();
    const t = createDateDraftTask(store, open, '2026-11-20');
    store.updateTask(t.id, { body_md: '看' });
    store.updateTask(t.id, { body_md: '' });
    expect(sweepBlankTasks(store, null)).toEqual([t.id]);
    expect(alive(store, t.id)).toBe(false);
  });
});

describe('改过属性就留下（Rei 2026-11-12 09:22「用户改过任何属性（颜色、日期、循环等）就不算空白任务、不删」）', () => {
  it('倒数日只选了卡片颜色、没写标题，切到别的：留下', async () => {
    const { store, open } = await setup();
    const t = createBlankTask(store, open, 'countdown');
    store.setCardColor(t.id, 'pink');
    expect(sweepBlankTasks(store, 'other')).toEqual([]);
    expect(alive(store, t.id)).toBe(true);
    // 留下之后不再归清理管：再离开也不删
    expect(sweepBlankTasks(store, null)).toEqual([]);
    expect(alive(store, t.id)).toBe(true);
  });
  it('倒数日只选了日子 / 只加了重复：留下', async () => {
    const { store, open } = await setup();
    const a = createBlankTask(store, open, 'countdown');
    store.updateTask(a.id, { target_date: '2026-12-01' });
    const b = createBlankTask(store, open, 'countdown');
    store.updateTask(b.id, { target_date: '2026-12-02', recurrence: 'FREQ=YEARLY' });
    expect(sweepBlankTasks(store, null)).toEqual([]);
    expect(alive(store, a.id) && alive(store, b.id)).toBe(true);
  });
  it('挂了类型（另一张表）：留下', async () => {
    const { store, open } = await setup();
    const c = store.createCategory('纪念日');
    const t = createBlankTask(store, open, 'checkin');
    store.updateTask(t.id, { category_id: c.id });
    expect(sweepBlankTasks(store, null)).toEqual([]);
    expect(alive(store, t.id)).toBe(true);
  });
  it('什么都没改：照旧删；只有我的一天行变了不算改', async () => {
    const { store, open } = await setup();
    const t = createBlankTask(store, open, 'countdown');
    store.addToMyDay(t.id);
    expect(sweepBlankTasks(store, null)).toEqual([t.id]);
    expect(alive(store, t.id)).toBe(false);
  });
  it('旧会话只记了 id、没记签名：照原规则正文空就删', async () => {
    const { store, open } = await setup();
    const t = createBlankTask(store, open, 'countdown');
    store.setCardColor(t.id, 'pink');
    sessionStorage.removeItem('mindough:blank-sigs');
    expect(sweepBlankTasks(store, null)).toEqual([t.id]);
  });
});
