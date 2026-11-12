/**
 * 「一天从几点开始」全局生效（Rei 2026-11-13 01:16：「这个会更改我的一天、过期积压、日历、项目、打卡、倒数日、日记中的"一天"的范围」）。
 * 开始时间 0 点 / 4 点，凌晨 2 点（跨过午夜、还没到 4 点）各页面的「今天」、过期、打卡归哪天、倒数日剩几天。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { DAY_START_PREF, bindDayStart, dayOf, dayStartHour, logicalToday, nextDayBoundary, normalizeDayStart } from '../src/day-start';
import { isTaskOverdue, taskToday } from '../src/timezone';
import { computeProgress, dueToday, taskStreak } from '../src/checkin';
import { myDayItems, checkInDayItems } from '../src/myday';
import { doneDays } from '../src/done-list';
import { local } from './helpers';

afterEach(() => bindDayStart(null));

describe('dayOf / logicalToday（纯函数）', () => {
  it('开始时间 0 点：就是自然日', () => {
    expect(dayOf(local(2026, 11, 13, 0, 0), null, 0)).toBe('2026-11-13');
    expect(dayOf(local(2026, 11, 12, 23, 59), null, 0)).toBe('2026-11-12');
  });
  it('开始时间 4 点：3:59 还是前一天，4:00 换天', () => {
    expect(dayOf(local(2026, 11, 13, 2, 0), null, 4)).toBe('2026-11-12');
    expect(dayOf(local(2026, 11, 13, 3, 59), null, 4)).toBe('2026-11-12');
    expect(dayOf(local(2026, 11, 13, 4, 0), null, 4)).toBe('2026-11-13');
    expect(dayOf(local(2026, 11, 13, 23, 0), null, 4)).toBe('2026-11-13');
    // 跨月、跨年
    expect(dayOf(local(2026, 12, 1, 1, 0), null, 4)).toBe('2026-11-30');
    expect(dayOf(local(2027, 1, 1, 1, 0), null, 4)).toBe('2026-12-31');
  });
  it('ISO 字符串、毫秒都认；时区按那个时区的钟点', () => {
    const at = local(2026, 11, 13, 2, 0);
    expect(dayOf(at.toISOString(), null, 4)).toBe('2026-11-12');
    expect(dayOf(at.getTime(), null, 4)).toBe('2026-11-12');
    // 纽约 2026-11-12 09:00（UTC 14:00）：0 点、4 点都是 12 号；纽约 02:00（UTC 07:00）开始时间 4 点算 11 号
    expect(dayOf(Date.UTC(2026, 10, 12, 14), 'America/New_York', 4)).toBe('2026-11-12');
    expect(dayOf(Date.UTC(2026, 10, 12, 7), 'America/New_York', 4)).toBe('2026-11-11');
    expect(dayOf(Date.UTC(2026, 10, 12, 7), 'America/New_York', 0)).toBe('2026-11-12');
  });
  it('没接 Store：按 0 点；接上以后跟着它', () => {
    expect(dayStartHour()).toBe(0);
    expect(logicalToday(local(2026, 11, 13, 2))).toBe('2026-11-13');
    bindDayStart(() => 4);
    expect(logicalToday(local(2026, 11, 13, 2))).toBe('2026-11-12');
  });
  it('下一次换天：今天或明天的开始时间整点', () => {
    expect(nextDayBoundary(local(2026, 11, 13, 2), 4)).toBe(local(2026, 11, 13, 4).getTime());
    expect(nextDayBoundary(local(2026, 11, 13, 5), 4)).toBe(local(2026, 11, 14, 4).getTime());
    expect(nextDayBoundary(local(2026, 11, 13, 5), 0)).toBe(local(2026, 11, 14, 0).getTime());
  });
  it('设置值不变：键还是 journal.day_start，默认 5', () => {
    expect(DAY_START_PREF).toBe('journal.day_start');
    expect(normalizeDayStart(undefined)).toBe(5);
  });
});

/** 凌晨 2 点（2026-11-13 02:00），开始时间 h。 */
async function openAt(h: number | null, at = local(2026, 11, 13, 2)) {
  let now = at;
  const store = await Store.open(new MemoryAdapter(), { deviceId: 'dev1', now: () => now });
  if (h !== null) store.setPref(DAY_START_PREF, h);
  return { store, setNow: (d: Date) => (now = d) };
}

