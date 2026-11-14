// @vitest-environment happy-dom
/**
 * 影人 ↔ 影片（Rei 2026-11-14 影人库）：观看任务状态怎么取；影人详情「作品」按年份列、写角色和状态；
 * 影视详情「主创」只列连上的影人；没连时的空状态。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BUILTIN_TYPE_IDS, MemoryAdapter, Store } from '@mindough/core';

const toast = vi.fn();
vi.mock('../../lib/ui', () => ({ useUi: () => ({ toast }) }));

import { FilmLinksSection, filmTaskStatus } from './FilmLinks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let store: Store;
beforeEach(async () => {
  store = await Store.open(new MemoryAdapter(), { deviceId: 'd' });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const rows = () => [...host.querySelectorAll('.flink-row')].map((r) => [r.querySelector('.flink-name')?.textContent, r.querySelector('.flink-meta')?.textContent ?? '', r.querySelector('.flink-status')?.textContent ?? null]);

describe('观看任务状态', () => {
  it('有没做完的写进行中 / 待办；都做完了写最近结束那件；没有任务 null', () => {
    expect(filmTaskStatus([])).toBeNull();
    expect(filmTaskStatus([{ status: '完成', done_at: '2026-01-01', created_at: '2025' }, { status: '待办', done_at: null, created_at: '2026' }])).toBe('待办');
    expect(filmTaskStatus([{ status: '待办', done_at: null, created_at: '2026' }, { status: '进行中', done_at: null, created_at: '2026' }])).toBe('进行中');
    expect(filmTaskStatus([{ status: '完成', done_at: '2026-01-01', created_at: '2025' }, { status: '关闭', done_at: '2026-03-01', created_at: '2025' }])).toBe('关闭');
  });
});

describe('作品 / 主创', () => {
  it('影人详情：按年份新的在前，写年份 · 角色和状态；影视详情：只列连上的影人', () => {
    const p = store.createLibraryItem(BUILTIN_TYPE_IDS.filmPerson, { name: '诺兰' });
    const a = store.createLibraryItem(BUILTIN_TYPE_IDS.movie, { name: '记忆碎片', fields: { year: 2000 } });
    const b = store.createLibraryItem(BUILTIN_TYPE_IDS.movie, { name: '奥本海默', fields: { year: 2023 } });
    store.createLibraryItem(BUILTIN_TYPE_IDS.filmPerson, { name: '没连的人' });
    store.linkLibraryItems(p.id, a.id, '导演');
    store.linkLibraryItems(p.id, b.id, '导演、编剧');
    store.createTask({ body_md: '看奥本海默', type_id: BUILTIN_TYPE_IDS.movie, library_item_id: b.id, status: '进行中' });
    act(() => root.render(<FilmLinksSection store={store} item={store.get('library_item', p.id)!} side="works" />));
    expect(host.querySelector('.section-title')?.textContent).toBe('作品 2');
    expect(rows()).toEqual([
      ['奥本海默', '2023 · 导演、编剧', '进行中'],
      ['记忆碎片', '2000 · 导演', '没有任务'],
    ]);
    act(() => root.render(<FilmLinksSection store={store} item={store.get('library_item', b.id)!} side="credits" />));
    expect(host.querySelector('.section-title')?.textContent).toBe('主创 1');
    expect(rows()).toEqual([['诺兰', '导演、编剧', null]]);
    expect(host.querySelector('.flink-row .art')?.classList.contains('art-round')).toBe(true);
  });

  it('没连时写空状态，按钮还在', () => {
    const m = store.createLibraryItem(BUILTIN_TYPE_IDS.movie, { name: '千与千寻', fields: { year: 2001 } });
    act(() => root.render(<FilmLinksSection store={store} item={m} side="credits" />));
    expect(host.textContent).toContain('还没有关联的影人。');
    expect(host.querySelector('.flink-add')?.textContent).toContain('关联影人');
  });
});
