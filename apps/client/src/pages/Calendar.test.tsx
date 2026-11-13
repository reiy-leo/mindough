// @vitest-environment happy-dom
/**
 * 日历（Rei 2026-11-10，docs/CALENDAR.md）：完成、关闭、重复的不画进格子；任务、倒数日、订阅事件画进格子；
 * 视图读同步的偏好 calendar.view / view_days / view_weeks，账户里没有的用本机老设置，都没有默认周（Rei 2026-11-11、2026-11-13）；周、多日、多周、月都列出当天全部条目，没有「还有 N 件」，每天倒数日 → 任务 → 订阅事件（Rei 2026-11-11 01:10）；月视图日期旁数任务 + 打卡 + 倒数日；打卡只算个数，格子和列表都不列（Rei 01:08）；手机月视图下面是选中那天的列表。
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
const openQuickCreate = vi.fn();
const setSetting = vi.fn();
const createDraftTask = vi.fn((input: { scheduled_date: string }) => ({ id: `draft-${input.scheduled_date}`, body_md: '', ...input }));
const prefs = new Map<string, unknown>();
const setPref = vi.fn((k: string, v: unknown) => void prefs.set(k, v));
const store = { pref: (k: string) => prefs.get(k), setPref, activeTasks: () => tasks, createTask: vi.fn(), createDraftTask, version: 1, isLocked: () => false, get: () => undefined, updateTask: vi.fn() };
vi.mock('../store/StoreProvider', () => ({ useStore: () => store, useNow: () => now }));
vi.mock('../lib/settings', () => ({ useSettings: () => ({ settings: settings.value, set: setSetting, layout: settings.layout }) }));
vi.mock('../lib/ui', () => ({ useUi: () => ({ openEditor, openQuickCreate, editingId: null }), useUiStable: () => ({ openEditor, openQuickCreate, editingId: null }), useIsEditing: () => false }));
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
  openQuickCreate.mockClear();
  openEditor.mockClear();
  createDraftTask.mockClear();
  store.createTask.mockClear();
  prefs.clear();
  setPref.mockClear();
});
/** 改视图后写进同步偏好的三项。 */
const view = () => ({ kind: prefs.get('calendar.view'), days: prefs.get('calendar.view_days'), weeks: prefs.get('calendar.view_weeks') });

/** 点了「+」：建了那天的草稿任务、在详情（宽屏浮层 / 手机整页）里打开，没弹新建面板（Rei 2026-11-12 06:52）。 */
const expectDraft = (date: string) => {
  expect(createDraftTask).toHaveBeenCalledWith({ body_md: '', scheduled_date: date });
  expect(openEditor).toHaveBeenLastCalledWith(`draft-${date}`);
  expect(openQuickCreate).not.toHaveBeenCalled();
};

const task = (id: string, status: string, extra: Partial<Task> = {}) =>
  ({ id, body_md: id, status, completion_mode: 'once', scheduled_date: today, end_date: null, target_date: null, recurrence: null, deleted: false, archived_at: null, created_at: '2026-01-01T00:00:00.000Z', ...extra }) as unknown as Task;

const ids = () => [...host.querySelectorAll('.cal-item.is-task')].map((el) => el.getAttribute('data-task-id'));

