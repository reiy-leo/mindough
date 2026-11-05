import { describe, expect, it } from 'vitest';
import { fillRiverGaps, laneBase, mixOklabTo, riverData, riverDayAt, riverDays, riverMonths, riverProfile, riverSeed, riverSpan, riverYears, RIVER_RECENT_DAYS } from '../src';
import type { JournalPost } from '../src/types';

let seq = 0;
function post(day: string, mood: string | null, deleted = false): JournalPost {
  seq++;
  return { id: `p${seq}`, updated_at: '0', deleted, day, body_md: 'x', mood, created_at: `${day}T10:00:00.000Z` } as JournalPost;
}

describe('riverDays：画哪几天', () => {
  it('最近 30 天：今天在最上面，往下越来越早', () => {
    const d = riverDays({ kind: 'recent' }, '2026-11-05');
    expect(d).toHaveLength(RIVER_RECENT_DAYS);
    expect(d[0]).toBe('2026-11-05');
    expect(d[1]).toBe('2026-11-04');
    expect(d[29]).toBe('2026-10-07');
  });
  it('过去的整月：上面月底，下面 1 号', () => {
    const d = riverDays({ kind: 'month', year: 2026, month: 10 }, '2026-11-05');
    expect(d).toHaveLength(31);
    expect(d[0]).toBe('2026-10-31');
    expect(d[30]).toBe('2026-10-01');
    const feb = riverDays({ kind: 'month', year: 2028, month: 2 }, '2029-01-01');
    expect(feb[0]).toBe('2028-02-29');
    expect(feb).toHaveLength(29);
  });
  it('本月只画到今天；将来的月份是空的', () => {
    const d = riverDays({ kind: 'month', year: 2026, month: 11 }, '2026-11-05');
    expect(d).toEqual(['2026-11-05', '2026-11-04', '2026-11-03', '2026-11-02', '2026-11-01']);
    expect(riverDays({ kind: 'month', year: 2026, month: 12 }, '2026-11-05')).toEqual([]);
  });
  it('riverSpan 给出第一天和最后一天', () => {
    expect(riverSpan(riverDays({ kind: 'month', year: 2026, month: 10 }, '2026-11-05'))).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(riverSpan([])).toBeNull();
  });
});

describe('riverData：每天每种心情几条', () => {
  const days = ['2026-11-05', '2026-11-04', '2026-11-03'];
  it('按条数排水流，没选心情的排最后；墓碑和范围外的不算', () => {
    const posts = [
      post('2026-11-05', 'anxious'),
      post('2026-11-05', 'anxious'),
      post('2026-11-04', 'happy'),
      post('2026-11-04', null),
      post('2026-11-03', 'happy'),
      post('2026-11-03', 'anxious'),
      post('2026-11-03', 'sad', true),
      post('2026-10-01', 'angry'),
      post('2026-11-03', 'weird-new-mood'),
    ];
    const d = riverData(posts, days);
    expect(d.lanes).toEqual(['anxious', 'happy', null]);
    expect(d.counts).toEqual([
      [2, 0, 0],
      [0, 1, 1],
      [1, 1, 1],
    ]);
    expect(d.total).toBe(7);
  });
  it('一样多时按心情顺序（从好到不好）', () => {
    const d = riverData([post('2026-11-05', 'sad'), post('2026-11-05', 'happy')], days);
    expect(d.lanes).toEqual(['happy', 'sad']);
  });
  it('一条都没有：没有水流，total 0', () => {
    const d = riverData([], days);
    expect(d.lanes).toEqual([]);
    expect(d.total).toBe(0);
    expect(d.counts).toEqual([[], [], []]);
  });
});

describe('fillRiverGaps：没写的日子用前后过渡', () => {
  it('中间空的按距离线性插值', () => {
    const f = fillRiverGaps([[4, 0], [0, 0], [0, 0], [0, 0], [0, 4]]);
    expect(f[1]).toEqual([3, 1]);
    expect(f[2]).toEqual([2, 2]);
    expect(f[3]).toEqual([1, 3]);
    expect(f[0]).toEqual([4, 0]);
  });
  it('开头、结尾空的照抄最近写过的那天', () => {
    const f = fillRiverGaps([[0, 0], [1, 2], [0, 0]]);
    expect(f).toEqual([[1, 2], [1, 2], [1, 2]]);
  });
  it('全空的保持 0，不改原数组', () => {
    const src = [[0, 0], [0, 0]];
    expect(fillRiverGaps(src)).toEqual([[0, 0], [0, 0]]);
    const src2 = [[1], [0]];
    fillRiverGaps(src2);
    expect(src2).toEqual([[1], [0]]);
  });
});

