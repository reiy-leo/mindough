import { describe, expect, it } from 'vitest';
import { dateQuickState } from '../src/date-range';

const T = '2026-11-08';
const s = (scheduled_date: string | null, end_date: string | null = null) => dateQuickState({ scheduled_date, end_date }, T);

describe('dateQuickState（详情顶栏日期按钮）', () => {
  it('没日期', () => {
    expect(s(null)).toEqual({ kind: 'none', days: 0 });
  });
  it('今天', () => {
    expect(s(T)).toEqual({ kind: 'today', days: 0 });
  });
  it('以后：天数不带符号', () => {
    expect(s('2026-11-13')).toEqual({ kind: 'future', days: 5 });
    expect(s('2026-11-09')).toEqual({ kind: 'future', days: 1 });
  });
  it('以前：天数不带符号', () => {
    expect(s('2026-11-07')).toEqual({ kind: 'past', days: 1 });
    expect(s('2026-10-29')).toEqual({ kind: 'past', days: 10 });
  });
  it('跨月、跨年按日历日算', () => {
    expect(dateQuickState({ scheduled_date: '2027-01-02', end_date: null }, '2026-12-31')).toEqual({ kind: 'future', days: 2 });
    expect(dateQuickState({ scheduled_date: '2026-02-28', end_date: null }, '2026-03-01')).toEqual({ kind: 'past', days: 1 });
  });
  it('日期段含今天算今天（开头、中间、结尾）', () => {
    expect(s('2026-11-06', '2026-11-10').kind).toBe('today');
    expect(s(T, '2026-11-10').kind).toBe('today');
    expect(s('2026-11-01', T).kind).toBe('today');
  });
  it('日期段整体在以后按开始日算', () => {
    expect(s('2026-11-10', '2026-11-20')).toEqual({ kind: 'future', days: 2 });
  });
  it('日期段整体在以前按结束日算', () => {
    expect(s('2026-11-01', '2026-11-05')).toEqual({ kind: 'past', days: 3 });
  });
  it('结束日不晚于开始日当单日', () => {
    expect(s('2026-11-10', '2026-11-09')).toEqual({ kind: 'future', days: 2 });
  });
});
