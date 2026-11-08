/**
 * 任务置顶（Rei 2026-11-08「任务支持置顶，置顶的任务在我的一天中永远显示，直到用户手动关闭」）：
 * task.pinned_at（v18）、Store.pinTask / unpinTask；我的一天每天都有、在「未完成」段最上面，
 * 改日期、移出当天、项目「出现在我的一天」开关都不影响；归档项目的不显示；做完只在当天的「已完成」段；老客户端的行不出错。
 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { SqlAdapter, migrate } from '../src/storage/sql';
import { MIGRATIONS, SCHEMA_VERSION } from '../src/storage/schema';
import { SyncEngine } from '../src/sync/engine';
import { MemoryRemote } from '../src/sync/memory-remote';
import { isPinned, isPinnedEntry, myDayItems, myDaySections, pinnedDayItems, recentlyUnlocked, reorderSection, suggestions, withPinned, yesterdayUnfinished } from '../src/myday';
import { addDays, toDateKey } from '../src/dates';
import { applyImport, exportArchive, planImport } from '../src/archive';
import { local } from './helpers';
import { NodeSqliteDriver } from './sql-drivers';

const DAY = 24 * 3600_000;

async function open(adapter: MemoryAdapter | SqlAdapter = new MemoryAdapter(), deviceId = 'dev1', t0 = local(2026, 11, 8, 9).getTime()) {
  let t = t0;
  const store = await Store.open(adapter, { deviceId, now: () => new Date(t) });
  return { store, advance: (ms: number) => (t += ms), now: () => t };
}

const group = (store: Store, name = '搬家', my_day_auto = true) =>
  store.insert('group', { name, icon: '🏠', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto });

const today = (s: Store) => toDateKey(s.now());
/** 我的一天当天的完整清单（和界面一样：普通行 + 置顶）。 */
const day = (s: Store, date = today(s)) => {
  const tasks = s.list('task');
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const checkIns = s.list('check_in');
  return withPinned(myDayItems(s.list('my_day'), byId, checkIns, date, s.now()), pinnedDayItems(tasks, s.list('group'), checkIns, date, s.now()));
};
const openIds = (s: Store, date?: string) => myDaySections(day(s, date)).open.map((i) => i.task.id);
const doneIds = (s: Store, date?: string) => myDaySections(day(s, date)).done.map((i) => i.task.id);

describe('置顶 / 取消置顶', () => {
  it('pinTask 记下时间，再置顶不写；unpinTask 清空，没置顶的不写', async () => {
    const { store, advance } = await open();
    const t = store.createTask({ body_md: '交房租' });
    expect(store.get('task', t.id)!.pinned_at).toBeNull();
    advance(1000);
    store.pinTask(t.id);
    const at = store.get('task', t.id)!.pinned_at;
    expect(at).toBe(new Date(local(2026, 11, 8, 9).getTime() + 1000).toISOString());
    expect(isPinned(store.get('task', t.id))).toBe(true);
    const v = store.get('task', t.id)!.updated_at;
    advance(1000);
    store.pinTask(t.id);
    expect(store.get('task', t.id)!.updated_at).toBe(v);
    store.unpinTask(t.id);
    expect(store.get('task', t.id)!.pinned_at).toBeNull();
    const v2 = store.get('task', t.id)!.updated_at;
    store.unpinTask(t.id);
    expect(store.get('task', t.id)!.updated_at).toBe(v2);
    // 置顶不写我的一天的行
    expect(store.list('my_day')).toEqual([]);
  });
});

