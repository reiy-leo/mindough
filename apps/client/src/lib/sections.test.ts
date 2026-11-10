import { describe, expect, it } from 'vitest';
import type { Group, Task } from '@mindough/core';
import { backlogSections, dueBucket, moodRank, overdueBucket, overdueBucketOfDays, sectionOverdue, normalizeSectionBy, sectionTasks, sectionCollapsed, sortByMood, toggleSectionCollapsed } from './sections';
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

describe('过期积压按日期分区（Rei 2026-11-10：昨天 / 过去 7 天 / 过去一个月 / 过去一年 / 更远）', () => {
  // 只看日期，时区跟设备：传 deviceToday，任务不带时区
  const at = (d: string) => new Date(`${d}T12:00:00`);
  const b = (end: string, d: string) => overdueBucket(t({ scheduled_date: end }), at(d), d);
  it('按过期天数分段，边界不重叠', () => {
    expect([1, 2, 7, 8, 30, 31, 365, 366, 1000].map(overdueBucketOfDays)).toEqual(['yesterday', 'week', 'week', 'month', 'month', 'year', 'year', 'older', 'older']);
  });
  it('跨月：3 月 1 日的昨天是 2 月 28 日，7 天前是 2 月 22 日', () => {
    expect(b('2026-02-28', '2026-03-01')).toBe('yesterday');
    expect(b('2026-02-27', '2026-03-01')).toBe('week');
    expect(b('2026-02-22', '2026-03-01')).toBe('week');
    expect(b('2026-02-21', '2026-03-01')).toBe('month');
    expect(b('2026-01-30', '2026-03-01')).toBe('month'); // 30 天前
    expect(b('2026-01-29', '2026-03-01')).toBe('year'); // 31 天前
  });
  it('跨年：1 月 1 日的昨天是去年 12 月 31 日；365 天前算过去一年，366 天前算超过一年（含闰年）', () => {
    expect(b('2026-12-31', '2027-01-01')).toBe('yesterday');
    expect(b('2026-12-25', '2027-01-01')).toBe('week');
    expect(b('2026-12-24', '2027-01-01')).toBe('month');
    expect(b('2026-01-01', '2027-01-01')).toBe('year'); // 365 天
    expect(b('2025-12-31', '2027-01-01')).toBe('older'); // 366 天
    expect(b('2024-02-28', '2025-02-28')).toBe('older'); // 中间有 2024-02-29：366 天
    expect(b('2024-02-29', '2025-02-28')).toBe('year'); // 365 天
  });
  it('多天任务看结束日', () => {
    expect(overdueBucket(t({ scheduled_date: '2026-10-01', end_date: '2026-11-10' }), at('2026-11-11'), '2026-11-11')).toBe('yesterday');
  });
  it('分段顺序固定、段内顺序不变、空段不出现', () => {
    const list = [t({ scheduled_date: '2026-11-10' }), t({ scheduled_date: '2026-11-08' }), t({ scheduled_date: '2026-11-05' }), t({ scheduled_date: '2024-01-01' })];
    const s = sectionOverdue(list, at('2026-11-11'), '2026-11-11');
    expect(s.map((x) => x.key)).toEqual(['yesterday', 'week', 'older']);
    expect(s[1]?.tasks).toEqual([list[1], list[2]]);
    expect(s.map((x) => x.label)).toEqual(['昨天', '过去 7 天', '超过一年']);
  });
});

describe('过期积压页的分段（Rei 2026-11-10「过期积压不显示分区按钮」「"接下来"应该换成"超过一年"」）', () => {
  const at = (d: string) => new Date(`${d}T12:00:00`);
  it('过期 5 段在前，没到期的最后一段叫「还没到期」，都是 overdue 这一类，能按 kind:key 记折叠', () => {
    const od = [t({ scheduled_date: '2026-11-10' }), t({ scheduled_date: '2024-01-01' })];
    const up = [t({ scheduled_date: '2026-11-11' }), t({ scheduled_date: '2026-10-01', end_date: '2026-12-01' })];
    const s = backlogSections(od, up, at('2026-11-11'), '2026-11-11');
    expect(s.map((x) => x.key)).toEqual(['yesterday', 'older', 'upcoming']);
    expect(s.map((x) => x.label)).toEqual(['昨天', '超过一年', '还没到期']);
    expect(s.every((x) => x.kind === 'overdue')).toBe(true);
    expect(s[2]?.tasks).toEqual(up);
    expect(sectionCollapsed(toggleSectionCollapsed([], s[1]!), s[1]!)).toBe(true);
    expect(toggleSectionCollapsed([], s[1]!)).toEqual(['overdue:older']);
  });
  it('没有没到期的就没有最后一段；全空返回空', () => {
    expect(backlogSections([t({ scheduled_date: '2026-11-05' })], [], at('2026-11-11'), '2026-11-11').map((x) => x.key)).toEqual(['week']);
    expect(backlogSections([], [], at('2026-11-11'), '2026-11-11')).toEqual([]);
  });
});
