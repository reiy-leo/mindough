/** 重复的倒数日（Rei 2026-11-12 03:21「倒数日如果是重复任务，过了日期就生成一个过期任务，作为这个重复任务的前置任务」）。 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { SyncEngine } from '../src/sync/engine';
import { MemoryRemote } from '../src/sync/memory-remote';
import { alignRecurrence, describeRecurrence, formatRecurrence, isDueOn, nextOccurrence, parseRecurrence, periodStart } from '../src/recurrence';
import { countdownRecordDepId, countdownRecordId, isRecurringCountdown, normalizeCountdownRepeat, planCountdownRoll } from '../src/countdown-repeat';
import { dueToday, habitRule, isHabit, periodKeyForTask } from '../src/checkin';
import { upcomingReminders } from '../src/reminders';
import { setLocale } from '../src/i18n';
import { local } from './helpers';

const YEARLY_1112 = 'FREQ=YEARLY;BYMONTH=11;BYMONTHDAY=12';

describe('每年（公历）规则', () => {
  it('读写、哪天该到、下一次、上一次', () => {
    const r = parseRecurrence(YEARLY_1112)!;
    expect(r).toEqual({ kind: 'yearly', month: 11, day: 12 });
    expect(formatRecurrence(r)).toBe(YEARLY_1112);
    expect(isDueOn(r, '2027-11-12')).toBe(true);
    expect(isDueOn(r, '2027-11-13')).toBe(false);
    expect(nextOccurrence(r, '2026-11-13')).toBe('2027-11-12');
    expect(nextOccurrence(r, '2026-11-12')).toBe('2026-11-12');
    expect(periodStart(r, '2026-11-11')).toBe('2025-11-12');
  });

  it('2 月 29 日：平年取 28 日', () => {
    const r = parseRecurrence('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29')!;
    expect(nextOccurrence(r, '2027-01-01')).toBe('2027-02-28');
    expect(nextOccurrence(r, '2028-01-01')).toBe('2028-02-29');
  });

  it('农历规则照旧，带 RSCALE 的不当公历', () => {
    expect(parseRecurrence('FREQ=YEARLY;RSCALE=CHINESE;BYMONTH=8;BYMONTHDAY=15')?.kind).toBe('lunarYearly');
    expect(parseRecurrence('FREQ=YEARLY;BYMONTH=13;BYMONTHDAY=1')).toBeNull();
  });

  it('说法', () => {
    setLocale('zh');
    expect(describeRecurrence(parseRecurrence(YEARLY_1112))).toBe('每年11月12日');
  });

  it('alignRecurrence：规则跟着日子走', () => {
    expect(alignRecurrence({ kind: 'yearly', month: 11, day: 12 }, '2026-12-25')).toEqual({ kind: 'yearly', month: 12, day: 25 });
    expect(alignRecurrence({ kind: 'monthly', day: 20 }, '2026-12-05')).toEqual({ kind: 'monthly', day: 5 });
    expect(alignRecurrence({ kind: 'weekly', weekdays: [1] }, '2026-11-12')).toEqual({ kind: 'weekly', weekdays: [4] });
    expect(alignRecurrence({ kind: 'weekly', weekdays: [1, 3] }, '2026-11-12')).toEqual({ kind: 'weekly', weekdays: [1, 3, 4] });
    expect(alignRecurrence({ kind: 'every', days: 3, anchor: '2026-01-01' }, '2026-11-13')).toEqual({ kind: 'every', days: 3, anchor: '2026-11-13' });
    const lunar = alignRecurrence({ kind: 'lunarYearly', month: 1, day: 1, leap: false }, '2026-09-25');
    expect(lunar).toEqual({ kind: 'lunarYearly', month: 8, day: 15, leap: false });
    const same = { kind: 'monthly' as const, day: 12 };
    expect(alignRecurrence(same, '2026-11-12')).toBe(same);
  });
});

describe('planCountdownRoll', () => {
  const cd = (target: string | null, recurrence: string | null = YEARLY_1112) => ({ completion_mode: 'countdown' as const, recurrence, target_date: target });

  it('当天不滚（还是「今天」），第二天起滚到下一次', () => {
    expect(planCountdownRoll(cd('2026-11-12'), '2026-11-12')).toBeNull();
    expect(planCountdownRoll(cd('2026-11-12'), '2026-11-13')).toEqual({ past: ['2026-11-12'], next: '2027-11-12' });
  });

  it('漏了好几次：每次一条，从早到晚', () => {
    expect(planCountdownRoll(cd('2023-11-12'), '2026-11-20')).toEqual({ past: ['2023-11-12', '2024-11-12', '2025-11-12', '2026-11-12'], next: '2027-11-12' });
    // 今天正好是那天：今天是新的目标日，不算过去
    expect(planCountdownRoll(cd('2024-11-12'), '2026-11-12')).toEqual({ past: ['2024-11-12', '2025-11-12'], next: '2026-11-12' });
  });

  it('不重复、规则看不懂、不是倒数日、没目标日：不滚', () => {
    expect(planCountdownRoll(cd('2026-01-01', null), '2026-11-12')).toBeNull();
    expect(planCountdownRoll(cd('2026-01-01', 'FREQ=HOURLY'), '2026-11-12')).toBeNull();
    expect(planCountdownRoll(cd(null), '2026-11-12')).toBeNull();
    expect(planCountdownRoll({ completion_mode: 'count', recurrence: 'FREQ=DAILY', target_date: '2026-01-01' }, '2026-11-12')).toBeNull();
  });

  it('每年农历也能滚', () => {
    const plan = planCountdownRoll(cd('2025-10-06', 'FREQ=YEARLY;RSCALE=CHINESE;BYMONTH=8;BYMONTHDAY=15'), '2026-11-12');
    expect(plan).toEqual({ past: ['2025-10-06', '2026-09-25'], next: '2027-09-15' });
  });
});

describe('normalizeCountdownRepeat', () => {
  const cur = { completion_mode: 'countdown' as const, recurrence: YEARLY_1112, target_date: '2026-11-20' };
  it('改目标日：规则跟着改', () => {
    expect(normalizeCountdownRepeat({ ...cur, recurrence: 'FREQ=YEARLY;BYMONTH=11;BYMONTHDAY=20' }, { target_date: '2026-12-25' }, '2026-11-12')).toEqual({ recurrence: 'FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25' });
  });
  it('选了过去的日子（生日填出生那天）：目标日换成今年或明年那天，不补记录', () => {
    expect(normalizeCountdownRepeat({ ...cur, recurrence: 'FREQ=YEARLY;BYMONTH=11;BYMONTHDAY=20' }, { target_date: '1992-08-12' }, '2026-11-12')).toEqual({ recurrence: 'FREQ=YEARLY;BYMONTH=8;BYMONTHDAY=12', target_date: '2027-08-12' });
  });
  it('打开重复：目标日已经在规则上就不动；改规则：挪到新规则的下一次', () => {
    expect(normalizeCountdownRepeat({ ...cur, recurrence: null }, { recurrence: 'FREQ=YEARLY;BYMONTH=11;BYMONTHDAY=20' }, '2026-11-12')).toEqual({});
    expect(normalizeCountdownRepeat({ ...cur, recurrence: 'FREQ=MONTHLY;BYMONTHDAY=20' }, { recurrence: 'FREQ=MONTHLY;BYMONTHDAY=5' }, '2026-11-12')).toEqual({ target_date: '2026-12-05' });
  });
  it('不是倒数日、不重复：不管', () => {
    expect(normalizeCountdownRepeat({ completion_mode: 'once', recurrence: 'FREQ=DAILY', target_date: null }, { recurrence: 'FREQ=WEEKLY;BYDAY=MO' }, '2026-11-12')).toEqual({});
    expect(normalizeCountdownRepeat({ ...cur, recurrence: null }, { target_date: '2020-01-01' }, '2026-11-12')).toEqual({});
  });
});

describe('重复的倒数日不是打卡', () => {
  const t = { completion_mode: 'countdown' as const, recurrence: 'FREQ=DAILY', deleted: false, status: '待办' as const, created_at: '2026-01-01T00:00:00Z', archived_at: null };
  it('habitRule / isHabit / dueToday / 周期键', () => {
    expect(isRecurringCountdown(t)).toBe(true);
    expect(habitRule(t)).toBeNull();
    expect(isHabit(t)).toBe(false);
    expect(dueToday(t, '2026-11-12')).toBe(false);
    expect(periodKeyForTask(t, '2026-11-12')).toBe('once');
    expect(isHabit({ ...t, completion_mode: 'count' })).toBe(true);
  });
});

async function open(now: () => Date, deviceId = 'dev1') {
  return Store.open(new MemoryAdapter(), { deviceId, now });
}

describe('Store.rollRecurringCountdowns', () => {
  it('过了目标日：滚到下一次，过去那次生成一条完成的记录，连成前置', async () => {
    let now = local(2026, 11, 12, 9);
    const store = await open(() => now);
    const cat = store.categories()[0]!;
    const g = store.insert('group', { name: '家', icon: '🏠', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto: true });
    const t = store.createTask({ body_md: '妈妈生日\n买蛋糕', completion_mode: 'countdown', target_date: '2026-11-12', recurrence: YEARLY_1112, group_id: g.id, card_color: 'red', category_id: cat.id }, { joinMyDay: false });
    expect(store.rollRecurringCountdowns()).toBe(0);
    now = local(2026, 11, 13, 9);
    expect(store.rollRecurringCountdowns()).toBe(1);
    expect(store.get('task', t.id)!.target_date).toBe('2027-11-12');
    const rid = countdownRecordId(t.id, '2026-11-12');
    const rec = store.get('task', rid)!;
    expect(rec).toMatchObject({ body_md: '妈妈生日', status: '完成', completion_mode: 'countdown', target_date: '2026-11-12', recurrence: null, group_id: g.id, card_color: 'red', category_id: cat.id });
    expect(store.categoryIdsOfTask(rid)).toEqual([cat.id]);
    expect(store.edges()).toContainEqual(expect.objectContaining({ pred_id: rid, succ_id: t.id }));
    expect(store.raw('dependency', countdownRecordDepId(t.id, '2026-11-12'))).toBeTruthy();
    // 前置已完成，重复倒数日照样可开始
    expect(store.derived().get(t.id)?.state).toBe('可开始');
    // 再跑一遍什么都不写
    const v = store.version;
    expect(store.rollRecurringCountdowns()).toBe(0);
    expect(store.version).toBe(v);
  });

  it('很久没开：每次一条', async () => {
    let now = local(2026, 11, 12, 9);
    const store = await open(() => now);
    const t = store.createTask({ body_md: '纪念日', completion_mode: 'countdown', target_date: '2026-11-12', recurrence: YEARLY_1112 }, { joinMyDay: false });
    now = local(2029, 12, 1, 9);
    store.rollRecurringCountdowns();
    expect(store.get('task', t.id)!.target_date).toBe('2030-11-12');
    for (const d of ['2026-11-12', '2027-11-12', '2028-11-12', '2029-11-12']) expect(store.get('task', countdownRecordId(t.id, d))?.target_date).toBe(d);
    expect(store.edges().filter((e) => e.succ_id === t.id)).toHaveLength(4);
  });

  it('删掉的记录不再生成', async () => {
    let now = local(2026, 11, 13, 9);
    const store = await open(() => now);
    const t = store.createTask({ body_md: 'x', completion_mode: 'countdown', target_date: '2026-11-20', recurrence: 'FREQ=MONTHLY;BYMONTHDAY=20' }, { joinMyDay: false });
    now = local(2026, 11, 21, 9);
    store.rollRecurringCountdowns();
    const rid = countdownRecordId(t.id, '2026-11-20');
    store.deleteTask(rid);
    store.updateTask(t.id, { target_date: '2026-11-20' }); // 手动挪回去
    expect(store.get('task', t.id)!.target_date).toBe('2026-12-20'); // 过去的日子 → 下一次，不补记录
    store.rollRecurringCountdowns();
    expect(store.get('task', rid)).toBeUndefined();
  });

  it('关闭的、归档项目里的不滚；严格模式只滚不生成', async () => {
    let now = local(2026, 11, 1, 9);
    const store = await open(() => now);
    const closed = store.createTask({ body_md: 'a', completion_mode: 'countdown', target_date: '2026-11-05', recurrence: 'FREQ=MONTHLY;BYMONTHDAY=5' }, { joinMyDay: false });
    store.closeTask(closed.id);
    const g = store.insert('group', { name: '旧', icon: '🏠', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto: true });
    const arch = store.createTask({ body_md: 'b', completion_mode: 'countdown', target_date: '2026-11-05', recurrence: 'FREQ=MONTHLY;BYMONTHDAY=5', group_id: g.id }, { joinMyDay: false });
    store.archiveGroup(g.id);
    const strict = store.createTask({ body_md: 'c', completion_mode: 'countdown', target_date: '2026-11-05', recurrence: 'FREQ=MONTHLY;BYMONTHDAY=5' }, { joinMyDay: false });
    store.strictDone = true;
    now = local(2026, 11, 12, 9);
    expect(store.rollRecurringCountdowns()).toBe(1);
    expect(store.get('task', closed.id)!.target_date).toBe('2026-11-05');
    expect(store.get('task', arch.id)!.target_date).toBe('2026-11-05');
    expect(store.get('task', strict.id)!.target_date).toBe('2026-12-05');
    expect(store.get('task', countdownRecordId(strict.id, '2026-11-05'))).toBeUndefined();
  });

  it('两台设备各滚一遍，同步后只有一条记录、一条前后关系', async () => {
    const remote = new MemoryRemote();
    let now = local(2026, 11, 12, 9);
    const mk = async (id: string) => {
      const store = await open(() => now, id);
      const engine = new SyncEngine(store, remote.transport(), { account: 'rei@example.com', now: () => now, timers: { set: () => 0, clear: () => {} } });
      return { store, engine };
    };
    const A = await mk('devA');
    const B = await mk('devB');
    const t = A.store.createTask({ body_md: '生日', completion_mode: 'countdown', target_date: '2026-11-12', recurrence: YEARLY_1112 }, { joinMyDay: false });
    await A.engine.syncNow();
    await B.engine.syncNow();
    now = local(2026, 11, 13, 9);
    A.store.rollRecurringCountdowns();
    B.store.rollRecurringCountdowns();
    await A.engine.syncNow();
    await B.engine.syncNow();
    await A.engine.syncNow();
    for (const s of [A.store, B.store]) {
      expect(s.tasks().filter((x) => x.target_date === '2026-11-12')).toHaveLength(1);
      expect(s.edges().filter((e) => e.succ_id === t.id)).toHaveLength(1);
      expect(s.get('task', t.id)!.target_date).toBe('2027-11-12');
    }
  });
});

describe('提醒', () => {
  it('重复的倒数日按倒数日提醒，目标日之后窗口里的下几次也算', () => {
    const t = {
      id: 't1', updated_at: '', deleted: false, body_md: 'x', status: '待办', group_id: null, scheduled_date: null, end_date: null, type_id: null, type_data: {},
      completion_mode: 'countdown', target_value: null, unit: null, count_config: {}, target_date: '2026-11-13', recurrence: 'FREQ=WEEKLY;BYDAY=FR', category_id: null,
      checkin_category_id: null, library_item_id: null, remind_time: '09:00', time_zone: null, refs_mirror: null, done_at: null, sort: 0, created_at: '2026-01-01T00:00:00Z',
    } as never;
    const out = upcomingReminders([t], [], { now: local(2026, 11, 12, 8), horizonMs: 16 * 86_400_000 } as never);
    expect(out.map((r) => [r.kind, r.date])).toEqual([
      ['countdown', '2026-11-13'],
      ['countdown', '2026-11-20'],
      ['countdown', '2026-11-27'],
    ]);
  });
});
