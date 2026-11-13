/**
 * 错过的倒数日不自动完成（Rei 2026-11-13 08:38「错过的倒数日不要直接设置成"已完成"」）。
 * - 不重复的倒数日过了目标日：状态不变（待办），倒数日页写「已过 N 天」。
 * - 重复的倒数日照旧滚到下一次，过去那次的记录是待办（以前写「完成」、完成时间是那天中午）；记录 → 重复倒数日的前后关系不挡后续。
 * - 老版本自动标成完成的记录：一次性改回待办（本机标记 countdown_record_undone_v1），手动完成的不动。
 */
import { describe, expect, it } from 'vitest';
import { Store, COUNTDOWN_RECORD_UNDONE_META } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { countdownRecordId, isAutoRecordDoneAt, isCountdownRecordEdge, recordDoneAt } from '../src/countdown-repeat';
import { countdownPhrase } from '../src/describe';
import { overdueBacklogTasks } from '../src/overdue-backlog';
import { backlogTasks } from '../src/backlog';
import { dueTodayCandidates, yesterdayUnfinished } from '../src/myday';
import { setLocale } from '../src/i18n';
import type { BaseRow, Task } from '../src/types';
import { local } from './helpers';

const YEARLY_1112 = 'FREQ=YEARLY;BYMONTH=11;BYMONTHDAY=12';
const MONTHLY_5 = 'FREQ=MONTHLY;BYMONTHDAY=5';

async function open(now: () => Date, adapter = new MemoryAdapter(), deviceId = 'dev1') {
  return Store.open(adapter, { deviceId, now });
}

/** 模拟老版本：把记录写成「完成、完成时间 = 那天中午」。 */
function oldStyle(store: Store, id: string, doneAt?: string) {
  const t = store.get('task', id)!;
  store.write([{ table: 'task', row: { ...t, status: '完成', done_at: doneAt ?? recordDoneAt(t.target_date!) } as BaseRow }]);
}

describe('不重复的倒数日过了目标日', () => {
  it('状态不变，写「已过 N 天」；打开、滚动都不碰它', async () => {
    setLocale('zh');
    let now = local(2026, 11, 1, 9);
    const adapter = new MemoryAdapter();
    const store = await open(() => now, adapter);
    const t = store.createTask({ body_md: '考试', completion_mode: 'countdown', target_date: '2026-11-05' }, { joinMyDay: false });
    now = local(2026, 11, 13, 9);
    expect(store.rollRecurringCountdowns()).toBe(0);
    expect(store.get('task', t.id)).toMatchObject({ status: '待办', done_at: null, target_date: '2026-11-05' });
    expect(store.progress(t.id)!.value).toBe(-8);
    expect(countdownPhrase('2026-11-05', '2026-11-13')).toBe('已过 8 天');
    await store.flush();
    const s2 = await open(() => now, adapter);
    expect(s2.get('task', t.id)!.status).toBe('待办');
  });
});

