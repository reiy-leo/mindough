import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { isOverdueBacklogTask, overdueBacklogTasks } from '../src/overdue-backlog';
import { local, mkTask } from './helpers';

const now = local(2026, 11, 11, 9);
const today = '2026-11-11';

describe('过期积压只放已过期的任务（Rei 2026-11-11「过期积压页里不能有未到期的任务」）', () => {
  it('昨天及以前到期的放；今天、明天到期的不放', () => {
    expect(isOverdueBacklogTask(mkTask('a', { scheduled_date: '2026-11-10' }), now, today)).toBe(true);
    expect(isOverdueBacklogTask(mkTask('b', { scheduled_date: '2025-01-01' }), now, today)).toBe(true);
    expect(isOverdueBacklogTask(mkTask('c', { scheduled_date: '2026-11-11' }), now, today)).toBe(false);
    expect(isOverdueBacklogTask(mkTask('d', { scheduled_date: '2026-11-12' }), now, today)).toBe(false);
  });
  it('日期段看结束日：开始日早、还没过完的不放；结束日过了的放', () => {
    expect(isOverdueBacklogTask(mkTask('a', { scheduled_date: '2026-10-01', end_date: '2026-11-11' }), now, today)).toBe(false);
    expect(isOverdueBacklogTask(mkTask('b', { scheduled_date: '2026-10-01', end_date: '2026-11-20' }), now, today)).toBe(false);
    expect(isOverdueBacklogTask(mkTask('c', { scheduled_date: '2026-10-01', end_date: '2026-11-10' }), now, today)).toBe(true);
  });
  it('没日期、做完、关闭、删掉、打卡、倒数日都不放', () => {
    const past = { scheduled_date: '2026-11-01' };
    expect(isOverdueBacklogTask(mkTask('a'), now, today)).toBe(false);
    expect(isOverdueBacklogTask(mkTask('b', { ...past, status: '完成' }), now, today)).toBe(false);
    expect(isOverdueBacklogTask(mkTask('c', { ...past, status: '关闭' }), now, today)).toBe(false);
    expect(isOverdueBacklogTask(mkTask('d', { ...past, deleted: true }), now, today)).toBe(false);
    expect(isOverdueBacklogTask(mkTask('e', { ...past, recurrence: 'FREQ=DAILY' }), now, today)).toBe(false);
    expect(isOverdueBacklogTask(mkTask('f', { ...past, completion_mode: 'countdown', target_date: '2026-11-01' }), now, today)).toBe(false);
    expect(isOverdueBacklogTask(mkTask('g', { ...past, status: '进行中' }), now, today)).toBe(true);
  });
  it('最近过期的在上；结束日一样时开始日晚的在上', () => {
    const list = [
      mkTask('old', { scheduled_date: '2024-01-01' }),
      mkTask('future', { scheduled_date: '2026-12-01' }),
      mkTask('yday', { scheduled_date: '2026-11-10' }),
      mkTask('span', { scheduled_date: '2026-11-01', end_date: '2026-11-10' }),
      mkTask('week', { scheduled_date: '2026-11-05' }),
    ];
    expect(overdueBacklogTasks(list, now, today).map((t) => t.id)).toEqual(['yday', 'span', 'week', 'old']);
  });
  it('Store.overdueBacklog：归档项目里的任务不算，没到期的不算', async () => {
    const s = await Store.open(new MemoryAdapter(), { deviceId: 'a', now: () => now });
    const g = s.insert('group', { name: '旧项目', icon: '📦', start_at: null, end_at: null, category_id: null, default_type_id: null, my_day_auto: true });
    const a = s.createTask({ body_md: '过期', scheduled_date: '2026-11-09' });
    s.createTask({ body_md: '今天', scheduled_date: '2026-11-11' });
    s.createTask({ body_md: '下周', scheduled_date: '2026-11-18' });
    s.createTask({ body_md: '归档项目里过期', scheduled_date: '2026-11-01', group_id: g.id });
    s.archiveGroup(g.id);
    expect(s.overdueBacklog().map((t) => t.id)).toEqual([a.id]);
  });
});
