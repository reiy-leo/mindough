/**
 * 打卡归档（Rei 2026-11-02「打卡任务可以归档」）和倒数日卡片颜色（Rei 2026-11-02「倒数日的card可以设置不同的颜色背景」），迁移 v15。
 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { SyncEngine } from '../src/sync/engine';
import { MemoryRemote } from '../src/sync/memory-remote';
import { entriesFor, suggestions, recentlyUnlocked } from '../src/myday';
import { buildRatioIndex, dueToday } from '../src/checkin';
import { upcomingReminders } from '../src/reminders';
import { toDateKey, addDays } from '../src/dates';
import { applyImport, exportArchive, planImport } from '../src/archive';
import { cardColorOf, CARD_COLORS } from '../src/card-color';
import { local } from './helpers';

async function open(deviceId = 'dev1', t0 = local(2026, 11, 2, 9).getTime()) {
  let t = t0;
  const store = await Store.open(new MemoryAdapter(), { deviceId, now: () => new Date(t) });
  return { store, advance: (ms: number) => (t += ms), now: () => t };
}
const today = (s: Store) => toDateKey(s.now());
const sugg = (s: Store) => {
  const tasks = s.list('task');
  const derived = s.derived();
  const unlocked = recentlyUnlocked(tasks, s.edges(), derived, new Date(s.now().getTime() - 24 * 3600_000).toISOString());
  return suggestions({ tasks, entries: s.list('my_day'), checkIns: s.list('check_in'), derived, recentlyUnlocked: unlocked, today: today(s), now: s.now(), groups: s.list('group') }).map((x) => x.task.id);
};
const habit = (s: Store, patch = {}) =>
  s.createTask({ body_md: '跑步', recurrence: 'FREQ=DAILY', completion_mode: 'once', created_at: local(2026, 10, 20, 8).toISOString(), ...patch });

describe('打卡归档', () => {
  it('归档：状态不变，不算今天要打卡，不进建议，今天的我的一天顺手移出', async () => {
    const { store } = await open();
    const h = habit(store);
    store.addToMyDay(h.id);
    expect(dueToday(h, today(store))).toBe(true);
    expect(sugg(store)).not.toContain('x');
    store.archiveTask(h.id);
    const a = store.get('task', h.id)!;
    expect(a.status).toBe('待办');
    expect(a.archived_at).toBeTruthy();
    expect(dueToday(a, today(store))).toBe(false);
    expect(sugg(store)).not.toContain(h.id);
    expect(entriesFor(store.list('my_day'), today(store)).map((e) => e.task_id)).not.toContain(h.id);
  });

  it('项目里的打卡归档后不自动进我的一天', async () => {
    const { store } = await open();
    const g = store.insert('group', { name: '健身', icon: '💪', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto: true });
    const h = habit(store, { group_id: g.id });
    store.archiveTask(h.id);
    expect(store.syncAutoMyDay()).toBe(0);
  });

  it('归档了不提醒；取消归档后照常提醒、照常要打卡', async () => {
    const { store } = await open('dev1', local(2026, 11, 2, 7).getTime());
    const h = habit(store, { remind_time: '08:00' });
    const remind = () => upcomingReminders(store.list('task'), store.list('check_in'), { now: store.now(), timeZone: 'Asia/Shanghai' }).filter((r) => r.taskId === h.id);
    expect(remind().length).toBeGreaterThan(0);
    store.archiveTask(h.id);
    expect(remind()).toEqual([]);
    store.unarchiveTask(h.id);
    expect(store.get('task', h.id)!.archived_at).toBeNull();
    expect(remind().length).toBeGreaterThan(0);
    expect(dueToday(store.get('task', h.id)!, today(store))).toBe(true);
  });

  it('以前的打卡记录留着：归档前的日子照常有比例，归档那天起不算', async () => {
    const { store } = await open();
    const h = habit(store);
    const yesterday = addDays(today(store), -1);
    store.checkIn(h.id, 'add', 1, yesterday);
    store.archiveTask(h.id);
    const idx = buildRatioIndex(store.list('task'), store.list('check_in'), store.now());
    expect(idx.taskRatio(h.id, yesterday)).toBe(1);
    expect(idx.taskRatio(h.id, today(store))).toBeNull();
    expect(store.checkInsOf(h.id).length).toBe(1);
  });

  it('归档和颜色跟着同步到别的设备', async () => {
    const remote = new MemoryRemote();
    const dev = async (id: string) => {
      const d = await open(id);
      const engine = new SyncEngine(d.store, remote.transport(), { account: 'rei@example.com', now: () => new Date(d.now()), timers: { set: () => 0, clear: () => {} } });
      return { ...d, sync: () => engine.syncNow() };
    };
    const a = await dev('devA');
    const b = await dev('devB');
    const h = habit(a.store);
    const c = a.store.createTask({ body_md: '出发', completion_mode: 'countdown', target_date: '2026-12-01' });
    a.store.archiveTask(h.id);
    a.store.setCardColor(c.id, 'teal');
    await a.sync();
    await b.sync();
    expect(b.store.get('task', h.id)!.archived_at).toBeTruthy();
    expect(b.store.get('task', c.id)!.card_color).toBe('teal');
  });

  it('老客户端推来的行没有这两列：当没归档、默认颜色', async () => {
    const { store } = await open();
    const h = habit(store);
    const old = { ...store.get('task', h.id)! } as Record<string, unknown>;
    delete old.archived_at;
    delete old.card_color;
    old.updated_at = '9999-01-01T00:00:00.000Z-0000-zzzz';
    store.applyRemote([{ table: 'task', row: old as never }]);
    expect(store.get('task', h.id)!.archived_at).toBeNull();
    expect(store.get('task', h.id)!.card_color).toBeNull();
  });
});

describe('倒数日卡片颜色', () => {
  it('只认预设色的名字，别的当默认', async () => {
    const { store } = await open();
    const c = store.createTask({ body_md: '考试', completion_mode: 'countdown', target_date: '2026-12-20' });
    expect(cardColorOf(c)).toBeNull();
    store.setCardColor(c.id, 'pink');
    expect(cardColorOf(store.get('task', c.id)!)).toBe('pink');
    store.setCardColor(c.id, '#ff0000');
    expect(store.get('task', c.id)!.card_color).toBeNull();
    expect(CARD_COLORS.length).toBeGreaterThanOrEqual(10);
  });
});

describe('导出导入带上归档和颜色', () => {
  it('往返一致', async () => {
    const { store } = await open();
    const h = habit(store);
    const c = store.createTask({ body_md: '纪念日', completion_mode: 'countdown', target_date: '2027-01-01' });
    store.archiveTask(h.id);
    store.setCardColor(c.id, 'purple');
    const { files } = exportArchive(store);
    const dst = (await open('dev2')).store;
    applyImport(dst, planImport(dst, files));
    expect(dst.get('task', h.id)!.archived_at).toBe(store.get('task', h.id)!.archived_at);
    expect(dst.get('task', c.id)!.card_color).toBe('purple');
  });
});
