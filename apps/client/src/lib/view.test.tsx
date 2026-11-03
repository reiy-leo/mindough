// @vitest-environment happy-dom
/**
 * 列表行（Rei 2026-11-03）：第一行是任务标题（正文第一行），挂的资料只显示缩略图——第一条资料的图，没图就不显示。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BUILTIN_TYPE_IDS as T, MemoryAdapter, Store } from '@mindough/core';
import { titleOf, viewOf } from './view';
import { TaskThumb } from '../components/TaskRow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const POSTER = 'https://img.example.com/dune.jpg';
const now = new Date(2026, 10, 3, 21);

async function open() {
  return Store.open(new MemoryAdapter(), { deviceId: 'd', now: () => now });
}

describe('viewOf：标题和缩略图', () => {
  it('挂了有海报的电影：标题是正文第一行，缩略图是海报（竖版）', async () => {
    const s = await open();
    const item = s.createLibraryItem(T.movie, { name: '沙丘 2', image: POSTER });
    const t = s.createTask({ type_id: T.movie, library_item_id: item.id, body_md: '任务A' });
    const v = viewOf(s, t);
    expect(v.title).toBe('任务A');
    expect(titleOf(s, t)).toBe('任务A');
    expect(v.media).toBe(POSTER);
    expect(v.thumbLayout).toBe('poster');
    expect(v.hasItem).toBe(true);
  });

  it('挂了没海报的电影：没有缩略图', async () => {
    const s = await open();
    const item = s.createLibraryItem(T.movie, { name: '沙丘 2' });
    const t = s.createTask({ type_id: T.movie, library_item_id: item.id, body_md: '任务A' });
    const v = viewOf(s, t);
    expect(v.title).toBe('任务A');
    expect(v.media).toBeNull();
    expect(v.hasItem).toBe(true);
  });

  it('挂了好几条：用第一条的图', async () => {
    const s = await open();
    const a = s.createLibraryItem(T.movie, { name: 'A', image: 'https://img.example.com/a.jpg' });
    const b = s.createLibraryItem(T.movie, { name: 'B', image: 'https://img.example.com/b.jpg' });
    const t = s.createTask({ type_id: T.movie, library_item_id: a.id, body_md: '连看' });
    s.setTaskItems(t.id, [a.id, b.id]);
    expect(viewOf(s, s.get('task', t.id)!).media).toBe('https://img.example.com/a.jpg');
  });

  it('没挂资料：hasItem 为 false', async () => {
    const s = await open();
    const t = s.createTask({ body_md: '买菜' });
    const v = viewOf(s, t);
    expect(v.hasItem).toBe(false);
    expect(v.media).toBeNull();
  });
});

describe('TaskThumb', () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('有图：显示图，按版式给尺寸类名', () => {
    act(() => root.render(<TaskThumb media={POSTER} layout="poster" isAvatar={false} hasItem />));
    const img = host.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(POSTER);
    expect(img.className).toContain('thumb-poster');
  });

  it('挂了资料但没图：什么都不显示（不用类型图标、不用渐变占位）', () => {
    act(() => root.render(<TaskThumb media={null} layout="poster" isAvatar={false} hasItem name="沙丘 2" />));
    expect(host.innerHTML).toBe('');
  });

  it('没挂资料、有版式的类型：照旧显示类型图标', () => {
    act(() => root.render(<TaskThumb media={null} layout="poster" isAvatar={false} />));
    expect(host.querySelector('.thumb-icon')).not.toBeNull();
  });
});
