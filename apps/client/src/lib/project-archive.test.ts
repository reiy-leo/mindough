import { describe, expect, it } from 'vitest';
import { MemoryAdapter, Store, formatRecurrence } from '@mindough/core';
import { visibleDayEntries } from './project-archive';
import { buildWidgetSnapshot } from './widget-snapshot';

/** 项目归档后我的一天里藏起来、取消归档回来（Rei 2026-11-05）。 */
async function setup() {
  let t = new Date(2026, 10, 5, 9).getTime();
  const store = await Store.open(new MemoryAdapter(), { now: () => new Date(t) });
  const g = store.insert('group', { name: '搬家', icon: '🏠', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto: true });
  return { store, g, advance: (ms: number) => (t += ms) };
}

const ids = (store: Store) => visibleDayEntries(store, store.list('my_day')).map((e) => e.task_id);

describe('我的一天里的归档项目任务', () => {
  it('归档前放进来的、自动加进来的都不显示；取消归档后回来；不删我的一天的行', async () => {
    const { store, g, advance } = await setup();
    const manual = store.createTask({ body_md: '打包', group_id: g.id });
    store.addToMyDay(manual.id, '2026-11-05');
    const auto = store.createTask({ body_md: '退押金', group_id: g.id, scheduled_date: '2026-11-05' });
    store.syncAutoMyDay('2026-11-05');
    const loose = store.createTask({ body_md: '买菜' });
    store.addToMyDay(loose.id, '2026-11-05');
    expect(new Set(ids(store))).toEqual(new Set([manual.id, auto.id, loose.id]));
    advance(1000);
    store.archiveGroup(g.id);
    expect(ids(store)).toEqual([loose.id]);
    expect(store.list('my_day')).toHaveLength(3);
    store.unarchiveGroup(g.id);
    expect(new Set(ids(store))).toEqual(new Set([manual.id, auto.id, loose.id]));
  });

  it('归档以后自己又放进今天的（比如用全局搜索（⌘F）搜到）照常显示', async () => {
    const { store, g, advance } = await setup();
    const t = store.createTask({ body_md: '打包', group_id: g.id });
    store.archiveGroup(g.id);
    advance(1000);
    store.addToMyDay(t.id, '2026-11-05');
    expect(ids(store)).toEqual([t.id]);
  });

  it('小组件：我的一天和今天要打卡都不列归档项目的', async () => {
    const { store, g, advance } = await setup();
    const a = store.createTask({ body_md: '打包', group_id: g.id });
    store.addToMyDay(a.id, '2026-11-05');
    const water = store.createTask({ body_md: '喝水', group_id: g.id, recurrence: formatRecurrence({ kind: 'daily' }), created_at: new Date(2026, 10, 1).toISOString() });
    let s = buildWidgetSnapshot(store);
    // 今天要打的打卡在我的一天里（Rei 2026-11-09），快照 myDay 带上它，checkIns 不重复列
    expect(s.myDay.map((x) => x.id)).toEqual([a.id, water.id]);
    expect(s.checkIns).toEqual([]);
    store.removeFromMyDay(water.id, '2026-11-05');
    s = buildWidgetSnapshot(store);
    expect(s.myDay.map((x) => x.id)).toEqual([a.id]);
    expect(s.checkIns.map((x) => x.id)).toEqual([water.id]);
    advance(1000);
    store.archiveGroup(g.id);
    s = buildWidgetSnapshot(store);
    expect(s.myDay).toEqual([]);
    expect(s.checkIns).toEqual([]);
  });
});
