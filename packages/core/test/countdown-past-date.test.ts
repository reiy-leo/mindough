/**
 * 新建过去日子的倒数日 + 重复（Rei 2026-11-12 07:57「我新建了一个前天的倒数日，添加了每年重复，这个倒数日不见了」）。
 * 今天 2026-11-12，前天 2026-11-10（周二）。选了过去的日子：目标日直接跳到规则的下一次，不补记录，倒数日页（有 target_date、没关闭）照样列。
 * 日历格子「+」建的任务日期在 scheduled_date，改成倒数日时要挪成目标日，否则倒数日页、日历都不列它。
 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { fillCountdownTarget } from '../src/countdown-repeat';
import { formatRecurrence, isDueOn, nextOccurrence, parseRecurrence, type Recurrence } from '../src/recurrence';
import { solarToLunar } from '../src/lunar';
import type { Task } from '../src/types';
import { local } from './helpers';

const TODAY = '2026-11-12';
const PAST = '2026-11-10';

/** 和详情「重复」里点频率时一样：按目标日（没有目标日按今天）给默认规则（client pickers.tsx defaultRule）。 */
function rule(kind: Recurrence['kind'], anchor: string): string {
  if (kind === 'yearly') return formatRecurrence({ kind, month: Number(anchor.slice(5, 7)), day: Number(anchor.slice(8)) });
  if (kind === 'monthly') return formatRecurrence({ kind, day: Number(anchor.slice(8)) });
  if (kind === 'weekly') return formatRecurrence({ kind, weekdays: [new Date(`${anchor}T00:00:00`).getDay()] });
  if (kind === 'lunarYearly') {
    const l = solarToLunar(anchor)!;
    return formatRecurrence({ kind, month: l.month, day: l.day, leap: l.leap });
  }
  return formatRecurrence({ kind: 'every', days: 3, anchor });
}

/** 每种频率从前天起的下一次（今天或以后）。 */
const EXPECT: Record<string, string> = { yearly: '2027-11-10', monthly: '2026-12-10', weekly: '2026-11-17', every: '2026-11-13' };
const KINDS: Recurrence['kind'][] = ['yearly', 'lunarYearly', 'monthly', 'weekly', 'every'];

async function open() {
  return Store.open(new MemoryAdapter(), { deviceId: 'dev1', now: () => local(2026, 11, 12, 8) });
}

/** 倒数日页列不列它（pages/Countdowns.tsx：倒数日、有目标日、没关闭、没删）。 */
const onCountdownPage = (store: Store, id: string) => {
  const t = store.get('task', id);
  return !!t && !t.deleted && t.completion_mode === 'countdown' && !!t.target_date && t.status !== '关闭' && store.activeTasks().some((x) => x.id === id);
};

/** 落在规则上、不早于今天、而且是从前天起的下一次。 */
function checkNext(t: Task, kind: Recurrence['kind']) {
  const r = parseRecurrence(t.recurrence)!;
  expect(r.kind).toBe(kind);
  expect(t.target_date! >= TODAY).toBe(true);
  expect(isDueOn(r, t.target_date!)).toBe(true);
  expect(t.target_date).toBe(nextOccurrence(r, TODAY));
  if (EXPECT[kind]) expect(t.target_date).toBe(EXPECT[kind]);
  // 规则跟着前天走（不是今天）
  expect(isDueOn(r, PAST)).toBe(true);
}

