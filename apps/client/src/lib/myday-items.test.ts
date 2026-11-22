import { describe, expect, it } from 'vitest';
import { MemoryAdapter, Store, myDaySections } from '@mindough/core';
import { dayItems } from './myday-items';
import { buildWidgetSnapshot } from './widget-snapshot';

/** 任务置顶（Rei 2026-11-08）：我的一天页、侧栏数字、小组件都算上置顶的任务。 */
async function setup() {
  let t = new Date(2026, 10, 8, 9).getTime();
  const store = await Store.open(new MemoryAdapter(), { now: () => new Date(t) });
  return { store, advance: (ms: number) => (t += ms) };
}
const DAY = 24 * 3600_000;
const ids = (store: Store) => dayItems(store).map((i) => i.task.id);

describe('我的一天的清单带上置顶的任务', () => {
  it('置顶的排最上面，第二天还在；同一件有行的只出现一次', async () => {
    const { store, advance } = await setup();
    const a = store.createTask({ body_md: '交房租' });
    const b = store.createTask({ body_md: '买菜' });
    store.addToMyDay(b.id);
    advance(1000);
    store.addToMyDay(a.id);
    store.pinTask(a.id);
    expect(ids(store)).toEqual([a.id, b.id]);
    advance(DAY);
    expect(ids(store)).toEqual([a.id]);
    store.unpinTask(a.id);
    expect(ids(store)).toEqual([]);
  });

  it('做完那天进已完成段，第二天不显示', async () => {
    const { store, advance } = await setup();
    const a = store.createTask({ body_md: '交房租' });
    store.pinTask(a.id);
    store.completeTask(a.id);
    expect(myDaySections(dayItems(store)).done.map((i) => i.task.id)).toEqual([a.id]);
    advance(DAY);
    expect(ids(store)).toEqual([]);
  });

  it('归档项目里的置顶任务不显示', async () => {
    const { store } = await setup();
    const g = store.insert('group', { name: '搬家', icon: '🏠', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto: true });
    const a = store.createTask({ body_md: '打包', group_id: g.id });
    store.pinTask(a.id);
    expect(ids(store)).toEqual([a.id]);
    store.archiveGroup(g.id);
    expect(ids(store)).toEqual([]);
  });

  it('小组件快照的我的一天算上置顶的', async () => {
    const { store, advance } = await setup();
    const a = store.createTask({ body_md: '交房租' });
    store.pinTask(a.id);
    advance(DAY);
    expect(buildWidgetSnapshot(store).myDay.map((x) => x.id)).toEqual([a.id]);
  });

  it('项目关了「出现在我的一天」：系统加的、今天要打的打卡不出，手动加的、置顶的照常；再打开都回来（Rei 2026-11-22）', async () => {
    const { store } = await setup();
    const g = store.insert('group', { name: 'document-render', icon: '📁', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto: true });
    const today = '2026-11-08';
    const auto = store.createTask({ body_md: '今天到期', group_id: g.id, scheduled_date: today });
    const habit = store.createTask({ body_md: '每天', group_id: g.id, recurrence: 'FREQ=DAILY' });
    const manual = store.createTask({ body_md: '手动', group_id: g.id });
    store.addToMyDay(manual.id);
    const pinned = store.createTask({ body_md: '置顶', group_id: g.id });
    store.pinTask(pinned.id);
    store.syncAutoMyDay();
    expect(new Set(ids(store))).toEqual(new Set([auto.id, habit.id, manual.id, pinned.id]));
    store.updateGroup(g.id, { my_day_auto: false });
    expect(new Set(ids(store))).toEqual(new Set([manual.id, pinned.id]));
    expect(buildWidgetSnapshot(store).myDay.map((x) => x.id).sort()).toEqual([manual.id, pinned.id].sort());
    store.updateGroup(g.id, { my_day_auto: true });
    expect(new Set(ids(store))).toEqual(new Set([auto.id, habit.id, manual.id, pinned.id]));
  });
});
