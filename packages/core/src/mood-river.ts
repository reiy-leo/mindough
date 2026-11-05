/**
 * 心情河流（Rei 2026-11-05 定稿，docs/JOURNAL.md「2026-11-05：心情河流」）：日记左栏活动图下面，取代心情条形列表。
 * 这里只放纯逻辑：画哪几天（最近 30 天 / 某个月）、每天每种心情几条、没写的日子怎么过渡、每一行像素该混多少、
 * 哪些月份有日记。像素怎么画在客户端 lib/mood-river-paint.ts。
 *
 * - 一行一天，最上面是最近的一天（最近 30 天：今天；某个月：月底，本月就是今天），往下越来越早。
 * - 一种心情一股「水流」（lane），按这段时间里的条数从多到少排；没选心情的条目单独一股（id 为 null），排最后。
 * - 某几天没写：用前后最近写过的两天按距离线性过渡；开头、结尾没写的照抄最近写过的那天。
 */
import { addDays, diffDays } from './dates';
import { isMoodId, MOOD_IDS, type MoodId } from './journal';
import type { DateKey, JournalPost } from './types';

/** 河流画哪段：默认最近 30 天，或者某年某月（month 1–12）。 */
export type RiverRange = { kind: 'recent' } | { kind: 'month'; year: number; month: number };

export const RIVER_RECENT_DAYS = 30;