describe('我的一天', () => {
  it('每天都出现，在未完成段最上面（在新加入的之上），多件置顶的最近置顶的在上', async () => {
    const { store, advance } = await open();
    const a = store.createTask({ body_md: 'A' });
    const b = store.createTask({ body_md: 'B' });
    const c = store.createTask({ body_md: 'C' });
    store.pinTask(a.id);
    advance(1000);
    store.pinTask(b.id);
    advance(1000);
    store.addToMyDay(c.id);
    expect(openIds(store)).toEqual([b.id, a.id, c.id]);
    const pinnedItem = day(store)[0]!;
    expect(isPinnedEntry(pinnedItem.entry)).toBe(true);
    // 明天、下周也在，什么都不用写
    advance(DAY);
    expect(openIds(store)).toEqual([b.id, a.id]);
    advance(6 * DAY);
    expect(openIds(store)).toEqual([b.id, a.id]);
  });

  it('同一件也有我的一天的行：只出现一次，在置顶的位置', async () => {
    const { store } = await open();
    const a = store.createTask({ body_md: 'A' });
    const b = store.createTask({ body_md: 'B' });
    store.addToMyDay(a.id);
    store.addToMyDay(b.id);
    store.pinTask(a.id);
    expect(openIds(store)).toEqual([a.id, b.id]);
  });

  it('改日期移出、移出当天都不影响', async () => {
    const { store } = await open();
    const t = store.createTask({ body_md: 'A' });
    store.addToMyDay(t.id);
    store.pinTask(t.id);
    store.updateTask(t.id, { scheduled_date: addDays(today(store), 3) });
    expect(store.isInMyDay(t.id)).toBe(false);
    expect(openIds(store)).toEqual([t.id]);
    store.removeFromMyDay(t.id);
    expect(openIds(store)).toEqual([t.id]);
    // 过期的也照常在
    store.updateTask(t.id, { scheduled_date: addDays(today(store), -5) });
    expect(openIds(store)).toEqual([t.id]);
  });

  it('项目关了「出现在我的一天」也在；项目归档了不显示，取消归档回来', async () => {
    const { store } = await open();
    const g = group(store, '搬家', false);
    const t = store.createTask({ body_md: '打包', group_id: g.id });
    store.pinTask(t.id);
    expect(openIds(store)).toEqual([t.id]);
    store.archiveGroup(g.id);
    expect(openIds(store)).toEqual([]);
    store.unarchiveGroup(g.id);
    expect(openIds(store)).toEqual([t.id]);
  });

  it('删了的、打卡归档了的不显示', async () => {
    const { store } = await open();
    const a = store.createTask({ body_md: 'A' });
    const h = store.createTask({ body_md: '喝水', recurrence: 'FREQ=DAILY' });
    store.pinTask(a.id);
    store.pinTask(h.id);
    store.deleteTask(a.id);
    store.archiveTask(h.id);
    expect(day(store)).toEqual([]);
  });

  it('做完那天在已完成段，之后不显示但还置顶；重新打开又回来', async () => {
    const { store, advance } = await open();
    const t = store.createTask({ body_md: 'A' });
    store.pinTask(t.id);
    store.completeTask(t.id);
    expect(openIds(store)).toEqual([]);
    expect(doneIds(store)).toEqual([t.id]);
    advance(DAY);
    expect(day(store)).toEqual([]);
    expect(isPinned(store.get('task', t.id))).toBe(true);
    store.reopenTask(t.id);
    expect(openIds(store)).toEqual([t.id]);
  });

  it('关闭的也一样：那天在已完成段，第二天不显示', async () => {
    const { store, advance } = await open();
    const t = store.createTask({ body_md: 'A' });
    store.pinTask(t.id);
    store.closeTask(t.id);
    expect(doneIds(store)).toEqual([t.id]);
    advance(DAY);
    expect(day(store)).toEqual([]);
  });

  it('打卡：每天都在，当天打完在已完成段，第二天又回到未完成', async () => {
    const { store, advance } = await open();
    const h = store.createTask({ body_md: '喝水', recurrence: 'FREQ=DAILY' });
    store.pinTask(h.id);
    expect(openIds(store)).toEqual([h.id]);
    store.checkIn(h.id, 'add', 1);
    expect(doneIds(store)).toEqual([h.id]);
    advance(DAY);
    expect(openIds(store)).toEqual([h.id]);
  });

  it('不进昨天没做完、建议、待安排', async () => {
    const { store, advance } = await open();
    const t = store.createTask({ body_md: 'A', scheduled_date: toDateKey(store.now()) });
    const b = store.createTask({ body_md: '没日期' });
    store.addToMyDay(t.id);
    store.pinTask(t.id);
    store.pinTask(b.id);
    expect(store.backlog().map((x) => x.id)).not.toContain(b.id);
    const sugg = () => {
      const tasks = store.list('task');
      const derived = store.derived();
      const unlocked = recentlyUnlocked(tasks, store.edges(), derived, new Date(store.now().getTime() - DAY).toISOString());
      return suggestions({ tasks, entries: store.list('my_day'), checkIns: store.list('check_in'), derived, recentlyUnlocked: unlocked, today: today(store), now: store.now(), groups: store.list('group') }).map((x) => x.task.id);
    };
    advance(DAY);
    expect(sugg()).not.toContain(t.id);
    const byId = new Map(store.list('task').map((x) => [x.id, x]));
    expect(yesterdayUnfinished(store.list('my_day'), byId, store.list('check_in'), today(store), store.now()).map((x) => x.id)).not.toContain(t.id);
    // 取消置顶后照旧：没日期的回到待安排
    store.unpinTask(b.id);
    expect(store.backlog().map((x) => x.id)).toContain(b.id);
  });

  it('拖动排序：置顶的不进排序结果', async () => {
    const { store } = await open();
    const a = store.createTask({ body_md: 'A' });
    const b = store.createTask({ body_md: 'B' });
    const c = store.createTask({ body_md: 'C' });
    store.addToMyDay(b.id);
    store.addToMyDay(c.id);
    store.pinTask(a.id);
    const items = day(store);
    expect(reorderSection(items, 'open', [a.id, b.id, c.id])).toEqual([b.id, c.id]);
    store.reorderMyDay(today(store), reorderSection(items, 'open', [a.id, b.id, c.id]));
    expect(openIds(store)).toEqual([a.id, b.id, c.id]);
  });
});

