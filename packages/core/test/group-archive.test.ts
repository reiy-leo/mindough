/**
 * 项目归档（Rei 2026-11-05「项目可以归档」）：group.archived_at（v17）、Store.archiveGroup / unarchiveGroup，
 * 归档项目的任务不自动进我的一天、不进建议 / 待安排、不在 activeTasks 里；全局搜索（⌘F）还能搜到；老客户端的行不出错。
 */
// 日期是今天的任务都按「早就定好、今天到了」建（joinMyDay: false），不走「日期设成今天就放进我的一天」（myday-date-join.test.ts）
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { SqlAdapter, migrate } from '../src/storage/sql';
import { MIGRATIONS, SCHEMA_VERSION } from '../src/storage/schema';
import { SyncEngine } from '../src/sync/engine';
import { MemoryRemote } from '../src/sync/memory-remote';
import { entriesFor, recentlyUnlocked, suggestions } from '../src/myday';
import { inArchivedGroup, isGroupArchived } from '../src/group';
import { search } from '../src/search';
import { toDateKey } from '../src/dates';
import { local } from './helpers';
import { NodeSqliteDriver } from './sql-drivers';

async function open(adapter: MemoryAdapter | SqlAdapter = new MemoryAdapter(), deviceId = 'dev1', t0 = local(2026, 11, 5, 9).getTime()) {
  let t = t0;
  const store = await Store.open(adapter, { deviceId, now: () => new Date(t) });
  return { store, advance: (ms: number) => (t += ms), now: () => t };
}

const group = (store: Store, name = '搬家', my_day_auto = true) =>
  store.insert('group', { name, icon: '🏠', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto });

const today = (s: Store) => toDateKey(s.now());
const inDay = (s: Store) => entriesFor(s.list('my_day'), today(s)).map((e) => e.task_id);
const sugg = (s: Store) => {
  const tasks = s.list('task');
  const derived = s.derived();
  const unlocked = recentlyUnlocked(tasks, s.edges(), derived, new Date(s.now().getTime() - 24 * 3600_000).toISOString());
  return suggestions({ tasks, entries: s.list('my_day'), checkIns: s.list('check_in'), derived, recentlyUnlocked: unlocked, today: today(s), now: s.now(), groups: s.list('group') }).map((x) => x.task.id);
};