describe('新建过去日子的倒数日 + 重复：目标日跳到下一次、不补记录、倒数日页列它', () => {
  for (const kind of KINDS) {
    it(`${kind}：新建时一起给日子和规则`, async () => {
      const store = await open();
      const t = store.createTask({ body_md: '前天', completion_mode: 'countdown', target_date: PAST, recurrence: rule(kind, PAST) }, { joinMyDay: false });
      checkNext(store.get('task', t.id)!, kind);
      expect(store.rollRecurringCountdowns()).toBe(0);
      expect(store.list('task').filter((x) => !x.deleted)).toHaveLength(1);
      expect(onCountdownPage(store, t.id)).toBe(true);
    });

    it(`${kind}：先选日子、再加重复（倒数日页「新建」）`, async () => {
      const store = await open();
      const t = store.createTask({ body_md: '前天', completion_mode: 'countdown', target_date: null }, { joinMyDay: false });
      store.updateTask(t.id, { target_date: PAST });
      expect(onCountdownPage(store, t.id)).toBe(true);
      store.updateTask(t.id, { recurrence: rule(kind, PAST) });
      checkNext(store.get('task', t.id)!, kind);
      expect(store.rollRecurringCountdowns()).toBe(0);
      expect(store.list('task').filter((x) => !x.deleted)).toHaveLength(1);
      expect(onCountdownPage(store, t.id)).toBe(true);
    });

    it(`${kind}：先加重复（规则按今天）、再选日子`, async () => {
      const store = await open();
      const t = store.createTask({ body_md: '前天', completion_mode: 'countdown', target_date: null }, { joinMyDay: false });
      store.updateTask(t.id, { recurrence: rule(kind, TODAY) });
      store.updateTask(t.id, { target_date: PAST });
      const got = store.get('task', t.id)!;
      expect(got.target_date! >= TODAY).toBe(true);
      expect(isDueOn(parseRecurrence(got.recurrence)!, got.target_date!)).toBe(true);
      if (kind !== 'weekly') checkNext(got, kind); // 每周：规则是「周四 + 周二」两天，下一次是今天（周四）
      expect(store.rollRecurringCountdowns()).toBe(0);
      expect(store.list('task').filter((x) => !x.deleted)).toHaveLength(1);
      expect(onCountdownPage(store, t.id)).toBe(true);
    });

    it(`${kind}：日历前天格子「+」建的任务改成倒数日、再加重复（Rei 07:57 的路径）`, async () => {
      const store = await open();
      const t = store.createTask({ body_md: '日历前天', scheduled_date: PAST }, { joinMyDay: false });
      store.updateTask(t.id, { completion_mode: 'countdown' });
      let got = store.get('task', t.id)!;
      expect(got.target_date).toBe(PAST);
      expect(got.scheduled_date).toBeNull();
      expect(onCountdownPage(store, t.id)).toBe(true);
      // 详情「重复」按目标日给默认规则
      store.updateTask(t.id, { recurrence: rule(kind, got.target_date!) });
      got = store.get('task', t.id)!;
      checkNext(got, kind);
      expect(store.rollRecurringCountdowns()).toBe(0);
      expect(store.list('task').filter((x) => !x.deleted)).toHaveLength(1);
      expect(onCountdownPage(store, t.id)).toBe(true);
    });
  }

  it('日历「+」草稿任务（只在内存）改成倒数日：同样挪成目标日', async () => {
    const store = await open();
    const t = store.createDraftTask({ body_md: '', scheduled_date: PAST });
    store.updateTask(t.id, { completion_mode: 'countdown', body_md: '草稿前天' });
    const got = store.get('task', t.id)!;
    expect(got.target_date).toBe(PAST);
    expect(got.scheduled_date).toBeNull();
    expect(onCountdownPage(store, t.id)).toBe(true);
  });

  it('新建面板：倒数日只给了日期（scheduled_date）也挪成目标日；日期段取开始那天', async () => {
    const store = await open();
    const a = store.createTask({ body_md: 'a', completion_mode: 'countdown', scheduled_date: PAST, recurrence: rule('yearly', TODAY) }, { joinMyDay: false });
    expect(store.get('task', a.id)!.target_date).toBe('2027-11-10');
    expect(store.get('task', a.id)!.recurrence).toBe(rule('yearly', PAST));
    const b = store.createTask({ body_md: 'b', scheduled_date: '2026-12-01', end_date: '2026-12-03' }, { joinMyDay: false });
    store.updateTask(b.id, { completion_mode: 'countdown' });
    expect(store.get('task', b.id)).toMatchObject({ target_date: '2026-12-01', scheduled_date: null, end_date: null });
  });

  it('已经有目标日的倒数日不动日期；不是倒数日的不动', () => {
    expect(fillCountdownTarget({ completion_mode: 'countdown', target_date: '2026-12-01', scheduled_date: PAST }, {})).toEqual({});
    expect(fillCountdownTarget({ completion_mode: 'once', target_date: null, scheduled_date: PAST }, {})).toEqual({});
    expect(fillCountdownTarget({ completion_mode: 'countdown', target_date: null, scheduled_date: null }, {})).toEqual({});
    expect(fillCountdownTarget(null, { completion_mode: 'countdown', scheduled_date: PAST })).toEqual({ target_date: PAST, scheduled_date: null, end_date: null });
  });
});

describe('repairCountdownDates：修好以前已经「不见了」的那种倒数日', () => {
  it('倒数日只有 scheduled_date、没有目标日、规则按今天（每年11月12日）：修成 2027-11-10、规则每年11月10日，不补记录', async () => {
    const store = await open();
    // 修好以前的样子：日历前天「+」→ 改倒数日（目标日空）→ 加每年（没有目标日，规则按今天）
    const t = store.createTask({ body_md: '日历前天', scheduled_date: PAST }, { joinMyDay: false });
    store.update('task', t.id, { completion_mode: 'countdown', recurrence: rule('yearly', TODAY) });
    const plain = store.createTask({ body_md: '普通任务', scheduled_date: PAST }, { joinMyDay: false });
    const done = store.createTask({ body_md: '做完的', scheduled_date: PAST }, { joinMyDay: false });
    store.update('task', done.id, { completion_mode: 'countdown', status: '完成' });
    const ok = store.createTask({ body_md: '好的倒数日', completion_mode: 'countdown', target_date: '2026-12-25' }, { joinMyDay: false });
    expect(onCountdownPage(store, t.id)).toBe(false);
    const before = new Map(store.list('task').map((x) => [x.id, x.updated_at]));

    expect(store.rollRecurringCountdowns()).toBe(0);
    const got = store.get('task', t.id)!;
    expect(got).toMatchObject({ target_date: '2027-11-10', scheduled_date: null, recurrence: rule('yearly', PAST), status: '待办' });
    expect(onCountdownPage(store, t.id)).toBe(true);
    // 只动了这一行
    for (const id of [plain.id, done.id, ok.id]) expect(store.get('task', id)!.updated_at).toBe(before.get(id));
    expect(store.list('task').filter((x) => !x.deleted)).toHaveLength(4);
    // 再跑一遍什么都不写
    const after = store.get('task', t.id)!.updated_at;
    expect(store.repairCountdownDates()).toBe(0);
    expect(store.get('task', t.id)!.updated_at).toBe(after);
  });

  it('不重复的倒数日只有日期：日期挪成目标日（过去的就是过去，显示「已过」）', async () => {
    const store = await open();
    const t = store.createTask({ body_md: 'x', scheduled_date: PAST }, { joinMyDay: false });
    store.update('task', t.id, { completion_mode: 'countdown' });
    expect(store.repairCountdownDates()).toBe(1);
    expect(store.get('task', t.id)).toMatchObject({ target_date: PAST, scheduled_date: null, recurrence: null });
  });
});
