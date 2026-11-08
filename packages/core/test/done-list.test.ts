import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { doneDayLabel, doneDays, doneTasks, finishedAtMs } from '../src/done-list';
import { formatHlc } from '../src/hlc';
import { mkTask } from './helpers';
import type { Task } from '../src/types';

const at = (iso: string) => Date.parse(iso);
const hlc = (iso: string) => formatHlc(at(iso), 0, 'dev');
const t = (id: string, patch: Partial<Task>) => mkTask(id, { updated_at: hlc('2026-01-01T00:00:00Z'), ...patch });
// 测试里按 UTC 取日期，不受运行环境时区影响
const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

describe('已完成页：列哪些', () => {
  it('只列完成和关闭的，待办、进行中、删掉的不列', () => {
    const list = [
      t('a', { status: '完成', done_at: '2026-11-08T03:00:00Z' }),
      t('b', { status: '关闭', done_at: '2026-11-08T02:00:00Z' }),
      t('c', { status: '待办' }),
      t('d', { status: '进行中' }),
      t('e', { status: '完成', done_at: '2026-11-08T04:00:00Z', deleted: true }),
    ];
    expect(doneTasks(list).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('打卡没结束不列（每天打卡不改状态），结束了的打卡、倒数日照样列', () => {
    const list = [
      t('habit', { status: '待办', recurrence: 'FREQ=DAILY' }),
      t('habitEnded', { status: '完成', recurrence: 'FREQ=DAILY', done_at: '2026-11-07T01:00:00Z' }),
      t('cd', { status: '待办', completion_mode: 'countdown', target_date: '2026-12-01' }),
      t('cdClosed', { status: '关闭', completion_mode: 'countdown', target_date: '2026-10-01', done_at: '2026-11-06T01:00:00Z' }),
    ];
    expect(doneTasks(list).map((x) => x.id)).toEqual(['habitEnded', 'cdClosed']);
  });

  it('归档项目里的不列：store.activeTasks() 已经去掉了', async () => {
    const s = await Store.open(new MemoryAdapter(), { deviceId: 'a', now: () => new Date('2026-11-08T04:00:00Z') });
    const g = s.insert('group', { name: '搬家', icon: '📦', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto: true });
    const inG = s.createTask({ body_md: '组里', group_id: g.id });
    const free = s.createTask({ body_md: '不在组里' });
    s.completeTask(inG.id);
    s.completeTask(free.id);
    expect(doneTasks(s.activeTasks()).map((x) => x.id).sort()).toEqual([free.id, inG.id].sort());
    s.archiveGroup(g.id);
    expect(doneTasks(s.activeTasks()).map((x) => x.id)).toEqual([free.id]);
    s.unarchiveGroup(g.id);
    expect(doneTasks(s.activeTasks()).map((x) => x.id)).toContain(inG.id);
  });

  it('取消完成（重新打开）后就不在了', async () => {
    const s = await Store.open(new MemoryAdapter(), { deviceId: 'a', now: () => new Date('2026-11-08T04:00:00Z') });
    const x = s.createTask({ body_md: 'x' });
    s.completeTask(x.id);
    expect(doneTasks(s.activeTasks()).map((y) => y.id)).toEqual([x.id]);
    s.reopenTask(x.id);
    expect(doneTasks(s.activeTasks())).toEqual([]);
  });
});

describe('已完成页：排序', () => {
  it('按结束时间从新到旧，完成和关闭混在一起排', () => {
    const list = [
      t('old', { status: '完成', done_at: '2026-11-01T00:00:00Z' }),
      t('new', { status: '关闭', done_at: '2026-11-08T05:00:00Z' }),
      t('mid', { status: '完成', done_at: '2026-11-05T00:00:00Z' }),
    ];
    expect(doneTasks(list).map((x) => x.id)).toEqual(['new', 'mid', 'old']);
  });

  it('没有 done_at 的老数据用最后修改时间顶上', () => {
    const noDone = t('legacy', { status: '完成', done_at: null, updated_at: hlc('2026-11-06T00:00:00Z') });
    expect(finishedAtMs(noDone)).toBe(at('2026-11-06T00:00:00Z'));
    const bad = t('bad', { status: '完成', done_at: 'not a date', updated_at: hlc('2026-11-02T00:00:00Z') });
    expect(finishedAtMs(bad)).toBe(at('2026-11-02T00:00:00Z'));
    const list = [t('a', { status: '完成', done_at: '2026-11-07T00:00:00Z' }), noDone, t('b', { status: '完成', done_at: '2026-11-05T00:00:00Z' })];
    expect(doneTasks(list).map((x) => x.id)).toEqual(['a', 'legacy', 'b']);
  });

  it('同一时刻按 id 倒序，顺序固定', () => {
    const same = '2026-11-08T01:00:00Z';
    const list = [t('a1', { status: '完成', done_at: same }), t('a3', { status: '完成', done_at: same }), t('a2', { status: '关闭', done_at: same })];
    expect(doneTasks(list).map((x) => x.id)).toEqual(['a3', 'a2', 'a1']);
  });
});

describe('已完成页：按日期分段', () => {
  it('同一天的放一段，段和段里都从新到旧', () => {
    const list = [
      t('y1', { status: '完成', done_at: '2026-11-07T09:00:00Z' }),
      t('d1', { status: '完成', done_at: '2026-11-08T01:00:00Z' }),
      t('d2', { status: '关闭', done_at: '2026-11-08T08:00:00Z' }),
      t('o1', { status: '完成', done_at: '2026-10-30T09:00:00Z' }),
      t('y2', { status: '完成', done_at: '2026-11-07T20:00:00Z' }),
    ];
    const days = doneDays(list, utcDate);
    expect(days.map((d) => d.date)).toEqual(['2026-11-08', '2026-11-07', '2026-10-30']);
    expect(days.map((d) => d.tasks.map((x) => x.id))).toEqual([['d2', 'd1'], ['y2', 'y1'], ['o1']]);
  });

  it('按本机日期分段：UTC 前一天晚上在东八区是第二天', () => {
    const list = [t('late', { status: '完成', done_at: '2026-11-07T17:00:00Z' })];
    const shanghai = (ms: number) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
    expect(doneDays(list, utcDate)[0]!.date).toBe('2026-11-07');
    expect(doneDays(list, shanghai)[0]!.date).toBe('2026-11-08');
  });

  it('没有已完成的任务是空数组', () => {
    expect(doneDays([t('a', { status: '待办' })], utcDate)).toEqual([]);
  });

  it('段标题：今天、昨天、具体日期，跨年带年份', () => {
    expect(doneDayLabel('2026-11-08', '2026-11-08')).toBe('今天');
    expect(doneDayLabel('2026-11-07', '2026-11-08')).toBe('昨天');
    expect(doneDayLabel('2026-11-06', '2026-11-08')).toBe('11月6日 周五');
    expect(doneDayLabel('2025-12-31', '2026-01-02')).toBe('2025年12月31日 周三');
    expect(doneDayLabel(null, '2026-11-08')).toBe('更早');
  });
});
