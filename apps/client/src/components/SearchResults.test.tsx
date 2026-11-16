// @vitest-environment happy-dom
/**
 * 搜索结果里的任务行（⌘F 浮层和手机搜索页共用）。Rei 2026-11-16：完成 / 关闭的任务灰掉（行上挂 is-done / is-closed，
 * 标题只变灰），不放「加入我的一天」；待办 / 进行中照旧。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Task } from '@mindough/core';

const tasks = vi.hoisted(() => new Map<string, Task>());
const store = vi.hoisted(() => ({
  get: (_kind: string, id: string) => tasks.get(id),
  isPinned: () => false,
  isInMyDay: () => false,
}));
vi.mock('../store/StoreProvider', () => ({ useStore: () => store }));
vi.mock('../lib/ui', () => ({ useUi: () => ({}) }));
vi.mock('../lib/actions', () => ({ toggleMyDay: vi.fn() }));
vi.mock('../lib/router', () => ({ navigate: vi.fn() }));
vi.mock('../lib/view', () => ({ viewOf: () => ({ media: null, thumbLayout: 'none', mediaIsAvatar: false, type: null, hasItem: false }), imageUrl: () => '' }));
vi.mock('./TaskRow', () => ({ TaskThumb: () => <span className="thumb" /> }));
vi.mock('./library/Library', () => ({ ItemArt: () => null, artShape: () => 'poster' }));
vi.mock('./journal/MoodIcon', () => ({ MoodIcon: () => null }));
vi.mock('./Avatar', () => ({ Avatar: () => null }));
vi.mock('./project/GroupIcon', () => ({ GroupIcon: () => null }));

import { SearchTaskRow } from './SearchResults';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLUListElement;
beforeEach(() => {
  tasks.clear();
  host = document.createElement('ul');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function row(status: string) {
  tasks.set('t', { id: 't', body_md: '买菜', status } as unknown as Task);
  act(() => root.render(<SearchTaskRow id="t" title="买菜" snippet="" onOpen={() => {}} />));
  return host.querySelector('li.palette-item')!;
}

describe('搜索结果的任务行', () => {
  it.each(['待办', '进行中'])('%s：照旧，有「加入我的一天」，不灰', (status) => {
    const li = row(status);
    expect(li.classList.contains('is-done')).toBe(false);
    expect(li.classList.contains('is-closed')).toBe(false);
    expect(li.querySelector('.palette-add')).toBeTruthy();
  });
  it('完成：is-done，没有「加入我的一天」', () => {
    const li = row('完成');
    expect(li.classList.contains('is-done')).toBe(true);
    expect(li.querySelector('.palette-add')).toBeNull();
    expect(li.querySelector('.palette-title')!.textContent).toBe('买菜');
  });
  it('关闭：is-closed，没有「加入我的一天」', () => {
    const li = row('关闭');
    expect(li.classList.contains('is-closed')).toBe(true);
    expect(li.querySelector('.palette-add')).toBeNull();
  });
});