describe('riverProfile：每行各股占多少', () => {
  it('每行加起来是 1；离哪天近就像哪天', () => {
    const days = Array.from({ length: 20 }, (_, i) => (i < 10 ? [5, 0] : [0, 5]));
    const p = riverProfile(days, 30);
    for (let r = 0; r < 30; r++) expect(p[r * 2]! + p[r * 2 + 1]!).toBeCloseTo(1, 5);
    expect(p[0]!).toBeGreaterThan(0.7); // 最上面是第一天：第 0 股多
    expect(p[29 * 2 + 1]!).toBeGreaterThan(0.7); // 最下面：第 1 股多
  });
  it('焦点那股更浓', () => {
    const rows = [[1, 1]];
    const plain = riverProfile(rows, 4);
    const focus = riverProfile(rows, 4, { focus: 1 });
    expect(plain[1]).toBeCloseTo(0.5, 5);
    expect(focus[1]!).toBeGreaterThan(0.8);
  });
  it('没有水流或没有行时返回空', () => {
    expect(riverProfile([], 10)).toHaveLength(0);
    expect(riverProfile([[1]], 0)).toHaveLength(0);
  });
  it('全 0 的行平均分', () => {
    const p = riverProfile([[0, 0, 0]], 2);
    expect(p[0]).toBeCloseTo(1 / 3, 5);
  });
});

describe('其他小工具', () => {
  it('riverDayAt：像素行 → 第几天', () => {
    expect(riverDayAt(0, 300, 30)).toBe(0);
    expect(riverDayAt(299, 300, 30)).toBe(29);
    expect(riverDayAt(500, 300, 30)).toBe(29);
    expect(riverDayAt(-5, 300, 30)).toBe(0);
    expect(riverDayAt(15, 300, 30)).toBe(1);
    expect(riverDayAt(10, 300, 0)).toBe(-1);
  });
  it('laneBase 都在 0.2–0.8 之间', () => {
    for (let i = 0; i < 13; i++) {
      expect(laneBase(i)).toBeGreaterThanOrEqual(0.2);
      expect(laneBase(i)).toBeLessThanOrEqual(0.8);
    }
  });
  it('riverMonths / riverYears：哪些月份有日记、能翻到哪年', () => {
    const posts = [post('2026-10-12', 'happy'), post('2026-07-01', null), post('2026-03-03', 'sad', true), post('2024-12-31', 'calm')];
    const m = riverMonths(posts, 2026);
    expect(m.map((v, i) => (v ? i + 1 : 0)).filter(Boolean)).toEqual([7, 10]);
    expect(riverMonths(posts, 2025).some(Boolean)).toBe(false);
    expect(riverYears(posts, '2026-11-05')).toEqual({ min: 2024, max: 2026 });
    expect(riverYears([], '2026-11-05')).toEqual({ min: 2026, max: 2026 });
  });
  it('riverSeed：数据变了种子跟着变，同样的数据一样', () => {
    const days = ['2026-11-05'];
    const a = riverData([post('2026-11-05', 'happy')], days);
    const b = riverData([post('2026-11-05', 'happy'), post('2026-11-05', 'sad')], days);
    expect(riverSeed(a)).toBe(riverSeed(riverData([post('2026-11-05', 'happy')], days)));
    expect(riverSeed(a)).not.toBe(riverSeed(b));
  });
  it('mixOklabTo：t=0 原色、t=1 目标色，chroma<1 更灰', () => {
    expect(mixOklabTo('#ff0000', '#ffffff', 0)).toBe('#ff0000');
    expect(mixOklabTo('#ff0000', '#ffffff', 1)).toBe('#ffffff');
    const soft = mixOklabTo('#ff0000', '#ffffff', 0.3, 0.8);
    expect(soft).not.toBe('#ff0000');
    expect(mixOklabTo('nope', '#fff', 0.5)).toBe('nope');
  });
});
