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
});
