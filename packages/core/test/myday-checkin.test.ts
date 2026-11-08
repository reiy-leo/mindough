/**
 * 今天要打的打卡自动出现在我的一天（Rei 2026-11-09 01:27「打卡任务，如果今天有节点，也要显示在我的一天中」）。
 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { checkInDayItems, isCheckInEntry, myDayItems, myDaySections, suggestions, withPinned } from '../src/myday';
import { toDateKey } from '../src/dates';
import { local } from './helpers';

const DAY = 24 * 3600_000;
async function open(t0 = local(2026, 11, 9, 9).getTime()) {
  let t = t0;
  const store = await Store.open(new MemoryAdapter(), { deviceId: 'dev1', now: () => new Date(t) });
  return { store, advance: (ms: number) => (t += ms) };
}
function day(store: Store) {
  const now = store.now();
  const today = toDateKey(now);
  const tasks = store.list('task');
  const seen = new Set(store.listAll('my_day').filter((e) => e.date === today).map((e) => e.task_id));
  const real = myDayItems(store.list('my_day'), new Map(tasks.map((t) => [t.id, t])), store.list('check_in'), today, now);
  return myDaySections(withPinned([...real, ...checkInDayItems(tasks, store.list('group'), store.list('check_in'), today, now, seen)], []));
}
const ids = (xs: { task: { id: string } }[]) => xs.map((x) => x.task.id);

describe('我的一天里的打卡', () => {
  it('今天要打的在未完成段（虚拟行，不写 my_day）；达标进已完成；第二天又回来', async () => {
    const { store, advance } = await open();
    const h = store.createTask({ body_md: '喝水', completion_mode: 'count', target_value: 2, recurrence: 'FREQ=DAILY' });
    let d = day(store);
    expect(ids(d.open)).toEqual([h.id]);
    expect(isCheckInEntry(d.open[0]!.entry)).toBe(true);
    expect(store.list('my_day')).toEqual([]);
    expect(store.isInMyDay(h.id)).toBe(true);
    store.checkIn(h.id, 'add', 2);
    d = day(store);
    expect(ids(d.done)).toEqual([h.id]);
    advance(DAY);
    expect(ids(day(store).open)).toEqual([h.id]);
  });
  it('今天不用打的、归档的、不再打卡的、置顶的不出虚拟行', async () => {
    const { store } = await open(local(2026, 11, 9, 9).getTime()); // 周一
    const sat = store.createTask({ body_md: '周六大扫除', recurrence: 'FREQ=WEEKLY;BYDAY=SA' });
    const arch = store.createTask({ body_md: '归档的', recurrence: 'FREQ=DAILY' });
    store.updateTask(arch.id, { archived_at: store.now().toISOString() });
    const closed = store.createTask({ body_md: '不再打卡', recurrence: 'FREQ=DAILY' });
    store.setStatus(closed.id, '关闭');
    const pinned = store.createTask({ body_md: '置顶的', recurrence: 'FREQ=DAILY' });
    store.pinTask(pinned.id);
    const d = day(store);
    expect([...ids(d.open), ...ids(d.done)]).not.toContain(sat.id);
    expect([...ids(d.open), ...ids(d.done)]).not.toContain(arch.id);
    expect([...ids(d.open), ...ids(d.done)]).not.toContain(closed.id);
    expect([...ids(d.open), ...ids(d.done)]).not.toContain(pinned.id);
  });
  it('移出当天：写墓碑，这一天不再出现、不进建议；第二天照常；再加回来是真行', async () => {
    const { store, advance } = await open();
    const h = store.createTask({ body_md: '冥想', recurrence: 'FREQ=DAILY' });
    store.removeFromMyDay(h.id);
    expect(ids(day(store).open)).toEqual([]);
    expect(store.isInMyDay(h.id)).toBe(false);
    const sugg = suggestions({ tasks: store.list('task'), entries: store.list('my_day'), checkIns: [], derived: new Map(), recentlyUnlocked: [], today: toDateKey(store.now()), now: store.now(), groups: [] });
    expect(sugg.map((s) => s.task.id)).not.toContain(h.id);
    store.addToMyDay(h.id);
    const d = day(store);
    expect(ids(d.open)).toEqual([h.id]);
    expect(isCheckInEntry(d.open[0]!.entry)).toBe(false);
    advance(DAY);
    expect(ids(day(store).open)).toEqual([h.id]);
  });
  it('拖动排序：虚拟行落成真行，按新位置排', async () => {
    const { store } = await open();
    const a = store.createTask({ body_md: 'A' });
    store.addToMyDay(a.id);
    const h = store.createTask({ body_md: '冥想', recurrence: 'FREQ=DAILY' });
    expect(ids(day(store).open)).toEqual([a.id, h.id]);
    store.reorderMyDay(toDateKey(store.now()), [h.id, a.id]);
    const d = day(store);
    expect(ids(d.open)).toEqual([h.id, a.id]);
    expect(store.list('my_day').length).toBe(2);
  });
  it('有今天要打卡的建议不再出现', async () => {
    const { store } = await open();
    const h = store.createTask({ body_md: '冥想', recurrence: 'FREQ=DAILY' });
    const sugg = suggestions({ tasks: store.list('task'), entries: store.list('my_day'), checkIns: [], derived: new Map(), recentlyUnlocked: [], today: toDateKey(store.now()), now: store.now(), groups: [] });
    expect(sugg.map((s) => s.task.id)).not.toContain(h.id);
  });
});