describe('重复的倒数日滚动', () => {
  it('过去那次的记录是待办，没有完成时间；重复倒数日照常可开始', async () => {
    let now = local(2026, 11, 12, 9);
    const store = await open(() => now);
    const t = store.createTask({ body_md: '妈妈生日', completion_mode: 'countdown', target_date: '2026-11-12', recurrence: YEARLY_1112 }, { joinMyDay: false });
    now = local(2026, 11, 13, 9);
    expect(store.rollRecurringCountdowns()).toBe(1);
    expect(store.get('task', t.id)!.target_date).toBe('2027-11-12');
    const rec = store.get('task', countdownRecordId(t.id, '2026-11-12'))!;
    expect(rec).toMatchObject({ status: '待办', done_at: null, target_date: '2026-11-12', completion_mode: 'countdown' });
    // 关系照样在（先做完这些、任务链），但不挡后续
    expect(store.edges()).toContainEqual(expect.objectContaining({ pred_id: rec.id, succ_id: t.id }));
    expect(store.blockingEdges().some((e) => e.pred_id === rec.id)).toBe(false);
    expect(isCountdownRecordEdge({ succ_id: t.id }, rec)).toBe(true);
    expect(store.derived().get(t.id)?.state).toBe('可开始');
    // 手动完成记录：不弹「解锁了」，重复倒数日不算刚解锁、不自动进我的一天
    const r = store.completeTask(rec.id);
    expect(r.task.status).toBe('完成');
    expect(r.unlocked).toEqual([]);
    expect(store.syncAutoMyDay()).toBe(0);
  });

  it('普通前置照样挡重复倒数日', async () => {
    const now = local(2026, 11, 13, 9);
    const store = await open(() => now);
    const t = store.createTask({ body_md: '纪念日', completion_mode: 'countdown', target_date: '2026-12-05', recurrence: MONTHLY_5 }, { joinMyDay: false });
    const p = store.createTask({ body_md: '订餐厅' }, { joinMyDay: false });
    store.addDependency(p.id, t.id);
    expect(store.derived().get(t.id)?.state).toBe('被阻塞');
    expect(store.completeTask(p.id).unlocked.map((x) => x.id)).toEqual([t.id]);
  });

  it('过期的记录去哪：倒数日页列（已过 N 天）；过期积压、等待安排、昨天没做完、今天的建议都不列', async () => {
    let now = local(2026, 11, 5, 9);
    const store = await open(() => now);
    const t = store.createTask({ body_md: '还信用卡', completion_mode: 'countdown', target_date: '2026-11-05', recurrence: MONTHLY_5 }, { joinMyDay: false });
    // 昨天（11-12）放进过我的一天
    store.addToMyDay(t.id, '2026-11-05');
    now = local(2026, 11, 13, 9);
    store.rollRecurringCountdowns();
    const rec = store.get('task', countdownRecordId(t.id, '2026-11-05'))!;
    store.addToMyDay(rec.id, '2026-11-12');
    const tasks = store.tasks();
    // 倒数日页：倒数日、有目标日、没关闭
    expect(store.activeTasks().filter((x) => x.completion_mode === 'countdown' && x.status !== '关闭').map((x) => x.id).sort()).toEqual([rec.id, t.id].sort());
    expect(store.progress(rec.id)!.value).toBe(-8);
    expect(overdueBacklogTasks(tasks, now, '2026-11-13').map((x) => x.id)).not.toContain(rec.id);
    expect(backlogTasks(tasks, store.list('my_day'), '2026-11-13').map((x) => x.id)).not.toContain(rec.id);
    const byId = new Map(tasks.map((x) => [x.id, x]));
    expect(yesterdayUnfinished(store.list('my_day'), byId, [], '2026-11-13', now).map((x) => x.id)).not.toContain(rec.id);
    const cands = dueTodayCandidates({ tasks, checkIns: [], derived: store.derived(), recentlyUnlocked: [], today: '2026-11-13', now });
    expect(cands.map((c) => c.task.id)).not.toContain(rec.id);
  });
});

