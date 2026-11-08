// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '@mindough/core';
import { applyLocalePref } from './i18n';
import { dateQuickTip, dateQuickView } from './date-quick';

const store = { now: () => new Date('2026-11-08T10:00:00+08:00') };
const T = '2026-11-08';
const v = (scheduled_date: string | null, end_date: string | null = null, time_zone: string | null = null) =>
  dateQuickView(store, { scheduled_date, end_date, time_zone }, T);

afterEach(() => setLocale('zh'));

describe('详情顶栏日期按钮（Rei 2026-11-08）', () => {
  it('四种状态：没日期 / 今天 / 以后 / 以前，数字不带符号', () => {
    applyLocalePref('zh');
    expect(v(null)).toEqual({ kind: 'none', count: null, when: '没有日期' });
    expect(v(T)).toEqual({ kind: 'today', count: null, when: '今天' });
    expect(v('2026-11-13')).toEqual({ kind: 'future', count: 5, when: '5 天后' });
    expect(v('2026-11-07')).toEqual({ kind: 'past', count: 1, when: '1 天前' });
  });
  it('日期段：含今天算今天，整段在后按开始日，整段在前按结束日', () => {
    applyLocalePref('zh');
    expect(v('2026-11-06', '2026-11-10').kind).toBe('today');
    expect(v('2026-11-10', '2026-11-12').count).toBe(2);
    expect(v('2026-11-01', '2026-11-05').count).toBe(3);
  });
  it('「今天」按任务时区算', () => {
    applyLocalePref('zh');
    // 北京 11-08 10:00 时，洛杉矶还是 11-07
    expect(v('2026-11-07', null, 'America/Los_Angeles').kind).toBe('today');
    expect(v('2026-11-08', null, 'America/Los_Angeles')).toMatchObject({ kind: 'future', count: 1 });
  });
  it('英文单复数', () => {
    applyLocalePref('en');
    expect(v('2026-11-09').when).toBe('In 1 day');
    expect(v('2026-11-13').when).toBe('In 5 days');
    expect(v('2026-11-07').when).toBe('1 day ago');
    expect(v(null).when).toBe('No Date');
  });
  it('悬停提示：含义 + 日期，相同就只留一个', () => {
    applyLocalePref('zh');
    const f = v('2026-11-13');
    expect(dateQuickTip(f, '11月13日 周五')).toBe('5 天后 · 11月13日 周五');
    expect(dateQuickTip(v(T), '今天')).toBe('今天');
    expect(dateQuickTip(v(null), '')).toBe('没有日期');
  });
});
