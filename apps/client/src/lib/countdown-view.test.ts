import { describe, expect, it } from 'vitest';
import type { Category, Task } from '@mindough/core';
import { DEFAULT_COUNTDOWN_PREFS, normalizeCountdownPrefs, sectionCountdowns, sortCountdowns, withUndated } from './countdown-view';

let k = 0;
const t = (o: Partial<Task> = {}): Task =>
  ({ id: `c${String(++k).padStart(2, '0')}`, group_id: null, mood: null, scheduled_date: null, end_date: null, time_zone: null, target_date: null, created_at: '', ...o }) as unknown as Task;
// 2026-11-11 是周三
const now = new Date('2026-11-11T12:00:00+08:00');
const today = '2026-11-11';

describe('倒数日页：本机记住的视图 / 排序 / 分区（Rei 2026-11-12）', () => {
  it('没存过：卡片、到期日期正序、不分区（保持原来的样子）', () => {
    expect(normalizeCountdownPrefs(undefined)).toEqual(DEFAULT_COUNTDOWN_PREFS);
    expect(DEFAULT_COUNTDOWN_PREFS).toMatchObject({ view: 'card', sort: 'target', dir: 'asc', section: 'none' });
  });
  it('存的值认得就用，认不出回默认；分区不认按项目', () => {
    expect(normalizeCountdownPrefs({ view: 'list', sort: 'added', dir: 'desc', section: 'mood', collapsed: ['mood:none', 3] })).toEqual({
      view: 'list',
      sort: 'added',
      dir: 'desc',
      section: 'mood',
      collapsed: ['mood:none'],
    });
    expect(normalizeCountdownPrefs({ view: 'grid', sort: 'x', dir: 'up', section: 'project' })).toEqual(DEFAULT_COUNTDOWN_PREFS);
    for (const s of ['type', 'due', 'mood', 'none']) expect(normalizeCountdownPrefs({ section: s }).section).toBe(s);
  });
});

describe('倒数日排序', () => {
  // n = 还有几天（负数 = 已过）；created_at 打乱
  const e = (n: number, created: string) => ({ t: t({ created_at: created }), n });
  const a = e(10, '2026-01-03');
  const b = e(0, '2026-01-05');
  const c = e(3, '2026-01-01');
  const p1 = e(-1, '2026-01-02');
  const p30 = e(-30, '2026-01-04');
  const all = [p30, a, p1, c, b];

  it('默认到期日期正序 = 原来的顺序：今天和还没到的越近越前，过了的在后、刚过的在前', () => {
    expect(sortCountdowns(all, 'target', 'asc')).toEqual([b, c, a, p1, p30]);
  });
  it('到期日期倒序：还没到的远的在前；过了的照旧在后、刚过的在前', () => {
    expect(sortCountdowns(all, 'target', 'desc')).toEqual([a, c, b, p1, p30]);
  });
  it('添加日期正序 / 倒序：只排还没到的，过了的规则不变', () => {
    expect(sortCountdowns(all, 'added', 'asc')).toEqual([c, a, b, p1, p30]);
    expect(sortCountdowns(all, 'added', 'desc')).toEqual([b, a, c, p1, p30]);
  });
  it('值一样时保持原来的顺序；不改原数组', () => {
    const x = e(5, '2026-02-01');
    const y = e(5, '2026-02-01');
    const list = [y, x];
    expect(sortCountdowns(list, 'target', 'asc')).toEqual([y, x]);
    expect(sortCountdowns(list, 'target', 'desc')).toEqual([y, x]);
    expect(list).toEqual([y, x]);
  });
});

describe('倒数日分区（规则同我的一天、项目页）', () => {
  it('不分区返回 null', () => {
    expect(sectionCountdowns([t()], 'none')).toBeNull();
  });
  it('按目标日期：看 target_date（不看 scheduled_date），已过期 / 今天 / 本周 / 本月 / 更远，段内顺序不变', () => {
    const later = t({ target_date: '2027-03-01', scheduled_date: '2026-11-11' });
    const past = t({ target_date: '2026-11-01' });
    const tod = t({ target_date: '2026-11-11' });
    const week = t({ target_date: '2026-11-15' });
    const month = t({ target_date: '2026-11-28' });
    const week2 = t({ target_date: '2026-11-13' });
    const s = sectionCountdowns([later, past, tod, week, month, week2], 'due', { now, today, weekStart: 1 })!;
    expect(s.map((x) => x.key)).toEqual(['overdue', 'today', 'week', 'month', 'later']);
    expect(s[2]!.tasks).toEqual([week, week2]);
    // 段里是原来那条任务（不是换了日期的副本）
    expect(s[4]!.tasks[0]).toBe(later);
    expect(s.every((x) => x.kind === 'due')).toBe(true);
  });
  it('按类型：只进第一个类型，没类型的放最后', () => {
    const c = (id: string) => ({ id, name: id, color: '#123456', icon: 'tag', hidden: false }) as unknown as Category;
    const links: Record<string, string[]> = {};
    const mk = (ids: string[]) => {
      const x = t({ target_date: '2026-12-01' });
      links[x.id] = ids;
      return x;
    };
    const a = mk(['trip', 'exam']);
    const b = mk([]);
    const d = mk(['exam']);
    const s = sectionCountdowns([a, b, d], 'type', { categories: [c('exam'), c('trip')], categoryIdsOf: (x) => links[x.id] ?? [] })!;
    expect(s.map((x) => [x.key, x.tasks])).toEqual([
      ['exam', [d]],
      ['trip', [a]],
      ['none', [b]],
    ]);
  });
  it('按心情：从好到坏，没记的最后', () => {
    const x = t({ mood: 'tired' });
    const y = t();
    const z = t({ mood: 'happy' });
    const s = sectionCountdowns([x, y, z], 'mood')!;
    expect(s.map((s1) => s1.key)).toEqual(['happy', 'tired', 'none']);
  });
});

describe('还没选日期的倒数日（Rei 2026-11-12 09:23「新建的立刻显示在列表里」）', () => {
  it('排在最前，新建的在上；有日期的顺序不变', () => {
    const a = t({ target_date: '2026-11-20', created_at: '2026-11-01' });
    const b = t({ target_date: '2026-11-15', created_at: '2026-11-02' });
    const u1 = t({ created_at: '2026-11-12T01:00' });
    const u2 = t({ created_at: '2026-11-12T02:00' });
    const sorted = sortCountdowns([{ t: a, n: 9 }, { t: b, n: 4 }], 'target', 'asc');
    const out = withUndated(sorted, [u1, u2]);
    expect(out.map((e) => e.t.id)).toEqual([u2.id, u1.id, b.id, a.id]);
    expect(out[0]!.n).toBe(0);
  });
  it('没有没选日期的：原样', () => {
    const a = t({ target_date: '2026-11-20' });
    expect(withUndated([{ t: a, n: 9 }], []).map((e) => e.t.id)).toEqual([a.id]);
  });
});
