/**
 * 草稿任务（Rei 2026-11-12 06:52 日历「+」）：先在内存里建、开详情，正文空着关掉就丢，不落盘、不进 outbox。
 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { toDateKey } from '../src/dates';
import { local } from './helpers';

async function open() {
  const adapter = new MemoryAdapter();
  const store = await Store.open(adapter, { deviceId: 'dev1', now: () => local(2026, 11, 12, 9) });
  await store.flush();
  const pushed: string[] = [];
  store.onLocalWrite((cs) => pushed.push(...cs.map((c) => `${c.table}:${c.row.id}`)));
  return { store, adapter, pushed };
}

describe('草稿任务', () => {
  it('建了界面看得见，但不进 outbox；丢掉什么都不写', async () => {
    const { store, adapter, pushed } = await open();
    const v = store.version;
    const t = store.createDraftTask({ body_md: '', scheduled_date: '2026-11-20' });
    expect(store.version).toBeGreaterThan(v);
    expect(store.get('task', t.id)?.scheduled_date).toBe('2026-11-20');
    expect(store.isDraftTask(t.id)).toBe(true);
    expect(pushed).toEqual([]);
    expect(store.discardDraftTask(t.id)).toBe(true);
    expect(store.get('task', t.id)).toBeUndefined();
    expect(pushed).toEqual([]);
    await store.flush();
    const snap = await adapter.loadAll();
    expect(snap.task.some((r) => r.id === t.id)).toBe(false);
  });

  it('改了正文就落盘并进 outbox，之后是普通任务；不能再丢', async () => {
    const { store, adapter, pushed } = await open();
    const t = store.createDraftTask({ body_md: '', scheduled_date: '2026-11-20' });
    store.updateTask(t.id, { body_md: '看牙' });
    expect(store.isDraftTask(t.id)).toBe(false);
    expect(pushed.filter((x) => x === `task:${t.id}`).length).toBeGreaterThanOrEqual(1);
    expect(store.discardDraftTask(t.id)).toBe(false);
    await store.flush();
    const snap = await adapter.loadAll();
    expect(snap.task.find((r) => r.id === t.id)?.body_md).toBe('看牙');
  });

  it('日期是今天：建草稿时不进我的一天，落盘时才进', async () => {
    const { store } = await open();
    const today = toDateKey(store.now());
    const t = store.createDraftTask({ body_md: '', scheduled_date: today });
    expect(store.isInMyDay(t.id)).toBe(false);
    store.updateTask(t.id, { body_md: '交水费' });
    expect(store.isInMyDay(t.id)).toBe(true);
  });

  it('别的行指着它（挂类型）也先把它落盘', async () => {
    const { store, pushed } = await open();
    const c = store.createCategory('家务');
    const t = store.createDraftTask({ body_md: '' });
    store.setTaskCategories(t.id, [c.id]);
    expect(store.isDraftTask(t.id)).toBe(false);
    expect(pushed).toContain(`task:${t.id}`);
  });

  it('deleteTask 删草稿：直接丢掉，不写墓碑', async () => {
    const { store, pushed } = await open();
    const t = store.createDraftTask({ body_md: '' });
    store.deleteTask(t.id);
    expect(store.get('task', t.id)).toBeUndefined();
    expect(pushed).toEqual([]);
  });
});