describe('老版本自动完成的记录改回待办', () => {
  it('认得出：整分钟、离那天 UTC 中午 14 小时内', () => {
    expect(isAutoRecordDoneAt(recordDoneAt('2026-11-12'), '2026-11-12')).toBe(true);
    expect(isAutoRecordDoneAt('2026-11-12T04:00:00.000Z', '2026-11-12')).toBe(true); // 上海中午
    expect(isAutoRecordDoneAt('2026-11-12T17:00:00.000Z', '2026-11-12')).toBe(true); // 纽约中午
    expect(isAutoRecordDoneAt('2026-11-12T04:00:03.512Z', '2026-11-12')).toBe(false); // 手动点的
    expect(isAutoRecordDoneAt('2026-11-14T04:00:00.000Z', '2026-11-12')).toBe(false);
    expect(isAutoRecordDoneAt(null, '2026-11-12')).toBe(false);
  });

  it('只改自动完成的记录；手动完成的、普通倒数日、删了的都不动', async () => {
    let now = local(2026, 11, 1, 9);
    const store = await open(() => now);
    const a = store.createTask({ body_md: '生日', completion_mode: 'countdown', target_date: '2026-11-05', recurrence: MONTHLY_5 }, { joinMyDay: false });
    // 普通倒数日：用户在那天中午整点完成（没有前后关系，不是记录）
    const plain = store.createTask({ body_md: '考试', completion_mode: 'countdown', target_date: '2026-11-05' }, { joinMyDay: false });
    now = local(2027, 1, 20, 9);
    store.rollRecurringCountdowns();
    const [r1, r2, r3, r4] = ['2026-11-05', '2026-12-05', '2027-01-05', '2026-12-05'].map((d) => countdownRecordId(a.id, d));
    oldStyle(store, r1!);
    oldStyle(store, r2!, '2026-12-06T02:31:07.204Z'); // 用户重新打开后自己点的完成
    oldStyle(store, r3!);
    expect(r4).toBe(r2);
    store.write([{ table: 'task', row: { ...store.get('task', plain.id)!, status: '完成', done_at: recordDoneAt('2026-11-05') } as BaseRow }]);
    store.deleteTask(r3!);
    expect(store.restoreAutoDoneCountdownRecords()).toBe(1);
    expect(store.get('task', r1!)).toMatchObject({ status: '待办', done_at: null });
    expect(store.get('task', r2!)!.status).toBe('完成');
    expect(store.raw('task', r3!)!.deleted).toBe(true);
    expect(store.get('task', plain.id)!.status).toBe('完成');
    // 再跑一遍什么都不写
    const v = store.version;
    expect(store.restoreAutoDoneCountdownRecords()).toBe(0);
    expect(store.version).toBe(v);
  });

  it('打开时只做一次（本机标记）；以后手动完成的不会再被改回', async () => {
    let now = local(2026, 11, 12, 9);
    const adapter = new MemoryAdapter();
    const store = await open(() => now, adapter);
    expect(await adapter.getMeta(COUNTDOWN_RECORD_UNDONE_META)).toBeNull(); // 空库：不做也不记
    const t = store.createTask({ body_md: '生日', completion_mode: 'countdown', target_date: '2026-11-12', recurrence: YEARLY_1112 }, { joinMyDay: false });
    now = local(2026, 11, 13, 9);
    store.rollRecurringCountdowns();
    const rid = countdownRecordId(t.id, '2026-11-12');
    oldStyle(store, rid);
    await store.flush();
    const s2 = await open(() => now, adapter);
    expect(s2.get('task', rid)).toMatchObject({ status: '待办', done_at: null });
    expect(await adapter.getMeta(COUNTDOWN_RECORD_UNDONE_META)).toBeTruthy();
    // 之后又有一条老样子的（比如老客户端同步来的），本机不再改
    oldStyle(s2, rid);
    await s2.flush();
    const s3 = await open(() => now, adapter);
    expect(s3.get('task', rid)!.status).toBe('完成');
    expect(await s3.restoreAutoDoneCountdownRecordsOnce('sync')).toBe(0);
  });

  it('严格模式开着也改（重新打开在严格模式下本来就放行；记录是自动写错的）', async () => {
    let now = local(2026, 11, 12, 9);
    const adapter = new MemoryAdapter();
    const store = await open(() => now, adapter);
    const t = store.createTask({ body_md: '生日', completion_mode: 'countdown', target_date: '2026-11-12', recurrence: YEARLY_1112 }, { joinMyDay: false });
    now = local(2026, 11, 13, 9);
    store.rollRecurringCountdowns();
    const rid = countdownRecordId(t.id, '2026-11-12');
    oldStyle(store, rid);
    store.strictDone = true;
    expect(await store.restoreAutoDoneCountdownRecordsOnce('sync')).toBe(1);
    expect(store.get('task', rid)).toMatchObject({ status: '待办', done_at: null });
    expect(await adapter.getMeta(COUNTDOWN_RECORD_UNDONE_META)).toBeTruthy();
  });

  it('新设备空库：打开时不做，第一次同步拉完再做', async () => {
    let now = local(2026, 11, 12, 9);
    const A = await open(() => now, new MemoryAdapter(), 'devA');
    const t = A.createTask({ body_md: '生日', completion_mode: 'countdown', target_date: '2026-11-12', recurrence: YEARLY_1112 }, { joinMyDay: false });
    now = local(2026, 11, 13, 9);
    A.rollRecurringCountdowns();
    const rid = countdownRecordId(t.id, '2026-11-12');
    oldStyle(A, rid);
    const adB = new MemoryAdapter();
    const B = await open(() => now, adB, 'devB');
    expect(await adB.getMeta(COUNTDOWN_RECORD_UNDONE_META)).toBeNull();
    B.applyRemote([
      ...A.listAll('task').map((row) => ({ table: 'task' as const, row })),
      ...A.listAll('dependency').map((row) => ({ table: 'dependency' as const, row })),
    ] as never);
    expect((B.get('task', rid) as Task).status).toBe('完成');
    expect(await B.restoreAutoDoneCountdownRecordsOnce('sync')).toBe(1);
    expect(B.get('task', rid)!.status).toBe('待办');
    expect(await B.restoreAutoDoneCountdownRecordsOnce('sync')).toBe(0);
  });
});
