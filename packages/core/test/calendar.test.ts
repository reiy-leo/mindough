import { describe, expect, it } from 'vitest';
import { calRange, calItemTier, dayCount, layoutRow, normalizeCalView, sortDayItems, stepCalAnchor, yearMonths, type CalCellItem } from '../src/calendar/views';
import { parseIcsEvents, resolveTzid, wallToMs } from '../src/calendar/ics-events';
import { calSubDue, holidayCell, nextSubColor } from '../src/calendar/subs';
import type { SubEvent } from '../src/lunar/ics';

describe('calendar views', () => {
  it('normalizes stored view', () => {
    expect(normalizeCalView(null)).toEqual({ kind: 'week', days: 3, weeks: 2 });
    expect(normalizeCalView({ kind: 'days', days: 40, weeks: 0 })).toEqual({ kind: 'days', days: 14, weeks: 1 });
    expect(normalizeCalView({ kind: 'nope', days: 1 })).toMatchObject({ kind: 'week', days: 2 });
    // 已经记住视图的设备照旧
    expect(normalizeCalView({ kind: 'month', days: 3, weeks: 2 }).kind).toBe('month');
  });

  it('week range respects week start', () => {
    // 2026-11-10 是周二
    const mon = calRange({ kind: 'week', days: 3, weeks: 2 }, '2026-11-10', 1);
    expect(mon.from).toBe('2026-11-09');
    expect(mon.to).toBe('2026-11-15');
    const sun = calRange({ kind: 'week', days: 3, weeks: 2 }, '2026-11-10', 0);
    expect(sun.from).toBe('2026-11-08');
  });

  it('month range fills whole weeks', () => {
    const r = calRange({ kind: 'month', days: 3, weeks: 2 }, '2026-11-10', 1);
    expect(r.from).toBe('2026-10-26');
    expect(r.to).toBe('2026-12-06');
    expect(r.rows.length).toBe(6);
    expect(r.rows.every((x) => x.length === 7)).toBe(true);
    expect(r.coreFrom).toBe('2026-11-01');
    expect(r.coreTo).toBe('2026-11-30');
  });

  it('multi-day and multi-week', () => {
    const d = calRange({ kind: 'days', days: 5, weeks: 2 }, '2026-12-30', 1);
    expect(d.rows).toEqual([['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']]);
    const w = calRange({ kind: 'weeks', days: 3, weeks: 3 }, '2026-11-10', 1);
    expect(w.rows.length).toBe(3);
    expect(w.to).toBe('2026-11-29');
  });

  it('steps by view', () => {
    expect(stepCalAnchor({ kind: 'month', days: 3, weeks: 2 }, '2026-01-31', 1)).toBe('2026-02-28');
    expect(stepCalAnchor({ kind: 'days', days: 4, weeks: 2 }, '2026-11-10', -1)).toBe('2026-11-06');
    expect(stepCalAnchor({ kind: 'weeks', days: 3, weeks: 2 }, '2026-11-10', 1)).toBe('2026-11-24');
    expect(stepCalAnchor({ kind: 'year', days: 3, weeks: 2 }, '2024-02-29', 1)).toBe('2025-02-28');
  });

  it('year months pad to weeks', () => {
    const ms = yearMonths(2026, 1);
    expect(ms.length).toBe(12);
    // 2026-02-01 是周日：周一开头前面空 6 格
    expect(ms[1]!.cells.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-02-01']);
    expect(ms.every((m) => m.cells.length % 7 === 0)).toBe(true);
  });

  it('lays out spans into lanes', () => {
    const row = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
    const { placed, perDay } = layoutRow(row, [
      { id: 'a', start: '2026-11-05', end: '2026-11-10' },
      { id: 'b', start: '2026-11-10', end: '2026-11-12' },
      { id: 'c', start: '2026-11-11', end: '2026-11-11' },
      { id: 'd', start: '2026-11-15', end: '2026-11-20' },
      { id: 'x', start: '2026-11-20', end: '2026-11-21' },
    ]);
    const by = Object.fromEntries(placed.map((p) => [p.item.id, p]));
    expect(by.a).toMatchObject({ col: 0, span: 2, lane: 0, contLeft: true, contRight: false });
    expect(by.b).toMatchObject({ col: 1, span: 3, lane: 1 });
    expect(by.c).toMatchObject({ col: 2, lane: 0 });
    expect(by.d).toMatchObject({ col: 6, span: 1, contRight: true });
    expect(by.x).toBeUndefined();
    expect(perDay).toEqual([1, 2, 2, 1, 0, 0, 1]);
  });
});

const wrap = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:测试\r\n${body}\r\nEND:VCALENDAR\r\n`;
const W = { from: '2026-01-01', to: '2026-12-31' };

describe('parseIcsEvents', () => {
  it('rejects non ics', () => {
    expect(parseIcsEvents('hello', W)).toBeNull();
  });

  it('all-day and timed with tz, location, description', () => {
    const r = parseIcsEvents(
      wrap(
        [
          'BEGIN:VEVENT',
          'UID:1',
          'SUMMARY:出差',
          'DTSTART;VALUE=DATE:20261110',
          'DTEND;VALUE=DATE:20261113',
          'END:VEVENT',
          'BEGIN:VEVENT',
          'UID:2',
          'SUMMARY:开会\\, 周会',
          'LOCATION:3 楼',
          'DESCRIPTION:第一行\\n第二行',
          'DTSTART;TZID=America/New_York:20261110T090000',
          'DTEND;TZID=America/New_York:20261110T100000',
          'BEGIN:VALARM',
          'DESCRIPTION:提醒',
          'END:VALARM',
          'END:VEVENT',
          'BEGIN:VEVENT',
          'UID:3',
          'SUMMARY:取消了',
          'STATUS:CANCELLED',
          'DTSTART:20261110T010000Z',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      W,
    )!;
    expect(r.name).toBe('测试');
    expect(r.events.length).toBe(2);
    const a = r.events.find((e) => e.title === '出差')!;
    expect(a).toMatchObject({ allDay: true, startDate: '2026-11-10', endDate: '2026-11-12' });
    const b = r.events.find((e) => e.allDay === false)!;
    expect(b.title).toBe('开会, 周会');
    expect(b.location).toBe('3 楼');
    expect(b.description).toBe('第一行\n第二行');
    // 纽约 11 月是 EST（UTC-5）
    expect(new Date(b.startMs!).toISOString()).toBe('2026-11-10T14:00:00.000Z');
    expect(b.endMs! - b.startMs!).toBe(3_600_000);
  });

  it('windows tz names and folded lines', () => {
    expect(resolveTzid('China Standard Time')).toBe('Asia/Shanghai');
    expect(resolveTzid('/mozilla.org/20050126_1/Europe/Berlin')).toBe('Europe/Berlin');
    expect(resolveTzid('Mars/Base')).toBeNull();
    const r = parseIcsEvents(wrap('BEGIN:VEVENT\r\nUID:f\r\nSUMMARY:很长的\r\n 标题\r\nDTSTART;TZID=China Standard Time:20260301T080000\r\nDURATION:PT30M\r\nEND:VEVENT'), W)!;
    expect(r.events[0]!.title).toBe('很长的标题');
    expect(new Date(r.events[0]!.startMs!).toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(r.events[0]!.endMs! - r.events[0]!.startMs!).toBe(1_800_000);
  });

  it('DST-aware wall time', () => {
    // 纽约 7 月 EDT（UTC-4）
    expect(new Date(wallToMs({ date: '2026-07-01', h: 9, mi: 0, s: 0 }, 'America/New_York')).toISOString()).toBe('2026-07-01T13:00:00.000Z');
  });

  it('weekly byday with count, exdate and override', () => {
    const r = parseIcsEvents(
      wrap(
        [
          'BEGIN:VEVENT',
          'UID:w',
          'SUMMARY:健身',
          'DTSTART:20261102T120000Z',
          'DTEND:20261102T130000Z',
          'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5',
          'EXDATE:20261104T120000Z',
          'END:VEVENT',
          'BEGIN:VEVENT',
          'UID:w',
          'RECURRENCE-ID:20261109T120000Z',
          'SUMMARY:健身（改到下午）',
          'DTSTART:20261109T150000Z',
          'DTEND:20261109T160000Z',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      W,
    )!;
    const starts = r.events.map((e) => `${new Date(e.startMs!).toISOString().slice(0, 13)} ${e.title}`);
    expect(starts).toEqual(['2026-11-02T12 健身', '2026-11-09T15 健身（改到下午）', '2026-11-11T12 健身', '2026-11-16T12 健身']);
  });

  it('monthly nth weekday, yearly, until, window', () => {
    const r = parseIcsEvents(
      wrap(
        [
          'BEGIN:VEVENT',
          'UID:m',
          'SUMMARY:月会',
          'DTSTART;VALUE=DATE:20260112',
          'RRULE:FREQ=MONTHLY;BYDAY=2MO;UNTIL=20260430',
          'END:VEVENT',
          'BEGIN:VEVENT',
          'UID:y',
          'SUMMARY:生日',
          'DTSTART;VALUE=DATE:20200815',
          'RRULE:FREQ=YEARLY',
          'END:VEVENT',
          'BEGIN:VEVENT',
          'UID:d',
          'SUMMARY:每两天',
          'DTSTART;VALUE=DATE:20261225',
          'RRULE:FREQ=DAILY;INTERVAL=2',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      W,
    )!;
    expect(r.events.filter((e) => e.title === '月会').map((e) => e.startDate)).toEqual(['2026-01-12', '2026-02-09', '2026-03-09', '2026-04-13']);
    expect(r.events.filter((e) => e.title === '生日').map((e) => e.startDate)).toEqual(['2026-08-15']);
    expect(r.events.filter((e) => e.title === '每两天').map((e) => e.startDate)).toEqual(['2026-12-25', '2026-12-27', '2026-12-29', '2026-12-31']);
  });

  it('caps events', () => {
    const r = parseIcsEvents(wrap('BEGIN:VEVENT\r\nUID:z\r\nSUMMARY:天天\r\nDTSTART;VALUE=DATE:20260101\r\nRRULE:FREQ=DAILY\r\nEND:VEVENT'), { ...W, max: 10 })!;
    expect(r.events.length).toBe(10);
    expect(r.truncated).toBe(true);
  });
});

describe('subs helpers', () => {
  it('picks unused color', () => {
    expect(nextSubColor([])).toBe('blue');
    expect(nextSubColor([{ color: 'blue', deleted: false }, { color: 'green', deleted: true }])).toBe('green');
  });

  it('due rules', () => {
    const now = Date.parse('2026-11-10T12:00:00Z');
    expect(calSubDue(null, 'u', now)).toBe(true);
    expect(calSubDue({ url: 'u', okAt: '2026-11-10T08:00:00Z', triedAt: '2026-11-10T08:00:00Z', status: null }, 'u', now)).toBe(false);
    expect(calSubDue({ url: 'u', okAt: '2026-11-10T05:00:00Z', triedAt: '2026-11-10T05:00:00Z', status: null }, 'u', now)).toBe(true);
    expect(calSubDue({ url: 'u', okAt: '2026-11-10T05:00:00Z', triedAt: '2026-11-10T11:30:00Z', status: null }, 'u', now)).toBe(false);
    expect(calSubDue({ url: 'u', okAt: null, triedAt: '2026-11-10T11:30:00Z', status: null }, 'u', now)).toBe(false);
    expect(calSubDue({ url: 'old', okAt: '2026-11-10T11:00:00Z', triedAt: null, status: null }, 'u', now)).toBe(true);
  });

  it('holiday cell without lunar keeps only off / work', () => {
    const ev = (title: string, kind: SubEvent['kind']): SubEvent => ({ date: '2026-10-01', title, kind });
    expect(holidayCell([ev('霜降', 'event')], false)).toBeNull();
    expect(holidayCell([ev('国庆节', 'event'), ev('国庆节（休）', 'off')], false)).toEqual({ label: '国庆节', badge: 'off', titles: ['国庆节（休）'] });
    expect(holidayCell([ev('补班', 'work')], false)).toMatchObject({ label: null, badge: 'work' });
    expect(holidayCell([ev('国庆节', 'event'), ev('国庆节（休）', 'off')], true)).toMatchObject({ label: '国庆节', badge: 'off' });
  });
});

describe('一天的顺序和个数（Rei 2026-11-11 01:08 / 01:10）', () => {
  const day = '2026-11-11';
  const it_ = (id: string, role: CalCellItem['role'], start = day, end = start, extra: Partial<CalCellItem> = {}): CalCellItem => ({ id, role, start, end, ...extra });
  it('个数 = 任务 + 打卡 + 倒数日，订阅事件不算，不在这天的不算', () => {
    expect(dayCount(day, [it_('t', 'task'), it_('e', 'event'), it_('c', 'checkin'), it_('cd', 'countdown'), it_('x', 'task', '2026-11-12')])).toBe(3);
    expect(dayCount(day, [it_('c1', 'checkin'), it_('c2', 'checkin')])).toBe(2);
  });
  it('列表：倒数日 → 任务（那天开始的、短的在前）→ 订阅事件（全天在前，再按时间）', () => {
    const r = sortDayItems(day, [
      it_('late', 'event', day, day, { startMs: 2000 }),
      it_('long', 'task', '2026-11-01', '2026-11-30'),
      it_('early', 'event', day, day, { startMs: 1000 }),
      it_('span', 'task', day, '2026-11-13'),
      it_('cd', 'countdown'),
      it_('one', 'task'),
      it_('all', 'event', day, day, { allDay: true }),
    ]);
    expect(r.map((x) => x.id)).toEqual(['cd', 'one', 'span', 'long', 'all', 'early', 'late']);
  });
  it('分档排道：每一天倒数日在任务上面，任务在订阅事件上面', () => {
    const row = ['2026-11-09', '2026-11-10', '2026-11-11'];
    const items = [
      it_('ev', 'event', '2026-11-10'),
      it_('span', 'task', '2026-11-09', '2026-11-10'),
      it_('cd', 'countdown', '2026-11-09'),
      it_('ev2', 'event', '2026-11-11'),
    ];
    const { placed } = layoutRow(row, items, (x) => calItemTier(x.role));
    const by = Object.fromEntries(placed.map((p) => [p.item.id, p]));
    expect(by.cd!.lane).toBe(0);
    expect(by.span!.lane).toBe(1);
    // 11-10 那天倒数日没有，但事件仍排在跨过来的任务下面
    expect(by.ev!.lane).toBe(2);
    // 11-11 只有事件，从最上面开始
    expect(by.ev2!.lane).toBe(0);
  });
});
