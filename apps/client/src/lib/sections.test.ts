import { describe, expect, it } from 'vitest';
import type { Category, Group, Task } from '@mindough/core';
import { backlogSections, categorySectionOrder, dueBucket, moodRank, overdueBucket, overdueBucketOfDays, sectionOverdue, normalizeSectionBy, sectionTasks, sectionCollapsed, sortByMood, toggleSectionCollapsed } from './sections';
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
  it('按类型：只进第一个类型，按传进来的类型顺序，没有类型（或不认识的类型）最后', () => {
    const c = (id: string, name: string, o: Partial<Category> = {}) => ({ id, name, color: '#123456', icon: 'tag', hidden: false, ...o }) as unknown as Category;
    const cats = [c('run', '跑步'), c('read', '读书'), c('old', '旧的', { hidden: true }), c('none-used', '没人用')];
    const links: Record<string, string[]> = {};
    const mk = (ids: string[]) => {
      const x = t();
      links[x.id] = ids;
      return x;
    };
    const a = mk(['read', 'run']);
    const b = mk(['run']);
    const d = mk([]);
    const e = mk(['old']);
    const f = mk(['gone']);
    const s = sectionTasks([a, b, d, e, f], 'type', { categories: cats, categoryIdsOf: (x) => links[x.id] ?? [] })!;
    expect(s.map((x) => x.key)).toEqual(['run', 'read', 'old', 'none']);
    expect(s[0]!.tasks).toEqual([b]);
    expect(s[1]!.tasks).toEqual([a]); // 挂了两个类型只出现一次，在第一个类型下
    expect(s[2]!.category?.id).toBe('old'); // 不显示的类型照常成段
    expect(s[3]!.tasks).toEqual([d, f]);
    expect(s.every((x) => x.kind === 'type')).toBe(true);
    // 没传取类型的函数：全进「没有类型」
    expect(sectionTasks([a], 'type', { categories: cats })!.map((x) => x.key)).toEqual(['none']);
  });
  it('按类型的先后：能显示的按选择器顺序，不显示的同样规则排在后面', () => {
    const c = (id: string, o: Partial<Category> = {}) => ({ id, name: id, color: '', icon: '', hidden: false, sort: 0, ...o }) as unknown as Category;
    const vis = [c('b'), c('a')];
    const hid = [c('h1', { hidden: true, sort: 2 }), c('h2', { hidden: true, sort: 1 })];
    const store = {
      categories: (all?: boolean) => (all ? [...vis, ...hid] : vis),
      pickerCategories: () => vis,
      frequentCategoryIds: () => [],
      categoryLastUsed: () => new Map([['h1', '2026-11-11T00:00:00Z']]),
      categoryGroupOverrides: () => new Map(),
    } as unknown as Parameters<typeof categorySectionOrder>[0];
    expect(categorySectionOrder(store).map((x) => x.id)).toEqual(['b', 'a', 'h1', 'h2']);
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
    expect(normalizeListView('myday', { section: 'type' }).section).toBe('type');
  });
  it('积压：固定按日期，存过别的也不认', () => {
    expect(normalizeListView('doable', undefined).section).toBe('date');
    expect(normalizeListView('doable', { section: 'none' }).section).toBe('date');
    expect(normalizeListView('doable', { section: 'mood' }).section).toBe('date');
  });
  it('项目页：分区不认按项目；排序能按心情，没心情的正序倒序都最后', () => {
    expect(normalizePrefs({ section: 'project' }).section).toBe('none');
    expect(normalizePrefs({ section: 'due' }).section).toBe('due');
    expect(normalizePrefs({ section: 'type' }).section).toBe('type');
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

describe('过期积压页的分段（Rei 2026-11-10「过期积压不显示分区按钮」；2026-11-11「过期积压页里不能有未到期的任务」）', () => {
  const at = (d: string) => new Date(`${d}T12:00:00`);
  it('只有过期的 5 段，没有「还没到期」那段，都是 overdue 这一类，能按 kind:key 记折叠', () => {
    const od = [t({ scheduled_date: '2026-11-10' }), t({ scheduled_date: '2024-01-01' })];
    const s = backlogSections(od, at('2026-11-11'), '2026-11-11');
    expect(s.map((x) => x.key)).toEqual(['yesterday', 'older']);
    expect(s.map((x) => x.label)).toEqual(['昨天', '超过一年']);
    expect(s.every((x) => x.kind === 'overdue')).toBe(true);
    expect(sectionCollapsed(toggleSectionCollapsed([], s[1]!), s[1]!)).toBe(true);
    expect(toggleSectionCollapsed([], s[1]!)).toEqual(['overdue:older']);
  });
  it('5 段的顺序和名字：昨天 / 过去 7 天 / 过去一个月 / 过去一年 / 超过一年；全空返回空', () => {
    const od = ['2026-11-10', '2026-11-04', '2026-10-12', '2025-11-11', '2025-11-10'].map((d) => t({ scheduled_date: d }));
    const s = backlogSections(od, at('2026-11-11'), '2026-11-11');
    expect(s.map((x) => x.label)).toEqual(['昨天', '过去 7 天', '过去一个月', '过去一年', '超过一年']);
    expect(backlogSections([], at('2026-11-11'), '2026-11-11')).toEqual([]);
  });
});
