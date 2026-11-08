/**
 * 项目的「默认日期：今天」（Rei 2026-11-09 03:52「项目编辑、新建弹窗中，添加"默认日期：今天" switch，on 则新建任务自动添加目标日期今天」）：
 * group.default_date_today（v20），默认关；updateGroup 改得动、没变不写；老库迁移、老客户端的行读成关；
 * 带今天日期新建的任务进我的一天只有一行（joinMyDayOnToday + 之后的 addToMyDay / syncAutoMyDay 都是同一行）。
 * 界面怎么用这个开关在 client（lib/quick-add todayDefaults、pages/Groups、App 的 N）。
 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { SqlAdapter, migrate } from '../src/storage/sql';
import { MIGRATIONS, SCHEMA_VERSION } from '../src/storage/schema';
import { entriesFor } from '../src/myday';
import { toDateKey } from '../src/dates';
import { local } from './helpers';
import { NodeSqliteDriver } from './sql-drivers';

async function open(adapter: MemoryAdapter | SqlAdapter = new MemoryAdapter()) {
  const t = local(2026, 11, 9, 9).getTime();
  return Store.open(adapter, { deviceId: 'dev1', now: () => new Date(t) });
}
const group = (store: Store, extra: Record<string, unknown> = {}) =>
  store.insert('group', { name: '搬家', icon: '🏠', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto: true, ...extra });

describe('group.default_date_today', () => {
  it('默认关；updateGroup 打开、关上，没变不写', async () => {
    const store = await open();
    const g = group(store);
    expect(store.get('group', g.id)?.default_date_today === true).toBe(false);
    store.updateGroup(g.id, { default_date_today: true });
    expect(store.get('group', g.id)?.default_date_today).toBe(true);
    const stamp = store.get('group', g.id)!.updated_at;
    store.updateGroup(g.id, { default_date_today: true });
    expect(store.get('group', g.id)!.updated_at).toBe(stamp);
    store.updateGroup(g.id, { default_date_today: false });
    expect(store.get('group', g.id)?.default_date_today).toBe(false);
  });

  it('带今天日期新建的项目任务：我的一天只有一行，再 addToMyDay、自动加都不多', async () => {
    const store = await open();
    const g = group(store, { default_date_today: true });
    const today = toDateKey(store.now());
    const t = store.createTask({ body_md: 'x', group_id: g.id, scheduled_date: today });
    store.addToMyDay(t.id, today);
    store.syncAutoMyDay();
    expect(entriesFor(store.list('my_day'), today).filter((e) => e.task_id === t.id)).toHaveLength(1);
    expect(store.list('my_day').filter((e) => e.task_id === t.id && !e.deleted)).toHaveLength(1);
  });

  it('老客户端写来的行没有这个字段：读成关，不出错', async () => {
    const store = await open();
    const g = group(store, { default_date_today: true });
    const old = { ...store.get('group', g.id)!, updated_at: '9999999999999-0000-old' } as Record<string, unknown>;
    delete old.default_date_today;
    expect(() => store.applyRemote([{ table: 'group', row: old } as never])).not.toThrow();
    expect(store.get('group', g.id)?.default_date_today).toBe(false);
  });

  it('迁移：v19 的老库升到最新，老项目是关；打开后存得下', async () => {
    const d = new NodeSqliteDriver();
    expect(await migrate(d, MIGRATIONS.filter((m) => m.version <= 19))).toBe(19);
    await d.run(`INSERT INTO "group" ("id","updated_at","deleted","name","icon","my_day_auto") VALUES ('g-old','0000000000001-0000-dev0',0,'老项目','📁',1)`);
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(20);
    expect(await migrate(d)).toBe(SCHEMA_VERSION);
    const cols = (await d.all<{ name: string }>(`PRAGMA table_info("group")`)).map((c) => c.name);
    expect(cols).toContain('default_date_today');
    const store = await open(new SqlAdapter(d));
    expect(store.get('group', 'g-old')?.default_date_today).toBe(false);
    store.updateGroup('g-old', { default_date_today: true });
    await store.flush();
    const again = await open(new SqlAdapter(d));
    expect(again.get('group', 'g-old')?.default_date_today).toBe(true);
  });
});