describe('日历', () => {
  it('完成、关闭、重复的不画进格子（周视图）', () => {
    settings.value = { calendarView: { kind: 'week', days: 3, weeks: 2 } };
    tasks.push(task('open', '待办'), task('doing', '进行中'), task('done', '完成'), task('closed', '关闭'), task('habit', '待办', { recurrence: 'FREQ=DAILY' }));
    act(() => root.render(<CalendarPage />));
    expect(ids().sort()).toEqual(['doing', 'open']);
  });

  it('没记过视图：默认周，7 格', () => {
    settings.value = {};
    act(() => root.render(<CalendarPage />));
    expect(host.querySelector('.cal-page')!.classList.contains('is-week')).toBe(true);
    expect(host.querySelectorAll('.cal-cell').length).toBe(7);
  });

  it('周视图：日期段跨格；点任务打开详情', () => {
    settings.value = { calendarView: { kind: 'week', days: 3, weeks: 2 } };
    tasks.push(task('span', '待办', { scheduled_date: '2026-11-10', end_date: '2026-11-12' }), task('far', '待办', { scheduled_date: '2027-03-01' }));
    act(() => root.render(<CalendarPage />));
    expect(ids()).toEqual(['span']);
    const slot = host.querySelector('.cal-item.is-task')!.closest('.cal-slot') as HTMLElement;
    expect(slot.style.gridColumn).toContain('span 3');
    act(() => (host.querySelector('.cal-item.is-task') as HTMLElement).click());
    expect(openEditor).toHaveBeenCalledWith('span');
  });

  it('任务行首没有勾选圆圈，每件挂自己的底色（Rei 2026-11-12 01:15）', () => {
    settings.value = { calendarView: { kind: 'week', days: 3, weeks: 2 } };
    tasks.push(task('a', '待办'), task('cd', '待办', { completion_mode: 'countdown', scheduled_date: null, target_date: today }));
    act(() => root.render(<CalendarPage />));
    expect(host.querySelector('.cal-item-dot')).toBeNull();
    const el = host.querySelector('.cal-item.is-task[data-task-id="a"]') as HTMLElement;
    expect(el.querySelector('svg')).toBeNull();
    expect(el.style.getPropertyValue('--item-bg')).toMatch(/^#[0-9a-f]{6}$/);
    const cd = host.querySelector('.cal-item.is-countdown') as HTMLElement;
    expect(cd.querySelector('.cal-item-icon')).not.toBeNull();
  });

  it('月视图：放得下时列出当天全部，倒数日 → 任务 → 订阅事件；日期旁数任务 + 打卡 + 倒数日；不列打卡', () => {
    tasks.push(
      task('a', '待办'),
      task('b', '待办'),
      task('c', '待办'),
      task('cd', '待办', { completion_mode: 'countdown', scheduled_date: null, target_date: today }),
      task('habit', '待办', { recurrence: 'FREQ=DAILY' }),
      task('span', '待办', { scheduled_date: '2026-11-20', end_date: '2026-11-22' }),
    );
    events.push({ id: 's1:e1', key: 'e1', subId: 's1', subName: '工作', color: 'green', title: '周会', allDay: true, startDate: today, endDate: today, start: today, end: today, startMs: null, endMs: null, location: '', description: '' });
    act(() => root.render(<CalendarPage />));
    const cell = host.querySelector(`.cal-cell[data-date="${today}"]`)!;
    const row = cell.closest('.cal-row')!;
    const slots = [...row.querySelectorAll<HTMLElement>('.cal-slot')].sort((x, y) => Number(x.style.gridRow) - Number(y.style.gridRow));
    expect(slots.map((el) => el.querySelector('.cal-item')!.getAttribute('data-task-id') ?? 'event')).toEqual(['cd', 'a', 'b', 'c', 'event']);
    expect(cell.querySelector('.cal-cell-count')!.textContent).toBe('5');
    expect(host.querySelector('.cal-more')).toBeNull();
    expect(host.querySelector('.cal-item.is-checkin')).toBeNull();
    // 只有打卡的日子：没有条目，只有个数
    const other = host.querySelector('.cal-cell[data-date="2026-11-12"]')!;
    expect(other.querySelector('.cal-cell-count')!.textContent).toBe('1');
    // 日期段跨格画一条
    const spanSlot = host.querySelector('.cal-item[data-task-id="span"]')!.closest('.cal-slot') as HTMLElement;
    expect(spanSlot.style.gridColumn).toContain('span 3');
    // 点个数弹出那天的列表：倒数日 → 任务 → 事件，不列打卡
    act(() => (cell.querySelector('.cal-cell-count') as HTMLElement).click());
    const listed = [...document.querySelectorAll('.cal-day-list .cal-item')].map((el) => el.getAttribute('data-task-id') ?? 'event');
    expect(listed).toEqual(['cd', 'a', 'b', 'c', 'event']);
  });

  it('月视图格子撑满、放不下收成「+N」（Rei 2026-11-13 09:44）：前几条照画，点 +N 看那天全部', () => {
    // 假装量到了：每行 26 + 6 + 3 × 24 = 104px 高，日期那行 26px → 一行放 3 条
    const RO = globalThis.ResizeObserver;
    const ch = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    const oh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver;
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get(this: HTMLElement) { return this.classList.contains('cal-row') ? 104 : this.classList.contains('cal-grid') ? 640 : 0; } });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return this.classList.contains('cal-day-head') ? 26 : 0; } });
    try {
      tasks.push(task('cd', '待办', { completion_mode: 'countdown', scheduled_date: null, target_date: today }));
      for (const id of ['a', 'b', 'c', 'd']) tasks.push(task(id, '待办'));
      tasks.push(task('one', '待办', { scheduled_date: '2026-11-03' }));
      act(() => root.render(<CalendarPage />));
      const row = host.querySelector(`.cal-cell[data-date="${today}"]`)!.closest('.cal-row')!;
      const shown = [...row.querySelectorAll<HTMLElement>('.cal-slot:not(.cal-more-slot)')].map((el) => el.querySelector('.cal-item')!.getAttribute('data-task-id'));
      expect(shown).toEqual(['cd', 'a']);
      const more = row.querySelectorAll<HTMLElement>('.cal-more');
      expect(more).toHaveLength(1);
      expect(more[0]!.textContent).toBe('+3');
      expect((more[0]!.parentElement as HTMLElement).style.gridRow).toBe('4');
      expect(more[0]!.getAttribute('aria-label')).toContain('还有 3 件，点开看全部');
      // 只有一件的那天照常画，没有 +N
      const other = host.querySelector('.cal-cell[data-date="2026-11-03"]')!.closest('.cal-row')!;
      expect(other.querySelector('.cal-more')).toBeNull();
      expect(other.querySelector('.cal-item[data-task-id="one"]')).not.toBeNull();
      // 点 +N：弹出那天的列表，全部 5 件
      act(() => more[0]!.click());
      expect([...document.querySelectorAll('.cal-day-list .cal-item')].map((el) => el.getAttribute('data-task-id'))).toEqual(['cd', 'a', 'b', 'c', 'd']);
    } finally {
      globalThis.ResizeObserver = RO;
      if (ch) Object.defineProperty(HTMLElement.prototype, 'clientHeight', ch);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)['clientHeight'];
      if (oh) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', oh);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)['offsetHeight'];
    }
  });

  it('年视图量到尺寸后按宽高定列数（Rei 2026-11-13 09:44）', () => {
    const RO = globalThis.ResizeObserver;
    const cw = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const ch = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver;
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get(this: HTMLElement) { return this.classList.contains('cal-year') ? 1100 : 0; } });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get(this: HTMLElement) { return this.classList.contains('cal-year') ? 640 : 0; } });
    try {
      settings.value = { calendarView: { kind: 'year', days: 3, weeks: 2 } };
      act(() => root.render(<CalendarPage />));
      const y = host.querySelector<HTMLElement>('.cal-year')!;
      expect(y.classList.contains('is-fit')).toBe(true);
      const cols = Number(y.style.getPropertyValue('--year-cols'));
      expect(cols * Number(y.style.getPropertyValue('--year-rows'))).toBe(12);
      expect([4, 6]).toContain(cols);
      expect(host.querySelectorAll('.cal-year-month')).toHaveLength(12);
    } finally {
      globalThis.ResizeObserver = RO;
      if (cw) Object.defineProperty(HTMLElement.prototype, 'clientWidth', cw);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)['clientWidth'];
      if (ch) Object.defineProperty(HTMLElement.prototype, 'clientHeight', ch);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)['clientHeight'];
    }
  });

  it('周视图：一天很多件也全部列出，没有「+N」（放不下时只在格子区里滚，Rei 2026-11-13 09:44）', () => {
    settings.value = { calendarView: { kind: 'week', days: 3, weeks: 2 } };
    for (let i = 0; i < 16; i++) tasks.push(task(`t${i}`, '待办'));
    tasks.push(task('cd', '待办', { completion_mode: 'countdown', scheduled_date: null, target_date: today }));
    act(() => root.render(<CalendarPage />));
    expect(ids()).toHaveLength(17);
    expect(host.querySelector('.cal-more')).toBeNull();
    const top = [...host.querySelectorAll<HTMLElement>('.cal-slot')].find((el) => el.style.gridRow === '2')!;
    expect(top.querySelector('.cal-item')!.getAttribute('data-task-id')).toBe('cd');
  });

  it('订阅事件带颜色和时间（周视图）', () => {
    settings.value = { calendarView: { kind: 'week', days: 3, weeks: 2 } };
    events.push({ id: 's1:e1', key: 'e1', subId: 's1', subName: '工作', color: 'green', title: '周会', allDay: false, startDate: today, endDate: today, start: today, end: today, startMs: now.getTime(), endMs: now.getTime() + 3_600_000, location: '', description: '' });
    act(() => root.render(<CalendarPage />));
    const ev = host.querySelector('.cal-item.is-event') as HTMLElement;
    expect(ev.textContent).toContain('周会');
    expect(ev.style.getPropertyValue('--sub')).toBe('var(--cal-green)');
    expect(host.querySelector('.cal-item-time')).not.toBeNull();
  });

  it('视图跟着账户同步（Rei 2026-11-13）：账户里的偏好优先于本机老设置', () => {
    settings.value = { calendarView: { kind: 'month', days: 3, weeks: 2 } };
    prefs.set('calendar.view', 'days');
    prefs.set('calendar.view_days', 5);
    act(() => root.render(<CalendarPage />));
    expect(host.querySelectorAll('.cal-cell').length).toBe(5);
  });

  it('多日视图按设置的天数画', () => {
    settings.value = { calendarView: { kind: 'days', days: 4, weeks: 2 } };
    act(() => root.render(<CalendarPage />));
    expect(host.querySelectorAll('.cal-cell').length).toBe(4);
  });

  it('没有页头：只有读屏的「日历」标题；视图下拉的标签只给读屏', () => {
    act(() => root.render(<CalendarPage />));
    expect(host.querySelector('.page-header')).toBeNull();
    expect(host.querySelector('h1.sr-only')!.textContent).toBe('日历');
    expect(host.querySelector('.cal-toolbar .cal-view-select .field-label')!.textContent).toBe('视图');
  });

  it('多日 / 多周：− + 每次 1，到边界禁用', () => {
    settings.value = { calendarView: { kind: 'days', days: 14, weeks: 1 } };
    act(() => root.render(<CalendarPage />));
    const btn = (l: string) => host.querySelector(`.cal-count [aria-label="${l}"]`) as HTMLButtonElement;
    expect(btn('多一天').disabled).toBe(true);
    expect(btn('少一天').disabled).toBe(false);
    act(() => btn('少一天').click());
    expect(view()).toEqual({ kind: 'days', days: 13, weeks: 1 });
    expect(setSetting).not.toHaveBeenCalled();
    prefs.clear();
    settings.value = { calendarView: { kind: 'weeks', days: 3, weeks: 1 } };
    act(() => root.render(<CalendarPage key="w" />));
    expect(btn('少一周').disabled).toBe(true);
    act(() => btn('多一周').click());
    expect(view()).toEqual({ kind: 'weeks', days: 3, weeks: 2 });
  });

  it('手机月视图：小月历写个数（含打卡）+ 当天列表（倒数日 → 任务 → 事件，不列打卡）', () => {
    settings.layout = 'mobile';
    tasks.push(task('open', '待办'), task('habit', '待办', { recurrence: 'FREQ=DAILY' }), task('cd', '待办', { completion_mode: 'countdown', scheduled_date: null, target_date: today }));
    act(() => root.render(<CalendarPage />));
    expect(host.querySelector('.cal-mini-cell.is-today .cal-mini-count')!.textContent).toBe('3');
    expect([...host.querySelectorAll('.cal-day-list .cal-item.is-task')].map((el) => el.getAttribute('data-task-id'))).toEqual(['cd', 'open']);
    expect(host.querySelector('.cal-item.is-checkin')).toBeNull();
  });
  describe('「+」建那天的草稿任务，在详情浮层里打开（Rei 2026-11-12 06:52，替代 02:04 的新建面板）', () => {
    const plus = (d: string) => host.querySelector(`.cal-cell[data-date="${d}"] .cal-cell-add`) as HTMLButtonElement;
    for (const kind of ['week', 'days', 'weeks', 'month'] as const) {
      it(`宽屏${kind}：点格子的「+」`, () => {
        settings.value = { calendarView: { kind, days: 3, weeks: 2 } };
        act(() => root.render(<CalendarPage />));
        const btn = plus(today);
        expect(btn.getAttribute('aria-label')).toMatch(/^添加到/);
        act(() => btn.click());
        expectDraft(today);
        // 不出行内输入框，也不直接落盘建任务
        expect(host.querySelector('.cal-grid input, .cal-grid textarea, .cal-add, .add-bar')).toBeNull();
        expect(store.createTask).not.toHaveBeenCalled();
      });
    }

    it('键盘：Enter 按「+」也一样', () => {
      settings.value = { calendarView: { kind: 'week', days: 3, weeks: 2 } };
      act(() => root.render(<CalendarPage />));
      const btn = plus('2026-11-12');
      act(() => btn.focus());
      act(() => {
        btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        btn.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
      });
      expectDraft('2026-11-12');
    });

    it('手机月视图：当天列表的「添加」带选中那天', () => {
      settings.layout = 'mobile';
      act(() => root.render(<CalendarPage />));
      const add = host.querySelector('.cal-day-add') as HTMLButtonElement;
      expect(add.textContent).toContain('添加');
      act(() => add.click());
      expectDraft(today);
      expect(host.querySelector('.cal-add, .add-bar')).toBeNull();
    });

    it('手机周视图：每天列表的「添加」带各自那天', () => {
      settings.layout = 'mobile';
      settings.value = { calendarView: { kind: 'week', days: 3, weeks: 2 } };
      act(() => root.render(<CalendarPage />));
      const list = host.querySelectorAll('.cal-day-list')[0]!;
      act(() => (list.querySelector('.cal-day-add') as HTMLElement).click());
      const d = (createDraftTask.mock.calls[0]![0] as { scheduled_date: string }).scheduled_date;
      expectDraft(d);
      expect(d).toBe(list.getAttribute('data-drop-date'));
      expect(d).not.toBe(today);
    });

    it('月视图点数字弹出的当天列表：点「添加」先关列表再开详情', () => {
      tasks.push(task('a', '待办'));
      act(() => root.render(<CalendarPage />));
      act(() => (host.querySelector(`.cal-cell[data-date="${today}"] .cal-cell-count`) as HTMLElement).click());
      const add = document.querySelector('.cal-day-list .cal-day-add') as HTMLElement;
      act(() => add.click());
      expectDraft(today);
      expect(document.querySelector('.cal-day-list .cal-day-add')).toBeNull();
    });

    it('年视图没有「+」', () => {
      settings.value = { calendarView: { kind: 'year', days: 3, weeks: 2 } };
      act(() => root.render(<CalendarPage />));
      expect(host.querySelector('.cal-cell-add, .cal-day-add')).toBeNull();
    });
  });
});