describe('存储、同步、导入导出（v18）', () => {
  it('迁移：v17 的老库升到 v18，老任务的 pinned_at 是空，能读能写', async () => {
    const d = new NodeSqliteDriver();
    expect(await migrate(d, MIGRATIONS.filter((m) => m.version <= 17))).toBe(17);
    await d.run(
      `INSERT INTO "task" ("id","updated_at","deleted","body_md","status","completion_mode","sort","created_at") VALUES ('t-old','0000000000001-0000-dev0',0,'老任务','待办','once',1,'2026-11-01T00:00:00.000Z')`,
    );
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(18);
    expect(await migrate(d)).toBe(SCHEMA_VERSION);
    const cols = (await d.all<{ name: string }>(`PRAGMA table_info("task")`)).map((c) => c.name);
    expect(cols).toContain('pinned_at');
    const { store } = await open(new SqlAdapter(d));
    expect(store.get('task', 't-old')?.pinned_at ?? null).toBeNull();
    store.pinTask('t-old');
    await store.flush();
    const { store: again } = await open(new SqlAdapter(d));
    expect(again.get('task', 't-old')?.pinned_at).toBeTruthy();
    expect(openIds(again)).toEqual(['t-old']);
  });

  it('老客户端写来的行没有 pinned_at：当成没置顶，不出错', async () => {
    const { store } = await open();
    const t = store.createTask({ body_md: 'A' });
    store.pinTask(t.id);
    const old = { ...store.get('task', t.id)!, updated_at: '9999999999999-0000-old' } as Record<string, unknown>;
    delete old.pinned_at;
    expect(() => store.applyRemote([{ table: 'task', row: old } as never])).not.toThrow();
    expect(store.get('task', t.id)?.pinned_at).toBeNull();
    expect(day(store)).toEqual([]);
  });

  it('同步到另一台设备：置顶、取消置顶都过去', async () => {
    const remote = new MemoryRemote();
    const dev = async (id: string) => {
      const d = await open(new MemoryAdapter(), id);
      const engine = new SyncEngine(d.store, remote.transport(), { account: 'rei@example.com', now: () => new Date(d.now()), timers: { set: () => 0, clear: () => {} } });
      return { ...d, sync: () => engine.syncNow() };
    };
    const a = await dev('devA');
    const b = await dev('devB');
    const t = a.store.createTask({ body_md: 'A' });
    await a.sync();
    await b.sync();
    a.advance(1000);
    a.store.pinTask(t.id);
    await a.sync();
    await b.sync();
    expect(isPinned(b.store.get('task', t.id))).toBe(true);
    expect(openIds(b.store)).toEqual([t.id]);
    b.advance(2000);
    b.store.unpinTask(t.id);
    await b.sync();
    await a.sync();
    expect(isPinned(a.store.get('task', t.id))).toBe(false);
  });

  it('导出写 pinned，导入读回来', async () => {
    const { store: src } = await open();
    const t = src.createTask({ body_md: '置顶的' });
    const u = src.createTask({ body_md: '普通的' });
    src.pinTask(t.id);
    const { files } = exportArchive(src);
    const text = (f: (typeof files)[number]) => (typeof f.data === 'string' ? f.data : new TextDecoder().decode(f.data));
    const md = files.filter((f) => f.path.endsWith('.md')).map(text);
    expect(md.some((s) => s.includes('置顶的') && /^pinned: /m.test(s))).toBe(true);
    expect(md.some((s) => s.includes('普通的') && /^pinned: /m.test(s))).toBe(false);
    const { store: dst } = await open(new MemoryAdapter(), 'dev2');
    applyImport(dst, planImport(dst, files));
    expect(dst.get('task', t.id)?.pinned_at).toBe(src.get('task', t.id)!.pinned_at);
    expect(dst.get('task', u.id)?.pinned_at).toBeNull();
  });
});