describe('Store：各页面的「今天」', () => {
  it('没设过 = 默认 5 点；老数据（journal.day_start）照用', async () => {
    const { store } = await openAt(null);
    expect(store.dayStart()).toBe(5);
    expect(store.today()).toBe('2026-11-12');
    expect(store.journalToday()).toBe('2026-11-12');
    store.setPref(DAY_START_PREF, 0);
    expect(store.today()).toBe('2026-11-13');
    expect(store.journalToday()).toBe('2026-11-13');
  });

  it('0 点 vs 4 点：今天、日记、任务时区的今天', async () => {
    const a = await openAt(0);
    expect(a.store.today()).toBe('2026-11-13');
    expect(taskToday({ time_zone: null }, a.store.now())).toBe('2026-11-13');
    const b = await openAt(4);
    expect(b.store.today()).toBe('2026-11-12');
    expect(b.store.journalToday()).toBe('2026-11-12');
    expect(taskToday({ time_zone: null }, b.store.now())).toBe('2026-11-12');
    // 4 点一过换天
    b.setNow(local(2026, 11, 13, 4, 1));
    expect(b.store.today()).toBe('2026-11-13');
  });

  it('过期积压：日期是 12 号的任务，凌晨 2 点开始时间 4 点不算过期，0 点算', async () => {
    const a = await openAt(0);
    const ta = a.store.createTask({ body_md: '昨天的事', scheduled_date: '2026-11-12' }, { joinMyDay: false });
    expect(isTaskOverdue(ta, a.store.now(), a.store.today())).toBe(true);
    expect(a.store.overdueBacklog().map((t) => t.id)).toContain(ta.id);

    const b = await openAt(4);
    const tb = b.store.createTask({ body_md: '昨天的事', scheduled_date: '2026-11-12' }, { joinMyDay: false });
    expect(isTaskOverdue(tb, b.store.now(), b.store.today())).toBe(false);
    expect(b.store.overdueBacklog().map((t) => t.id)).not.toContain(tb.id);
    // 日期设成「今天」（逻辑今天 12 号）就进今天的我的一天
    const tc = b.store.createTask({ body_md: '今天', scheduled_date: '2026-11-12' });
    expect(b.store.isInMyDay(tc.id)).toBe(true);
    expect(b.store.list('my_day').find((e) => e.task_id === tc.id)?.date).toBe('2026-11-12');
  });

  it('打卡：凌晨 2 点打的卡，开始时间 4 点归到 12 号；0 点归到 13 号', async () => {
    for (const [h, day] of [
      [0, '2026-11-13'],
      [4, '2026-11-12'],
    ] as const) {
      const { store } = await openAt(h);
      const t = store.createTask({ body_md: '喝水', completion_mode: 'once', recurrence: 'FREQ=DAILY', created_at: local(2026, 11, 1, 9).toISOString() }, { joinMyDay: false });
      store.checkIn(t.id, 'add', 1);
      const c = store.checkInsOf(t.id)[0]!;
      expect(c.period_key).toBe(day);
      expect(store.progress(t.id)!.met).toBe(true);
      expect(dueToday(t, store.today())).toBe(true);
    }
  });

  it('连续天数：11 号 22 点、凌晨 2 点（4 点开始算 12 号）连着两天', async () => {
    const { store, setNow } = await openAt(4, local(2026, 11, 11, 22));
    const t = store.createTask({ body_md: '读书', completion_mode: 'once', recurrence: 'FREQ=DAILY', created_at: local(2026, 11, 1, 9).toISOString() }, { joinMyDay: false });
    store.checkIn(t.id, 'add', 1);
    setNow(local(2026, 11, 13, 2));
    store.checkIn(t.id, 'add', 1);
    const keys = store.checkInsOf(t.id).map((c) => c.period_key).sort();
    expect(keys).toEqual(['2026-11-11', '2026-11-12']);
    expect(taskStreak(store.get('task', t.id)!, store.checkInsOf(t.id), store.now())?.current).toBe(2);
  });

  it('我的一天：今天要打的卡、今天做完的（按逻辑今天）', async () => {
    const { store } = await openAt(4);
    const habit = store.createTask({ body_md: '冥想', completion_mode: 'once', recurrence: 'FREQ=DAILY', created_at: local(2026, 11, 1, 9).toISOString() }, { joinMyDay: false });
    const today = store.today();
    const items = checkInDayItems(store.list('task'), store.list('group'), store.list('check_in'), today, store.now(), new Set());
    expect(items.map((i) => i.task.id)).toContain(habit.id);
    // 凌晨 2 点做完：算 12 号做完的，12 号的我的一天还留在「已完成」
    const job = store.createTask({ body_md: '收尾' });
    store.addToMyDay(job.id);
    expect(store.list('my_day').find((e) => e.task_id === job.id)?.date).toBe('2026-11-12');
    store.updateTask(job.id, { status: '完成', done_at: store.now().toISOString() });
    const byId = new Map(store.list('task').map((t) => [t.id, t]));
    const mine = myDayItems(store.list('my_day'), byId, store.list('check_in'), today, store.now());
    expect(mine.map((i) => i.task.id)).toContain(job.id);
    // 已完成页按逻辑日期分段
    expect(doneDays([store.get('task', job.id)!])[0]?.date).toBe('2026-11-12');
  });

  it('倒数日：剩几天按逻辑今天；到 14 号，凌晨 2 点开始时间 4 点还剩 2 天，0 点剩 1 天', async () => {
    const task = { completion_mode: 'countdown' as const, target_value: null, target_date: '2026-11-14', recurrence: null };
    bindDayStart(() => 4);
    expect(computeProgress(task, [], local(2026, 11, 13, 2)).value).toBe(2);
    bindDayStart(() => 0);
    expect(computeProgress(task, [], local(2026, 11, 13, 2)).value).toBe(1);
    // 目标日就是逻辑今天：「今天」
    bindDayStart(() => 4);
    expect(computeProgress({ ...task, target_date: '2026-11-12' }, [], local(2026, 11, 13, 2)).value).toBe(0);
  });

  it('重复倒数日：凌晨 2 点、开始时间 4 点，目标日 12 号还没过，不滚；0 点就滚到下一次', async () => {
    const b = await openAt(4);
    const tb = b.store.createTask({ body_md: '纪念日', completion_mode: 'countdown', target_date: '2026-11-12', recurrence: 'FREQ=YEARLY;BYMONTH=11;BYMONTHDAY=12' }, { joinMyDay: false });
    expect(b.store.get('task', tb.id)!.target_date).toBe('2026-11-12');
    expect(b.store.rollRecurringCountdowns()).toBe(0);
    expect(b.store.get('task', tb.id)!.target_date).toBe('2026-11-12');
    // 4 点一过：滚到明年，记一条 12 号的记录
    b.setNow(local(2026, 11, 13, 4, 30));
    expect(b.store.rollRecurringCountdowns()).toBe(1);
    expect(b.store.get('task', tb.id)!.target_date).toBe('2027-11-12');
  });
});
