// @vitest-environment happy-dom
/**
 * 日历（Rei 2026-11-10，docs/CALENDAR.md）：完成、关闭、重复的不上日历（同原来的时间轴）；任务、订阅事件画进格子；
 * 视图从本机设置读；手机月视图下面是选中那天的列表。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { toDateKey, type Task } from '@mindough/core';

const now = new Date(2026, 10, 10, 12);
const today = toDateKey(now);
const tasks = vi.hoisted(() => [] as Task[]);
const events = vi.hoisted(() => [] as unknown[]);
const settings = vi.hoisted(() => ({ value: { calendarView: { kind: 'month', days: 3, weeks: 2 } } as Record<string, unknown>, layout: 'desktop' }));
const openEditor = vi.fn();
const store = { activeTasks: () => tasks, createTask: vi.fn(), version: 1 };
vi.mock('../store/StoreProvider', () => ({ useStore: () => store, useNow: () => now }));
vi.mock('../lib/settings', () => ({ useSettings: () => ({ settings: settings.value, set: vi.fn(), layout: settings.layout }) }));
vi.mock('../lib/ui', () => ({ useUi: () => ({ openEditor, editingId: null }) }));
vi.mock('../lib/lunar', () => ({ useLunar: () => ({ show: false, holidays: false, any: false, day: () => ({ label: null, sub: null }) }) }));
vi.mock('../lib/calendar-subs', () => ({ useCalendarEvents: () => events }));
vi.mock('../components/PageHeader', () => ({ PageHeader: () => null }));
vi.mock('../components/task/DateGrid', () => ({ LunarMark: () => null }));
vi.mock('../lib/view', () => ({ titleOf: (_s: unknown, t: Task) => t.body_md }));

import { CalendarPage } from './Calendar';

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
  events.length = 0;
  settings.layout = 'desktop';
  settings.value = { calendarView: { kind: 'month', days: 3, weeks: 2 } };
});

const task = (id: string, status: string, extra: Partial<Task> = {}) =>
  ({ id, body_md: id, status, scheduled_date: today, end_date: null, recurrence: null, deleted: false, ...extra }) as unknown as Task;

const ids = () => [...host.querySelectorAll('.cal-item.is-task')].map((el) => el.getAttribute('data-task-id'));

describe('日历', () => {
  it('完成、关闭、重复的不上日历', () => {
    tasks.push(task('open', '待办'), task('doing', '进行中'), task('done', '完成'), task('closed', '关闭'), task('habit', '待办', { recurrence: 'FREQ=DAILY' }));
    act(() => root.render(<CalendarPage />));
    expect(ids().sort()).toEqual(['doing', 'open']);
  });

  it('月视图：日期段跨格、范围外的不画；点任务打开详情', () => {
    tasks.push(task('span', '待办', { scheduled_date: '2026-11-11', end_date: '2026-11-13' }), task('far', '待办', { scheduled_date: '2027-03-01' }));
    act(() => root.render(<CalendarPage />));
    expect(ids()).toEqual(['span']);
    const slot = host.querySelector('.cal-item.is-task')!.closest('.cal-slot') as HTMLElement;
    expect(slot.style.gridColumn).toContain('span 3');
    act(() => (host.querySelector('.cal-item.is-task') as HTMLElement).click());
    expect(openEditor).toHaveBeenCalledWith('span');
  });

  it('订阅事件带颜色和时间', () => {
    events.push({ id: 's1:e1', key: 'e1', subId: 's1', subName: '工作', color: 'green', title: '周会', allDay: false, startDate: today, endDate: today, start: today, end: today, startMs: now.getTime(), endMs: now.getTime() + 3_600_000, location: '', description: '' });
    act(() => root.render(<CalendarPage />));
    const ev = host.querySelector('.cal-item.is-event') as HTMLElement;
    expect(ev.textContent).toContain('周会');
    expect(ev.style.getPropertyValue('--sub')).toBe('var(--cal-green)');
    expect(host.querySelector('.cal-item-time')).not.toBeNull();
  });

  it('多日视图按设置的天数画', () => {
    settings.value = { calendarView: { kind: 'days', days: 4, weeks: 2 } };
    act(() => root.render(<CalendarPage />));
    expect(host.querySelectorAll('.cal-cell').length).toBe(4);
  });

  it('手机月视图：小月历 + 当天列表', () => {
    settings.layout = 'mobile';
    tasks.push(task('open', '待办'));
    act(() => root.render(<CalendarPage />));
    expect(host.querySelector('.cal-mini')).not.toBeNull();
    expect(host.querySelector('.cal-day-list .cal-item.is-task')?.getAttribute('data-task-id')).toBe('open');
  });
});
