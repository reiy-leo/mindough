/**
 * 补打卡（Rei 2026-11-09 01:52）：节点计算、补打归属、带进我的一天、过期、活动图标示。
 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { checkInDayItems, makeupDayItems, myDayItems, myDaySections, withPinned, yesterdayUnfinished } from '../src/myday';
import { isDailyRule, isMadeUpPeriod, isMakeupEntry, makeupNode } from '../src/makeup';
import { buildRatioIndex, taskStreak } from '../src/checkin';
import { parseRecurrence } from '../src/recurrence';
import { toDateKey } from '../src/dates';
import { local } from './helpers';

const DAY = 24 * 3600_000;
// 2026-11-02 是周一
async function open(t0 = local(2026, 11, 2, 9).getTime()) {
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
  const virt = [...checkInDayItems(tasks, store.list('group'), store.list('check_in'), today, now, seen), ...makeupDayItems(tasks, store.list('group'), store.listAll('my_day'), store.list('check_in'), today, now, seen)];
  return { ...myDaySections(withPinned([...real, ...virt], [])), virt };
}
const ids = (xs: { task: { id: string } }[]) => xs.map((x) => x.task.id);

describe('补打卡：什么时候能补', () => {
  it('每天打的、每周七天都选的不给补', () => {
    expect(isDailyRule(parseRecurrence('FREQ=DAILY')!)).toBe(true);
    expect(isDailyRule(parseRecurrence('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU')!)).toBe(true);
    expect(isDailyRule(parseRecurrence('FREQ=WEEKLY;BYDAY=MO,TH')!)).toBe(false);
    expect(isDailyRule(parseRecurrence('FREQ=DAILY;INTERVAL=3;DTSTART=20261102')!)).toBe(false);
  });

  it('周一、周四打的：周一没打，周二、周三能补周一；周四（下一个节点）过期；今天就是节点时不给', async () => {
    const { store, advance } = await open();
    const h = store.createTask({ body_md: '跑步', completion_mode: 'count', target_value: 3, recurrence: 'FREQ=WEEKLY;BYDAY=MO,TH' });
    const d = store.createTask({ body_md: '喝水', completion_mode: 'count', target_value: 2, recurrence: 'FREQ=DAILY' });
    expect(store.makeupNode(h.id)).toBeNull(); // 周一当天：今天就是节点
    advance(DAY); // 周二
    expect(store.makeupNode(h.id)).toBe('2026-11-02');
    expect(store.makeupNode(d.id)).toBeNull();
    advance(DAY); // 周三
    expect(store.makeupNode(h.id)).toBe('2026-11-02');
    advance(DAY); // 周四
    expect(store.makeupNode(h.id)).toBeNull();
  });

  it('节点早于创建日的不给；归档、结束的不给；上个节点达标了不给', async () => {
    const { store, advance } = await open(local(2026, 11, 3, 9).getTime()); // 周二创建
    const h = store.createTask({ body_md: '跑步', completion_mode: 'count', target_value: 2, recurrence: 'FREQ=WEEKLY;BYDAY=MO,TH' });
    expect(store.makeupNode(h.id)).toBeNull();
    advance(6 * DAY); // 下周一
    store.checkIn(h.id, 'add', 2);
    advance(DAY); // 周二
    expect(store.makeupNode(h.id)).toBeNull();
    const t = store.get('task', h.id)!;
    expect(makeupNode({ ...t, archived_at: new Date().toISOString() }, [], '2026-11-17', store.now())).toBeNull();
  });
});

describe('补打卡：进度算到上一个节点、在我的一天里待到补完', () => {
  it('点补打卡进今天的我的一天；打的进度记到周一；没补完第二天还在、进度带过来；补完落进已完成、按钮消失', async () => {
    const { store, advance } = await open();
    const h = store.createTask({ body_md: '跑步', completion_mode: 'count', target_value: 3, recurrence: 'FREQ=WEEKLY;BYDAY=MO,TH' });
    advance(DAY); // 周二
    expect(store.isInMyDay(h.id)).toBe(false);
    expect(store.startMakeup(h.id)).toBe('2026-11-02');
    expect(store.isInMyDay(h.id)).toBe(true);
    expect(ids(day(store).open)).toEqual([h.id]);
    const r = store.checkIn(h.id, 'add', 1);
    expect(r.event.period_key).toBe('2026-11-02');
    advance(DAY); // 周三：虚拟行带着，进度 1/3
    let dd = day(store);
    expect(ids(dd.open)).toEqual([h.id]);
    expect(isMakeupEntry(dd.virt[0]!.entry)).toBe(true);
    expect(store.isInMyDay(h.id)).toBe(true);
    expect(store.progress(h.id)?.value).toBe(1);
    // 昨天没做完里不重复列
    const tasks = store.list('task');
    expect(yesterdayUnfinished(store.list('my_day'), new Map(tasks.map((t) => [t.id, t])), store.list('check_in'), toDateKey(store.now()), store.now())).toEqual([]);
    store.checkIn(h.id, 'add', 2);
    expect(store.makeupNode(h.id)).toBeNull();
    dd = day(store);
    expect(ids(dd.done)).toEqual([h.id]);
    expect(store.progress(h.id, '2026-11-02')?.met).toBe(true);
    advance(DAY); // 周四：新节点，正常的今天要打卡
    dd = day(store);
    expect(dd.virt.filter((v) => isMakeupEntry(v.entry))).toEqual([]);
    expect(ids(dd.open)).toEqual([h.id]);
  });

  it('到了下一个节点还没补完：补打卡失效，周一那次保持没达标，已打的进度留在周一', async () => {
    const { store, advance } = await open();
    const h = store.createTask({ body_md: '跑步', completion_mode: 'count', target_value: 3, recurrence: 'FREQ=WEEKLY;BYDAY=MO,TH' });
    advance(DAY);
    store.startMakeup(h.id);
    store.checkIn(h.id, 'add', 1);
    advance(2 * DAY); // 周四
    expect(store.makeupNode(h.id)).toBeNull();
    expect(store.progress(h.id, '2026-11-02')).toMatchObject({ value: 1, met: false });
    expect(store.progress(h.id)?.value).toBe(0);
    expect(day(store).virt.filter((v) => isMakeupEntry(v.entry))).toEqual([]);
  });

  it('用户把它移出了我的一天：之后不再自动带着', async () => {
    const { store, advance } = await open();
    const h = store.createTask({ body_md: '跑步', completion_mode: 'count', target_value: 3, recurrence: 'FREQ=WEEKLY;BYDAY=MO,TH' });
    advance(DAY);
    store.startMakeup(h.id);
    store.removeFromMyDay(h.id);
    advance(DAY);
    expect(store.isInMyDay(h.id)).toBe(false);
    expect(store.makeupNode(h.id)).toBe('2026-11-02'); // 按钮还在，可以再点
  });
});

describe('补打卡：统计和活动图', () => {
  it('补完的节点算达成（连续数不断），活动图里标成补的；当天打的不算补', async () => {
    const { store, advance } = await open();
    const h = store.createTask({ body_md: '跑步', completion_mode: 'count', target_value: 2, recurrence: 'FREQ=WEEKLY;BYDAY=MO,TH' });
    advance(DAY);
    store.startMakeup(h.id);
    store.checkIn(h.id, 'add', 2);
    advance(2 * DAY); // 周四当天打
    store.checkIn(h.id, 'add', 2);
    const now = store.now();
    const idx = buildRatioIndex(store.list('task'), store.list('check_in'), now);
    expect(idx.taskRatio(h.id, '2026-11-02')).toBe(1);
    expect(idx.madeUp(h.id, '2026-11-02')).toBe(true);
    expect(idx.madeUp(h.id, '2026-11-05')).toBe(false);
    expect(taskStreak(store.get('task', h.id)!, store.checkInsOf(h.id), now)?.current).toBe(2);
  });

  it('isMadeUpPeriod：节点当天打了一半、后来补齐算补；节点当天就达标不算', () => {
    const task = { completion_mode: 'count' as const, target_value: 2, target_date: null, recurrence: 'FREQ=WEEKLY;BYDAY=MO' };
    const ev = (d: number, amount: number) => ({ id: `e${d}${amount}`, updated_at: '', deleted: false, task_id: 't', period_key: '2026-11-02', kind: 'add' as const, amount, at: local(2026, 11, d, 10).toISOString() });
    const now = local(2026, 11, 5);
    expect(isMadeUpPeriod(task, [ev(2, 1), ev(3, 1)], '2026-11-02', now)).toBe(true);
    expect(isMadeUpPeriod(task, [ev(2, 2)], '2026-11-02', now)).toBe(false);
    expect(isMadeUpPeriod(task, [ev(3, 1)], '2026-11-02', now)).toBe(false);
  });
});
