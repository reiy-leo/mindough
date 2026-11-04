import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { SyncEngine } from '../src/sync/engine';
import { MemoryRemote } from '../src/sync/memory-remote';
import { ICON_COLORS, defaultIconColor, groupColor, normalizeIconColor } from '../src/icon-color';
import { local } from './helpers';

async function open(adapter = new MemoryAdapter(), deviceId = 'dev1', t0 = local(2026, 11, 4, 9).getTime()) {
  let t = t0;
  const store = await Store.open(adapter, { deviceId, now: () => new Date(t) });
  return { store, adapter, advance: (ms: number) => (t += ms), now: () => t };
}

const mk = (store: Store, color?: string | null) =>
  store.insert('group', { name: '搬家', icon: 'lucide:home', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto: true, ...(color !== undefined ? { color } : {}) });

const lum = (hex: string) => {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe('图标块色板（icon-color.ts）', () => {
  it('18 个颜色，id 和色值都不重复，白色图标对比度约 3.5:1（不低于 3.45）', () => {
    expect(ICON_COLORS.length).toBe(18);
    expect(new Set(ICON_COLORS.map((c) => c.id)).size).toBe(18);
    expect(new Set(ICON_COLORS.map((c) => c.hex)).size).toBe(18);
    for (const c of ICON_COLORS) expect(1.05 / (lum(c.hex) + 0.05), c.id).toBeGreaterThanOrEqual(3.45);
  });
  it('整理颜色：大写转小写，认不出来是 null', () => {
    expect(normalizeIconColor('#E45D58')).toBe('#e45d58');
    expect(normalizeIconColor('red')).toBeNull();
    expect(normalizeIconColor('#abc')).toBeNull();
    expect(normalizeIconColor(null)).toBeNull();
  });
  it('默认色按 id 稳定，只从彩色里挑', () => {
    const colored = ICON_COLORS.slice(0, -3).map((c) => c.hex);
    expect(defaultIconColor('a')).toBe(defaultIconColor('a'));
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = defaultIconColor(`id-${i}`);
      expect(colored).toContain(c);
      seen.add(c);
    }
    expect(seen.size).toBeGreaterThan(8);
    expect(groupColor({ id: 'x', color: null })).toBe(defaultIconColor('x'));
    expect(groupColor({ id: 'x', color: '#123456' })).toBe('#123456');
  });
});

describe('项目颜色（group.color，v16）', () => {
  it('新建不选是空；updateGroup 改颜色，没变不写，认不出来当空', async () => {
    const { store } = await open();
    const g = mk(store);
    expect(store.get('group', g.id)?.color ?? null).toBeNull();
    store.updateGroup(g.id, { color: '#4786EE' });
    expect(store.get('group', g.id)?.color).toBe('#4786ee');
    const before = store.get('group', g.id)!.updated_at;
    store.updateGroup(g.id, { color: '#4786ee' });
    expect(store.get('group', g.id)!.updated_at).toBe(before);
    store.updateGroup(g.id, { color: 'nope' });
    expect(store.get('group', g.id)?.color).toBeNull();
  });

  it('存进 SQLite 再读回来还在', async () => {
    const adapter = new MemoryAdapter();
    const { store } = await open(adapter);
    const g = mk(store, '#259d3c');
    await store.flush();
    const { store: again } = await open(adapter);
    expect(again.get('group', g.id)?.color).toBe('#259d3c');
  });

  it('老客户端写来的行没有 color：当成空', async () => {
    const { store } = await open();
    const g = mk(store, '#259d3c');
    const old = { ...store.get('group', g.id)!, updated_at: '9999999999999-0000-old' } as Record<string, unknown>;
    delete old.color;
    store.applyRemote([{ table: 'group', row: old } as never]);
    expect(store.get('group', g.id)?.color).toBeNull();
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
    const g = mk(a.store, '#9c72e6');
    await a.sync();
    await b.sync();
    expect(b.store.get('group', g.id)?.color).toBe('#9c72e6');
    b.advance(1000);
    b.store.updateGroup(g.id, { color: '#e05a83' });
    await b.sync();
    await a.sync();
    expect(a.store.get('group', g.id)?.color).toBe('#e05a83');
  });
});
