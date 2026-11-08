/** 任务心情（Rei 2026-11-08「日记的心情属性在普通任务属性中也可以添加」）：task.mood（v19）的存储、同步、导入导出，以及不进心情河流。 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { SqlAdapter, migrate } from '../src/storage/sql';
import { MIGRATIONS, SCHEMA_VERSION } from '../src/storage/schema';
import { SyncEngine } from '../src/sync/engine';
import { MemoryRemote } from '../src/sync/memory-remote';
import { applyImport, exportArchive, planImport } from '../src/archive';
import { local } from './helpers';
import { NodeSqliteDriver } from './sql-drivers';

async function open(adapter: MemoryAdapter | SqlAdapter = new MemoryAdapter(), deviceId = 'dev1') {
  let t = local(2026, 11, 8, 9).getTime();
  const store = await Store.open(adapter, { deviceId, now: () => new Date(t) });
  return { store, advance: (ms: number) => (t += ms), now: () => t };
}

describe('任务心情 task.mood（v19）', () => {
  it('新建默认没有心情；能设、能清', async () => {
    const { store } = await open();
    const t = store.createTask({ body_md: 'A' });
    expect(t.mood).toBeNull();
    store.updateTask(t.id, { mood: 'happy' });
    expect(store.get('task', t.id)!.mood).toBe('happy');
    store.updateTask(t.id, { mood: null });
    expect(store.get('task', t.id)!.mood).toBeNull();
  });

  it('迁移：v18 的老库升到 v19，老任务 mood 是空，能读能写', async () => {
    const d = new NodeSqliteDriver();
    expect(await migrate(d, MIGRATIONS.filter((m) => m.version <= 18))).toBe(18);
    await d.run(
      `INSERT INTO "task" ("id","updated_at","deleted","body_md","status","completion_mode","sort","created_at") VALUES ('t-old','0000000000001-0000-dev0',0,'老任务','待办','once',1,'2026-11-01T00:00:00.000Z')`,
    );
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(19);
    expect(await migrate(d)).toBe(SCHEMA_VERSION);
    const cols = (await d.all<{ name: string }>(`PRAGMA table_info("task")`)).map((c) => c.name);
    expect(cols).toContain('mood');
    const { store } = await open(new SqlAdapter(d));
    expect(store.get('task', 't-old')?.mood ?? null).toBeNull();
    store.updateTask('t-old', { mood: 'tired' });
    await store.flush();
    const { store: again } = await open(new SqlAdapter(d));
    expect(again.get('task', 't-old')?.mood).toBe('tired');
  });

  it('老客户端写来的行没有 mood：补成空', async () => {
    const { store } = await open();
    const t = store.createTask({ body_md: 'A' });
    const old = { ...store.get('task', t.id)!, updated_at: '9999999999999-0000-old' } as Record<string, unknown>;
    delete old.mood;
    store.applyRemote([{ table: 'task', row: old } as never]);
    expect(store.get('task', t.id)?.mood).toBeNull();
  });

  it('同步到另一台设备', async () => {
    const remote = new MemoryRemote();
    const dev = async (id: string) => {
      const d = await open(new MemoryAdapter(), id);
      const engine = new SyncEngine(d.store, remote.transport(), { account: 'rei@example.com', now: () => new Date(d.now()), timers: { set: () => 0, clear: () => {} } });
      return { ...d, sync: () => engine.syncNow() };
    };
    const a = await dev('devA');
    const b = await dev('devB');
    const t = a.store.createTask({ body_md: 'A' });
    a.advance(1000);
    a.store.updateTask(t.id, { mood: 'calm' });
    await a.sync();
    await b.sync();
    expect(b.store.get('task', t.id)?.mood).toBe('calm');
  });

  it('导出写 mood，导入读回来；认不出的值导入成空', async () => {
    const { store: src } = await open();
    const t = src.createTask({ body_md: '有心情的' });
    const u = src.createTask({ body_md: '没心情的' });
    src.updateTask(t.id, { mood: 'grateful' });
    const { files } = exportArchive(src);
    const text = (f: (typeof files)[number]) => (typeof f.data === 'string' ? f.data : new TextDecoder().decode(f.data));
    const md = files.filter((f) => f.path.endsWith('.md')).map(text);
    expect(md.some((s) => s.includes('有心情的') && /^mood: grateful$/m.test(s))).toBe(true);
    expect(md.some((s) => s.includes('没心情的') && /^mood: /m.test(s))).toBe(false);
    const { store: dst } = await open(new MemoryAdapter(), 'dev2');
    applyImport(dst, planImport(dst, files));
    expect(dst.get('task', t.id)?.mood).toBe('grateful');
    expect(dst.get('task', u.id)?.mood).toBeNull();
    const bad = files.map((f) => (f.path.endsWith('.md') && text(f).includes('有心情的') ? { ...f, data: new TextEncoder().encode(text(f).replace('mood: grateful', 'mood: 开心')) } : f));
    const { store: dst2 } = await open(new MemoryAdapter(), 'dev3');
    applyImport(dst2, planImport(dst2, bad));
    expect(dst2.get('task', t.id)?.mood).toBeNull();
  });
});
