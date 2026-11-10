// @vitest-environment happy-dom
/**
 * 时间轴（Rei 2026-11-10「时间轴中不显示已完成的任务，不显示任务详情，点击任务不显示详情侧边栏」）：
 * 完成、关闭的任务不列；每一行都只要日期定位小字（TaskRow dateMetaOnly）。点开用浮层由 lib/detail-pane 管，测试在 detail-pane.test.ts。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { toDateKey, type Task } from '@mindough/core';

const now = new Date(2026, 10, 10, 12);
const today = toDateKey(now);
const tasks = vi.hoisted(() => [] as Task[]);
const store = { activeTasks: () => tasks, createTask: vi.fn() };
vi.mock('../store/StoreProvider', () => ({ useStore: () => store, useNow: () => now }));
vi.mock('../lib/date-display', () => ({ useDateDisplay: () => 'absolute' }));
vi.mock('../lib/root-scroll', () => ({ scrollIntoContainer: () => {} }));
vi.mock('../components/LunarLine', () => ({ LunarLine: () => null }));
vi.mock('../components/PageHeader', () => ({ PageHeader: () => null }));
vi.mock('../components/TaskRow', () => ({
  TaskRow: ({ task, dateMetaOnly }: { task: Task; dateMetaOnly?: boolean }) => (
    <div className="task-row" data-task-id={task.id} data-date-meta-only={dateMetaOnly ? '1' : '0'} />
  ),
}));

import { AgendaPage } from './Agenda';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  tasks.length = 0;
});

const task = (id: string, status: string, extra: Partial<Task> = {}) =>
  ({ id, body_md: id, status, scheduled_date: today, end_date: null, recurrence: null, deleted: false, ...extra }) as unknown as Task;

describe('时间轴', () => {
  it('完成、关闭的不列，其余照旧', () => {
    tasks.push(task('open', '待办'), task('doing', '进行中'), task('done', '完成'), task('closed', '关闭'));
    act(() => root.render(<AgendaPage />));
    const ids = [...host.querySelectorAll('.task-row')].map((el) => el.getAttribute('data-task-id'));
    expect(ids).toEqual(['open', 'doing']);
  });

  it('行只带日期定位小字', () => {
    tasks.push(task('open', '待办'));
    act(() => root.render(<AgendaPage />));
    expect(host.querySelector('.task-row')!.getAttribute('data-date-meta-only')).toBe('1');
  });
});
