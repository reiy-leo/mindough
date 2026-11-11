/**
 * 只有「置顶」是内置类型（Rei 2026-11-12 04:20「限制只有置顶是内置类型」）：
 * - 「置顶」锁定：改名、图标、颜色、分组、常用 / 普通 / 不显示都改不了（Store 挡住），老客户端改过的打开 / 同步时改回内置定义；
 * - 原来内置的 27 个变成普通类型：id 和挂着的任务不动，名字照旧（界面 dataLabel 多语言显示），能改能归档；
 * - 新库不再预置那 27 个，只有任务 / 项目指着、本机缺行时补回（内置戳，任何真改动都盖得过它）。
 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { SyncEngine } from '../src/sync/engine';
import { MemoryRemote } from '../src/sync/memory-remote';
import { FORMER_BUILTIN_CATEGORIES, FORMER_BUILTIN_CATEGORY_IDS, IMPORTANT_CATEGORY_ID, PIN_CATEGORY, PIN_CATEGORY_ID, STAR_CATEGORY, STAR_CATEGORY_ID, URGENT_CATEGORY_ID } from '../src/seed/builtin-checkin-categories';
import { CATEGORY_FREQUENT_PREF, CATEGORY_GROUP_PREF } from '../src/category-prefs';
import { prefId } from '../src/related';
import { isBuiltinCategory, titleMarkOf } from '../src/categories';
import type { Category } from '../src/types';
import { local } from './helpers';

async function open(adapter = new MemoryAdapter(), deviceId = 'dev1') {
  let t = local(2026, 11, 12, 9).getTime();
  const store = await Store.open(adapter, { deviceId, now: () => new Date((t += 1000)) });
  return { store, adapter };
}
const engine = (store: Store, remote: MemoryRemote) =>
  new SyncEngine(store, remote.transport(), { account: 'rei@example.com', timers: { set: () => 0, clear: () => {} } });
const wire = (table: string, row: Record<string, unknown>) => ({ table, id: row.id, updated_at: row.updated_at, deleted: !!row.deleted, row }) as never;
const SPORT = FORMER_BUILTIN_CATEGORY_IDS.sport;

describe('「置顶」锁定', () => {
  it('只有置顶、收藏、紧急、重要算内置', () => {
    expect(isBuiltinCategory(PIN_CATEGORY_ID)).toBe(true);
    expect([STAR_CATEGORY_ID, URGENT_CATEGORY_ID, IMPORTANT_CATEGORY_ID].every((id) => isBuiltinCategory(id))).toBe(true);
    expect(isBuiltinCategory(SPORT)).toBe(false);
    expect(FORMER_BUILTIN_CATEGORIES.some((c) => isBuiltinCategory(c))).toBe(false);
  });

  it('改名、图标、颜色、不显示、档位、分组、顺序都不生效', async () => {
    const { store } = await open();
    expect(store.isCategoryLocked(PIN_CATEGORY_ID)).toBe(true);
    const before = { ...store.get('category', PIN_CATEGORY_ID)! };
    expect(store.updateCategory(PIN_CATEGORY_ID, { name: '钉住', icon: 'star', color: '#000000', hidden: true })).toBe(false);
    expect(store.setCategoryState(PIN_CATEGORY_ID, 'frequent')).toBe('normal');
    expect(store.setCategoryState(PIN_CATEGORY_ID, 'hidden')).toBe('normal');
    store.setCategoryGroup(PIN_CATEGORY_ID, 'body');
    store.reorderCategories([PIN_CATEGORY_ID]);
    expect(store.get('category', PIN_CATEGORY_ID)).toEqual(before);
    expect(store.categoryState(PIN_CATEGORY_ID)).toBe('normal');
    expect(store.categoryGroup(PIN_CATEGORY_ID)).toBe('other');
    expect(store.frequentCategoryIds()).not.toContain(PIN_CATEGORY_ID);
    expect(() => store.remove('category', PIN_CATEGORY_ID)).toThrow();
  });

  it('别的路径直接写它（store.update）也按内置定义写', async () => {
    const { store } = await open();
    store.update('category', PIN_CATEGORY_ID, { name: '钉住', hidden: true });
    expect(store.get('category', PIN_CATEGORY_ID)).toMatchObject({ name: '置顶', icon: 'pin', color: PIN_CATEGORY.color, hidden: false });
  });

  it('老客户端改过名、设过不显示、设过常用和分组：打开时改回内置定义（新时间戳，同步出去），偏好里的不算', async () => {
    const adapter = new MemoryAdapter();
    const drift: Category = { ...PIN_CATEGORY, updated_at: '0000000000009-0000-old', name: '钉住', icon: 'star', color: '#123456', hidden: true };
    await adapter.applyChanges([
      { table: 'category', row: drift },
      { table: 'pref', row: { id: prefId(CATEGORY_FREQUENT_PREF), key: CATEGORY_FREQUENT_PREF, updated_at: '0000000000009-0000-old', deleted: false, value: [PIN_CATEGORY_ID] } as never },
      { table: 'pref', row: { id: prefId(CATEGORY_GROUP_PREF), key: CATEGORY_GROUP_PREF, updated_at: '0000000000009-0000-old', deleted: false, value: [`${PIN_CATEGORY_ID}=body`] } as never },
    ]);
    const { store } = await open(adapter);
    const row = store.get('category', PIN_CATEGORY_ID)!;
    expect(row).toMatchObject({ name: '置顶', icon: 'pin', color: PIN_CATEGORY.color, hidden: false });
    expect(row.updated_at > drift.updated_at).toBe(true);
    expect(store.pinEnabled()).toBe(true);
    expect(store.categoryState(PIN_CATEGORY_ID)).toBe('normal');
    expect(store.categoryGroup(PIN_CATEGORY_ID)).toBe('other');
  });

  it('同步拉到老客户端改过的「置顶」：改回去并推回云端', async () => {
    const remote = new MemoryRemote();
    const a = (await open(new MemoryAdapter(), 'A')).store;
    const ea = engine(a, remote);
    await ea.start();
    // 老客户端在云端改了名、设了不显示
    remote.push([wire('category', { ...PIN_CATEGORY, updated_at: '1800000000000-0000-old', name: '钉住', hidden: true })]);
    await ea.syncNow();
    expect(a.get('category', PIN_CATEGORY_ID)).toMatchObject({ name: '置顶', hidden: false });
    await ea.syncNow();
    expect((remote.get('category', PIN_CATEGORY_ID)?.row as Category | undefined)?.name).toBe('置顶');
    const b = (await open(new MemoryAdapter(), 'B')).store;
    const eb = engine(b, remote);
    await eb.start();
    await eb.syncNow();
    expect(b.get('category', PIN_CATEGORY_ID)).toMatchObject({ name: '置顶', hidden: false });
  });

  it('同名的自建「置顶」并进内置的，内置的不会被并掉', async () => {
    const adapter = new MemoryAdapter();
    await adapter.applyChanges([{ table: 'category', row: { id: '0190aaaa-0000-7000-8000-000000000001', updated_at: '0000000000009-0000-old', deleted: false, name: '置顶', icon: 'tag', color: '#8e8e93', builtin: false, hidden: false, sort: -5, merged_into: null } as never }]);
    const { store } = await open(adapter);
    expect(store.get('category', PIN_CATEGORY_ID)).toMatchObject({ deleted: false, merged_into: null });
    expect(store.raw('category', '0190aaaa-0000-7000-8000-000000000001')).toMatchObject({ deleted: true, merged_into: PIN_CATEGORY_ID });
  });
});

describe('原来内置的 27 个变成普通类型', () => {
  it('新库不预置它们，只有四个内置类型', async () => {
    const { store } = await open();
    expect(store.categories(true).map((c) => c.id)).toEqual([PIN_CATEGORY_ID, STAR_CATEGORY_ID, URGENT_CATEGORY_ID, IMPORTANT_CATEGORY_ID]);
  });

  it('老数据里改过名、设过不显示的照旧（不恢复默认），还能接着改、归档', async () => {
    const adapter = new MemoryAdapter();
    const sport = FORMER_BUILTIN_CATEGORIES.find((c) => c.id === SPORT)!;
    await adapter.applyChanges([
      { table: 'category', row: { ...sport, updated_at: '0000000000009-0000-old', name: '健身', hidden: true } },
      { table: 'category', row: { ...FORMER_BUILTIN_CATEGORIES[0]! } },
    ]);
    const { store } = await open(adapter);
    expect(store.get('category', SPORT)).toMatchObject({ name: '健身', hidden: true });
    expect(store.get('category', FORMER_BUILTIN_CATEGORIES[0]!.id)?.name).toBe('记录');
    expect(store.isCategoryLocked(SPORT)).toBe(false);
    expect(store.updateCategory(SPORT, { name: '跑步', icon: 'footprints', color: '#00aa00', hidden: false })).toBe(true);
    expect(store.get('category', SPORT)).toMatchObject({ name: '跑步', icon: 'footprints', hidden: false });
    expect(store.setCategoryState(SPORT, 'frequent')).toBe('normal');
    expect(store.categoryState(SPORT)).toBe('frequent');
    store.setCategoryGroup(SPORT, 'hobby');
    expect(store.categoryGroup(SPORT)).toBe('hobby');
    store.setCategoryState(SPORT, 'hidden');
    expect(store.categoryState(SPORT)).toBe('hidden');
  });

  it('任务指着却缺行（新设备、新库）：补回原定义那一行（内置戳），挂着的照常显示', async () => {
    const { store } = await open();
    const t = store.createTask({ body_md: '跑步', category_id: SPORT });
    expect(store.categoryOf(store.get('task', t.id)!)?.name).toBe('运动');
    expect(store.get('category', SPORT)?.updated_at).toBe('0000000000000-0000-builtin');
    expect(store.categories(true).map((c) => c.id).sort()).toEqual([PIN_CATEGORY_ID, STAR_CATEGORY_ID, URGENT_CATEGORY_ID, IMPORTANT_CATEGORY_ID, SPORT].sort());
  });

  it('补回的行不会盖掉云端改过的：拉下来改过的名字赢', async () => {
    const remote = new MemoryRemote();
    const a = (await open(new MemoryAdapter(), 'A')).store;
    const t = a.createTask({ body_md: '跑步', category_id: SPORT });
    a.updateCategory(SPORT, { name: '健身' });
    const ea = engine(a, remote);
    await ea.start();
    await ea.syncNow();
    const b = (await open(new MemoryAdapter(), 'B')).store;
    b.createTask({ body_md: '本机先建的', category_id: SPORT });
    expect(b.get('category', SPORT)?.name).toBe('运动');
    const eb = engine(b, remote);
    await eb.start();
    await eb.syncNow();
    expect(b.get('category', SPORT)?.name).toBe('健身');
    expect(b.categoryOf(b.get('task', t.id)!)?.name).toBe('健身');
  });
});

describe('收藏 / 紧急 / 重要（Rei 2026-11-12 04:41）', () => {
  it('标题颜色：紧急 > 重要 > 收藏；置顶不变色', () => {
    expect(titleMarkOf([])).toBeNull();
    expect(titleMarkOf([PIN_CATEGORY_ID])).toBeNull();
    expect(titleMarkOf([STAR_CATEGORY_ID])).toBe('star');
    expect(titleMarkOf([STAR_CATEGORY_ID, IMPORTANT_CATEGORY_ID])).toBe('important');
    expect(titleMarkOf([IMPORTANT_CATEGORY_ID, URGENT_CATEGORY_ID, STAR_CATEGORY_ID])).toBe('urgent');
  });

  it('挂上就变色，不当主类型，不进列表第二行的类型；锁定改不了', async () => {
    const { store } = await open();
    const t = store.createTask({ body_md: '交房租', category_id: SPORT });
    store.setTaskCategories(t.id, [URGENT_CATEGORY_ID, SPORT, STAR_CATEGORY_ID]);
    expect(store.titleMark(t.id)).toBe('urgent');
    expect(store.get('task', t.id)!.category_id).toBe(SPORT);
    expect(store.categoriesOfTaskNoPin(t.id).map((c) => c.id)).toEqual([SPORT]);
    store.setTaskCategories(t.id, [STAR_CATEGORY_ID]);
    expect(store.get('task', t.id)!.category_id).toBeNull();
    expect(store.titleMark(t.id)).toBe('star');
    expect(store.updateCategory(STAR_CATEGORY_ID, { name: '星标' })).toBe(false);
    expect(store.setCategoryState(URGENT_CATEGORY_ID, 'hidden')).toBe('normal');
    expect(store.get('category', STAR_CATEGORY_ID)).toMatchObject({ name: STAR_CATEGORY.name, hidden: false });
  });
});