describe('归档 / 取消归档', () => {
  it('archiveGroup 记下时间，再归档不写；unarchiveGroup 清空，没归档的不写', async () => {
    const { store, advance } = await open();
    const g = group(store);
    expect(store.get('group', g.id)?.archived_at ?? null).toBeNull();
    expect(isGroupArchived(store.get('group', g.id))).toBe(false);
    advance(1000);
    store.archiveGroup(g.id);
    const at = store.get('group', g.id)!.archived_at;
    expect(at).toBe(new Date(local(2026, 11, 5, 9).getTime() + 1000).toISOString());
    expect(isGroupArchived(store.get('group', g.id))).toBe(true);
    const v = store.get('group', g.id)!.updated_at;
    advance(1000);
    store.archiveGroup(g.id);
    expect(store.get('group', g.id)!.updated_at).toBe(v);
    expect(store.get('group', g.id)!.archived_at).toBe(at);
    store.unarchiveGroup(g.id);
    expect(store.get('group', g.id)!.archived_at).toBeNull();
    const v2 = store.get('group', g.id)!.updated_at;
    store.unarchiveGroup(g.id);
    expect(store.get('group', g.id)!.updated_at).toBe(v2);
  });

  it('activeGroups / archivedGroups 分开，最近归档的在前；侧栏不显示归档的，取消后回来', async () => {
    const { store, advance } = await open();
    const a = group(store, 'A');
    const b = group(store, 'B');
    const c = group(store, 'C');
    store.setGroupInSidebar(a.id, true);
    store.setGroupInSidebar(b.id, true);
    store.archiveGroup(a.id);
    advance(1000);
    store.archiveGroup(c.id);
    expect(store.activeGroups().map((g) => g.id)).toEqual([b.id]);
    expect(store.archivedGroups().map((g) => g.id)).toEqual([c.id, a.id]);
    expect(store.sidebarGroups().map((g) => g.id)).toEqual([b.id]);
    // 侧栏偏好还记着，取消归档就回来
    expect(store.isGroupInSidebar(a.id)).toBe(true);
    store.unarchiveGroup(a.id);
    expect(store.sidebarGroups().map((g) => g.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('任务本身不动：状态、项目、日期都照旧', async () => {
    const { store } = await open();
    const g = group(store);
    const t = store.createTask({ body_md: '打包', group_id: g.id, scheduled_date: today(store) }, { joinMyDay: false });
    const before = store.get('task', t.id)!;
    store.archiveGroup(g.id);
    expect(store.get('task', t.id)).toEqual(before);
    expect(store.groupTasks(g.id).map((x) => x.id)).toEqual([t.id]);
  });
});

describe('归档项目的任务', () => {
  it('不自动进我的一天（my_day_auto 开着也跳过），取消归档后照常加进来', async () => {
    const { store } = await open();
    const g = group(store);
    const t = store.createTask({ body_md: '打包', group_id: g.id, scheduled_date: today(store) }, { joinMyDay: false });
    store.archiveGroup(g.id);
    expect(store.syncAutoMyDay()).toBe(0);
    expect(inDay(store)).not.toContain(t.id);
    store.unarchiveGroup(g.id);
    expect(store.syncAutoMyDay()).toBe(1);
    expect(inDay(store)).toContain(t.id);
  });

  it('不进建议（关着「出现在我的一天」的项目也一样），取消后回到建议', async () => {
    const { store } = await open();
    const g = group(store, '搬家', false);
    const t = store.createTask({ body_md: '打包', group_id: g.id, scheduled_date: today(store) }, { joinMyDay: false });
    expect(sugg(store)).toEqual([t.id]);
    store.archiveGroup(g.id);
    expect(sugg(store)).toEqual([]);
    store.unarchiveGroup(g.id);
    expect(sugg(store)).toEqual([t.id]);
  });

  it('不在待安排和 activeTasks 里；不在项目里的、别的项目的照旧', async () => {
    const { store } = await open();
    const g = group(store, '搬家');
    const other = group(store, '工作');
    const archived = store.createTask({ body_md: '没日期', group_id: g.id });
    const dated = store.createTask({ body_md: '有日期', group_id: g.id, scheduled_date: '2026-11-09' });
    const loose = store.createTask({ body_md: '散的' });
    const work = store.createTask({ body_md: '工作的', group_id: other.id });
    store.archiveGroup(g.id);
    expect(store.backlog().map((t) => t.id).sort()).toEqual([loose.id, work.id].sort());
    expect(store.activeTasks().map((t) => t.id).sort()).toEqual([loose.id, work.id].sort());
    expect(store.inArchivedGroup(dated)).toBe(true);
    expect(store.inArchivedGroup(loose)).toBe(false);
    expect(inArchivedGroup(dated, new Map(store.list('group').map((x) => [x.id, x])))).toBe(true);
    store.unarchiveGroup(g.id);
    expect(store.backlog().map((t) => t.id)).toContain(archived.id);
    expect(store.activeTasks()).toHaveLength(4);
  });

  it('⌘K 搜索还能搜到任务和项目', async () => {
    const { store } = await open();
    const g = group(store, '旧房子');
    const t = store.createTask({ body_md: '退押金', group_id: g.id });
    store.archiveGroup(g.id);
    const hits = search({
      tasks: store.list('task'),
      types: store.list('task_type'),
      people: store.list('person'),
      groups: store.list('group'),
      taskPeople: store.list('task_person'),
      items: store.list('library_item'),
      journal: store.list('journal_post'),
      taskItems: store.list('task_item'),
      taskCategories: store.list('task_category'),
      categories: store.list('category'),
    }, '退押金');
    expect(hits.some((h) => h.id === t.id)).toBe(true);
    const ghits = search({
      tasks: [],
      types: [],
      people: [],
      groups: store.list('group'),
      taskPeople: [],
      items: [],
      journal: [],
      taskItems: [],
      taskCategories: [],
      categories: [],
    }, '旧房子');
    expect(ghits.some((h) => h.id === g.id)).toBe(true);
  });
});

describe('存储和同步（v17）', () => {
  it('迁移：v16 的老库升到 v17，老项目的 archived_at 是空，能读能写', async () => {
    const d = new NodeSqliteDriver();
    expect(await migrate(d, MIGRATIONS.filter((m) => m.version <= 16))).toBe(16);
    await d.run(
      `INSERT INTO "group" ("id","updated_at","deleted","name","icon","my_day_auto") VALUES ('g-old','0000000000001-0000-dev0',0,'老项目','📁',1)`,
    );
    // 之后还有迁移（v18 任务置顶）：升到最新
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(17);
    expect(await migrate(d)).toBe(SCHEMA_VERSION);
    const cols = (await d.all<{ name: string }>(`PRAGMA table_info("group")`)).map((c) => c.name);
    expect(cols).toContain('archived_at');
    const { store } = await open(new SqlAdapter(d));
    expect(store.get('group', 'g-old')?.archived_at ?? null).toBeNull();
    store.archiveGroup('g-old');
    await store.flush();
    const { store: again } = await open(new SqlAdapter(d));
    expect(again.get('group', 'g-old')?.archived_at).toBeTruthy();
    expect(again.archivedGroups().map((g) => g.id)).toEqual(['g-old']);
  });

  it('老客户端写来的行没有 archived_at：当成没归档，不出错', async () => {
    const { store } = await open();
    const g = group(store);
    const old = { ...store.get('group', g.id)!, updated_at: '9999999999999-0000-old' } as Record<string, unknown>;
    delete old.archived_at;
    delete old.color;
    expect(() => store.applyRemote([{ table: 'group', row: old } as never])).not.toThrow();
    expect(store.get('group', g.id)?.archived_at).toBeNull();
    expect(store.activeGroups().map((x) => x.id)).toEqual([g.id]);
  });

  it('同步到另一台设备（行级 LWW）：归档、取消归档都过去', async () => {
    const remote = new MemoryRemote();
    const dev = async (id: string) => {
      const d = await open(new MemoryAdapter(), id);
      const engine = new SyncEngine(d.store, remote.transport(), { account: 'rei@example.com', now: () => new Date(d.now()), timers: { set: () => 0, clear: () => {} } });
      return { ...d, sync: () => engine.syncNow() };
    };
    const a = await dev('devA');
    const b = await dev('devB');
    const g = group(a.store);
    await a.sync();
    await b.sync();
    a.advance(1000);
    a.store.archiveGroup(g.id);
    await a.sync();
    await b.sync();
    expect(isGroupArchived(b.store.get('group', g.id))).toBe(true);
    b.advance(2000);
    b.store.unarchiveGroup(g.id);
    await b.sync();
    await a.sync();
    expect(isGroupArchived(a.store.get('group', g.id))).toBe(false);
  });
});
