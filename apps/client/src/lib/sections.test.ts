import { describe, expect, it } from 'vitest';
import type { Group, Task } from '@mindough/core';
import { dueBucket, moodRank, normalizeSectionBy, sectionTasks, sectionCollapsed, sortByMood, toggleSectionCollapsed } from './sections';
import { normalizeListView } from './list-views';
import { normalizePrefs, sortTasks } from './project-view';

let n = 0;
const t = (o: Partial<Task> = {}): Task => ({ id: `t${++n}`, group_id: null, mood: null, scheduled_date: null, end_date: null, time_zone: null, ...o }) as unknown as Task;
const g = (id: string, name: string) => ({ id, name }) as unknown as Group;
// 2026-11-11 是周三
const now = new Date('2026-11-11T04:00:00Z');
const today = '2026-11-11';

describe('列表分区 sections', () => {
  it('心情名次：好到坏，没记 / 认不出的最后', () => {
    expect(moodRank('happy')).toBe(0);
    expect(moodRank('angry')).toBe(11);
    expect(moodRank(null)).toBe(12);
    expect(moodRank('xx')).toBe(12);
    const list = [t({ mood: null }), t({ mood: 'sad' }), t({ mood: 'happy' }), t({ mood: 'sad' })];
    expect(sortByMood(list).map((x) => x.mood)).toEqual(['happy', 'sad', 'sad', null]);
    expect(sortByMood(list)[1]).toBe(list[1]);
  });
  it('不分区返回 null；认不出的分区方式回落不分区', () => {
    expect(sectionTasks([t()], 'none')).toBeNull();
    expect(normalizeSectionBy('due', ['none', 'mood', 'project'])).toBe('none');
    expect(normalizeSectionBy('mood')).toBe('mood');
  });
  it('按心情：从好到坏，没有心情在最后，空分区不出现', () => {
    const s = sectionTasks([t({ mood: 'tired' }), t(), t({ mood: 'calm' })], 'mood')!;
    expect(s.map((x) => x.key)).toEqual(['calm', 'tired', 'none']);
  });
  it('按项目：按传进来的项目顺序，没有项目（或不认识的项目）最后', () => {
    const s = sectionTasks([t({ group_id: 'b' }), t({ group_id: 'gone' }), t({ group_id: 'a' }), t()], 'project', { groups: [g('a', 'A'), g('b', 'B'), g('c', 'C')] })!;
    expect(s.map((x) => x.key)).toEqual(['a', 'b', 'none']);
    expect(s[2]!.tasks).toHaveLength(2);
    expect(s[0]!.group?.name).toBe('A');
  });
  it('目标日期段：过期 / 今天 / 本周 / 本月 / 更远 / 没有日期，日期段看结束日', () => {
    const b = (o: Partial<Task>, ws: 0 | 1 = 1) => dueBucket(t(o) as Task, now, today, ws);
    expect(b({ scheduled_date: '2026-11-10' })).toBe('overdue');
    expect(b({ scheduled_date: '2026-11-09', end_date: '2026-11-11' })).toBe('today');
    expect(b({ scheduled_date: '2026-11-11' })).toBe('today');
    expect(b({ scheduled_date: '2026-11-15' })).toBe('week'); // 周一开始的一周到周日 15 号
    expect(b({ scheduled_date: '2026-11-15' }, 0)).toBe('month'); // 周日开始：本周到周六 14 号
    expect(b({ scheduled_date: '2026-11-30' })).toBe('month');
    expect(b({ scheduled_date: '2026-12-01' })).toBe('later');
    expect(b({})).toBe('none');
  });
  it('按目标日期分区的顺序固定，没日期的最后', () => {
    const s = sectionTasks([t(), t({ scheduled_date: '2027-01-01' }), t({ scheduled_date: '2026-11-01' })], 'due', { now, today, weekStart: 1 })!;
    expect(s.map((x) => x.key)).toEqual(['overdue', 'later', 'none']);
  });
  it('折叠状态按「分区方式:key」记', () => {
    const s = { kind: 'mood' as const, key: 'happy' };
    const c = toggleSectionCollapsed([], s);
    expect(c).toEqual(['mood:happy']);
    expect(sectionCollapsed(c, s)).toBe(true);
    expect(sectionCollapsed(c, { kind: 'project', key: 'happy' })).toBe(false);
    expect(toggleSectionCollapsed(c, s)).toEqual([]);
  });
});

describe('列表视图设置', () => {
  it('我的一天：默认不分区、手动；不认按目标日期', () => {
    expect(normalizeListView('myday', undefined)).toEqual({ section: 'none', sort: 'manual', collapsed: [] });
    expect(normalizeListView('myday', { section: 'due', sort: 'mood' })).toMatchObject({ section: 'none', sort: 'mood' });
    expect(normalizeListView('myday', { section: 'project' }).section).toBe('project');
  });
  it('积压、已完成：默认按日期，能选不分区', () => {
    expect(normalizeListView('doable', undefined).section).toBe('date');
    expect(normalizeListView('done', { section: 'none' }).section).toBe('none');
    expect(normalizeListView('done', { section: 'mood' }).section).toBe('date');
  });
  it('项目页：分区不认按项目；排序能按心情，没心情的正序倒序都最后', () => {
    expect(normalizePrefs({ section: 'project' }).section).toBe('none');
    expect(normalizePrefs({ section: 'due' }).section).toBe('due');
    const base = { sort: 0, created_at: '', updated_at: '', scheduled_date: null, target_date: null, completion_mode: 'once' } as const;
    const list = [
      { ...base, id: 'a', mood: null },
      { ...base, id: 'b', mood: 'angry' },
      { ...base, id: 'c', mood: 'happy' },
    ];
    expect(sortTasks(list as never, 'mood', 'asc').map((x: { id: string }) => x.id)).toEqual(['c', 'b', 'a']);
    expect(sortTasks(list as never, 'mood', 'desc').map((x: { id: string }) => x.id)).toEqual(['b', 'c', 'a']);
  });
});
