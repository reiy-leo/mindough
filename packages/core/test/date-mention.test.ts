/** @ 插进正文的日期（Rei 2026-11-20 12:08）：地址读写、精度、插入的值、相对显示要的几样、显示偏好。 */
import { describe, expect, it } from 'vitest';
import {
  calendarDayDiff,
  dateMentionFor,
  dateMentionHref,
  dateMentionMsOf,
  dateMentionPrecision,
  formatDateMention,
  normalizeDateMentionDisplay,
  relativeDateParts,
} from '../src/date-mention';
import { formatUtcOffset } from '../src/timezone';

const now = new Date(2026, 10, 20, 12, 3, 45, 678);

describe('地址', () => {
  it('毫秒 ⇄ __datetime: 地址', () => {
    expect(dateMentionHref(1763611380000)).toBe('__datetime:1763611380000');
    expect(dateMentionMsOf('__datetime:1763611380000')).toBe(1763611380000);
    expect(dateMentionMsOf(' __datetime:0 ')).toBe(0);
    expect(dateMentionMsOf('__datetime:-86400000')).toBe(-86400000);
  });
  it('别的地址、带别的东西的不算', () => {
    for (const h of [null, undefined, '', '__datetime:', '__datetime:abc', '__datetime:12.5', '__datetime:1/2', 'https://__datetime:1', '__date:1', '__datetime:1?x', 'mindough://task/x', '__datetime:99999999999999999'])
      expect(dateMentionMsOf(h as string), String(h)).toBeNull();
  });
});

describe('精度和插入的值', () => {
  it('方括号里带 HH:mm 是日期时间，不带是整天', () => {
    expect(dateMentionPrecision('2026-11-20 12:03')).toBe('datetime');
    expect(dateMentionPrecision('2026-11-20')).toBe('date');
  });
  it('当前时间到分钟，今天 / 明天 / 昨天是本机 0 点', () => {
    expect(dateMentionFor('datetime', now)).toEqual({ label: '2026-11-20 12:03', ms: new Date(2026, 10, 20, 12, 3).getTime() });
    expect(dateMentionFor('date', now)).toEqual({ label: '2026-11-20', ms: new Date(2026, 10, 20).getTime() });
    expect(dateMentionFor('tomorrow', now)).toEqual({ label: '2026-11-21', ms: new Date(2026, 10, 21).getTime() });
    expect(dateMentionFor('yesterday', now)).toEqual({ label: '2026-11-19', ms: new Date(2026, 10, 19).getTime() });
    expect(dateMentionFor('tomorrow', new Date(2026, 11, 31, 23, 59)).label).toBe('2027-01-01');
    expect(dateMentionFor('yesterday', new Date(2028, 2, 1, 0, 1)).label).toBe('2028-02-29');
  });
  it('绝对写法往返', () => {
    const m = dateMentionFor('datetime', now);
    expect(formatDateMention(m.ms, 'datetime')).toBe(m.label);
    expect(formatDateMention(dateMentionFor('date', now).ms, 'date')).toBe('2026-11-20');
  });
});

describe('相对显示', () => {
  it('按自然日算差几天，不按 24 小时', () => {
    expect(calendarDayDiff(new Date(2026, 10, 20, 0, 0).getTime(), now)).toBe(0);
    expect(calendarDayDiff(new Date(2026, 10, 20, 23, 59).getTime(), now)).toBe(0);
    expect(calendarDayDiff(new Date(2026, 10, 21, 0, 1).getTime(), new Date(2026, 10, 20, 23, 59))).toBe(1);
    expect(calendarDayDiff(new Date(2026, 10, 17).getTime(), now)).toBe(-3);
    expect(calendarDayDiff(new Date(2026, 10, 25, 9, 30).getTime(), now)).toBe(5);
    expect(calendarDayDiff(new Date(2027, 0, 1).getTime(), new Date(2026, 11, 31, 22))).toBe(1);
  });
  it('日期时间带时刻，整天没有；时区是本机在那一刻的偏移', () => {
    const at = new Date(2026, 10, 25, 9, 30);
    expect(relativeDateParts(at.getTime(), 'datetime', now)).toEqual({ days: 5, time: '09:30', zone: formatUtcOffset(-at.getTimezoneOffset()) });
    expect(relativeDateParts(new Date(2026, 10, 21).getTime(), 'date', now)).toMatchObject({ days: 1, time: null });
  });
});

describe('显示偏好', () => {
  it('只有 relative 是相对，别的都当绝对（默认）', () => {
    expect(normalizeDateMentionDisplay('relative')).toBe('relative');
    for (const v of [undefined, null, '', 'absolute', 'x', 1]) expect(normalizeDateMentionDisplay(v)).toBe('absolute');
  });
});