const pad = (n: number) => String(n).padStart(2, '0');
const monthEnd = (year: number, month: number): DateKey => {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(last)}`;
};

/**
 * 河流从上到下的日子。最近 30 天：今天、昨天……一共 30 天。
 * 某个月：月底到 1 号；本月只画到今天（往后的日子还没到）；整个月都在将来返回空。
 */
export function riverDays(range: RiverRange, today: DateKey): DateKey[] {
  if (range.kind === 'recent') return Array.from({ length: RIVER_RECENT_DAYS }, (_, i) => addDays(today, -i));
  const first = `${range.year}-${pad(range.month)}-01`;
  if (first > today) return [];
  const end = monthEnd(range.year, range.month);
  const top = end > today ? today : end;
  const n = diffDays(first, top) + 1;
  return Array.from({ length: n }, (_, i) => addDays(top, -i));
}

/** riverDays 的第一天和最后一天（给 moodCounts 用）；空的返回 null。 */
export function riverSpan(days: readonly DateKey[]): { from: DateKey; to: DateKey } | null {
  if (!days.length) return null;
  return { from: days[days.length - 1]!, to: days[0]! };
}

export interface RiverData {
  /** 从上到下的日子（和 riverDays 一样）。 */
  days: DateKey[];
  /** 每股水流的心情；null = 没选心情的条目。按条数从多到少，一样多的按 MOOD_IDS 顺序，null 最后。 */
  lanes: Array<MoodId | null>;
  /** counts[天][股]：那天那种心情几条（真实条数，没补）。 */
  counts: number[][];
  /** 这段时间一共几条。0 就画空状态的灰雾。 */
  total: number;
}

/** 数这几天每种心情几条（墓碑不算，不认识的心情算「没选心情」）。 */
export function riverData(posts: readonly JournalPost[], days: readonly DateKey[]): RiverData {
  const index = new Map(days.map((d, i) => [d, i] as const));
  const perDay = days.map(() => new Map<MoodId | null, number>());
  const totals = new Map<MoodId | null, number>();
  let total = 0;
  for (const p of posts) {
    if (p.deleted) continue;
    const i = index.get(p.day);
    if (i === undefined) continue;
    const m: MoodId | null = isMoodId(p.mood) ? p.mood : null;
    perDay[i]!.set(m, (perDay[i]!.get(m) ?? 0) + 1);
    totals.set(m, (totals.get(m) ?? 0) + 1);
    total++;
  }
  const order = (m: MoodId | null) => (m === null ? MOOD_IDS.length : MOOD_IDS.indexOf(m));
  const lanes = [...totals.keys()].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0) || order(a) - order(b));
  const counts = perDay.map((map) => lanes.map((m) => map.get(m) ?? 0));
  return { days: [...days], lanes, counts, total };
}

/**
 * 没写的日子补上（Rei：「某几天没写：用前后几天颜色过渡」）：前后最近写过的两天按距离线性插值；
 * 开头 / 结尾没写的照抄最近写过的那天。一天都没写的返回全 0。返回新数组，不改 counts。
 */
export function fillRiverGaps(counts: readonly (readonly number[])[]): number[][] {
  const has = counts.map((row) => row.some((v) => v > 0));
  const filled = counts.map((row) => [...row]);
  const marks = has.flatMap((h, i) => (h ? [i] : []));
  if (!marks.length) return filled;
  for (let i = 0; i < counts.length; i++) {
    if (has[i]) continue;
    let prev = -1;
    let next = -1;
    for (const m of marks) {
      if (m < i) prev = m;
      else if (m > i) {
        next = m;
        break;
      }
    }
    const a = prev >= 0 ? counts[prev]! : null;
    const b = next >= 0 ? counts[next]! : null;
    if (a && b) {
      const t = (i - prev) / (next - prev);
      filled[i] = a.map((v, k) => v * (1 - t) + (b[k] ?? 0) * t);
    } else filled[i] = [...(a ?? b)!];
  }
  return filled;
}

/**
 * 每一行像素各股水流占多少（0–1，加起来是 1）：第 w 天的中心在 (w + 0.5) / 天数 处，
 * 按高斯（宽 sigma 天）把附近几天的条数加起来，再归一。rows = 画布的行数。
 * focus = 胶囊点中的那股（下标）：它的份量 ×2.6，其余 ×0.45 再归一，颜色就更浓。
 * 返回 Float32Array，第 r 行第 k 股在 r * lanes + k。
 */
export function riverProfile(filled: readonly (readonly number[])[], rows: number, opts: { sigma?: number; focus?: number | null } = {}): Float32Array {
  const n = filled.length;
  const lanes = filled[0]?.length ?? 0;
  const out = new Float32Array(Math.max(0, rows) * lanes);
  if (!n || !lanes || rows <= 0) return out;
  const sigma = opts.sigma ?? 3.2;
  const focus = opts.focus ?? null;
  for (let r = 0; r < rows; r++) {
    const y = ((r + 0.5) / rows) * n; // 以「天」为单位的位置
    let sum = 0;
    for (let k = 0; k < lanes; k++) {
      let a = 0;
      for (let w = 0; w < n; w++) {
        const d = (y - (w + 0.5)) / sigma;
        if (d > 4 || d < -4) continue;
        a += filled[w]![k]! * Math.exp(-d * d);
      }
      if (focus !== null && focus >= 0 && focus < lanes) a *= k === focus ? 2.6 : 0.45;
      out[r * lanes + k] = a;
      sum += a;
    }
    for (let k = 0; k < lanes; k++) out[r * lanes + k] = sum > 0 ? out[r * lanes + k]! / sum : 1 / lanes;
  }
  return out;
}

/** 第 i 股水流的基准横向位置（0–1）：用黄金分割错开，落在 0.22–0.78 之间，前两股分在左右。 */
export function laneBase(i: number): number {
  const fixed = [0.32, 0.72, 0.5, 0.25, 0.68];
  if (i < fixed.length) return fixed[i]!;
  return 0.22 + (((i * 0.618034 + 0.17) % 1) * 0.56);
}

/** 画布上第 y 像素（从上往下，高 height）对应哪天的下标；超出范围夹到两头。 */
export function riverDayAt(y: number, height: number, days: number): number {
  if (days <= 0 || height <= 0) return -1;
  return Math.min(days - 1, Math.max(0, Math.floor((y / height) * days)));
}

/** 某年 12 个月各有没有日记（月份选择器里没日记的灰掉）。 */
export function riverMonths(posts: readonly JournalPost[], year: number): boolean[] {
  const out = Array.from({ length: 12 }, () => false);
  const prefix = `${year}-`;
  for (const p of posts) {
    if (p.deleted || !p.day.startsWith(prefix)) continue;
    const m = Number(p.day.slice(5, 7));
    if (m >= 1 && m <= 12) out[m - 1] = true;
  }
  return out;
}

/** 月份选择器能翻到的年份：最早一条那年到今年（没有日记就只有今年）。 */
export function riverYears(posts: readonly JournalPost[], today: DateKey): { min: number; max: number } {
  const max = Number(today.slice(0, 4));
  let min = max;
  for (const p of posts) {
    if (p.deleted) continue;
    const y = Number(p.day.slice(0, 4));
    if (y < min) min = y;
  }
  return { min, max };
}

/** 数据的「指纹」：数据变了，软边的噪声换个起点，边形跟着变（Rei 认可的第七版稿）。 */
export function riverSeed(data: RiverData): number {
  let h = 2166136261;
  const s = `${data.days[0] ?? ''}|${data.total}|${data.counts.map((r) => r.join(',')).join(';')}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 37;
}
