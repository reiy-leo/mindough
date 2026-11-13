/**
 * 日历格子撑满剩下的空间、页面不上下滚（Rei 2026-11-13 09:44「日历的格子要占满剩下的空间，不能上下滚动。」，docs/CALENDAR.md 第十五节）。
 * 这里只放纯计算，量尺寸在 pages/Calendar.tsx：
 * - 月、多周：每行能放几条（fitLanes），放不下的收成「+N」（cutLanes）；
 * - 年：12 个小月历按宽高挑列数（yearLayout）。
 */
import { useLayoutEffect, useState, type RefObject } from 'react';

/** 一条的高度：.cal-item 22px + 行间距 2px（calendar.css 的 .cal-item height、.cal-row row-gap）。 */
export const CAL_LANE_H = 24;

/**
 * 一行（一周）高 rowH、日期那行高 headH、底下留白 pad 时，能放几条。
 * 没量到尺寸（rowH ≤ 0，测试环境、还没排版）时不限，照旧全列。
 */
export function fitLanes(rowH: number, headH: number, pad = 6): number {
  if (!(rowH > 0)) return Infinity;
  return Math.max(0, Math.floor((rowH - headH - pad) / CAL_LANE_H));
}

export interface LanePlaced {
  col: number;
  span: number;
  lane: number;
}

/**
 * 一行里排好的条目放不下 fit 条时，按天收：
 * - 前 fit−1 条道照画；
 * - 第 fit 条道（最后一条）上的条目：它覆盖的每一天都没有更下面的东西，就照画；否则收起，那几天这一格换成「+N」；
 * - 更下面的都收起。N 是这一天被收起来的件数；跨天的横条算进它覆盖的每一天。
 * 这样只多一件的那天不会出「+1」占掉本来放得下的那一格。全放得下时原样返回、more 全是 0。
 */
export function cutLanes<T extends LanePlaced>(placed: readonly T[], cols: number, fit: number): { shown: T[]; more: number[]; moreLane: number } {
  const more = Array.from({ length: cols }, () => 0);
  const lanes = placed.reduce((m, x) => Math.max(m, x.lane + 1), 0);
  if (lanes <= fit) return { shown: [...placed], more, moreLane: -1 };
  const keep = Math.max(0, fit - 1);
  // 每天用到的最下一道
  const deepest = Array.from({ length: cols }, () => -1);
  for (const x of placed) for (let c = x.col; c < x.col + x.span && c < cols; c++) deepest[c] = Math.max(deepest[c]!, x.lane);
  const covers = (x: T) => Array.from({ length: Math.max(0, Math.min(x.span, cols - x.col)) }, (_, i) => x.col + i);
  const shown: T[] = [];
  for (const x of placed) {
    const show = x.lane < keep || (fit > 0 && x.lane === keep && covers(x).every((c) => deepest[c]! <= keep));
    if (show) shown.push(x);
    else for (const c of covers(x)) more[c]! += 1;
  }
  return { shown, more, moreLane: keep };
}

export interface YearFit {
  cols: number;
  rows: number;
  /** 一格日期的宽、高（px，向下取整）。 */
  dayW: number;
  dayH: number;
}

/**
 * 年视图：W × H 里排 12 个小月历，挑让日期格最大的列数（1、2、3、4、6、12 列）。
 * 每个月 = 标题 titleH + 7 行（星期 1 行 + 6 周，月份短的空着，月和月一样高）。
 * 比较的是 min(格宽, 格高)：格子太扁、太窄都不行。
 */
export function yearLayout(W: number, H: number, opt: { gapX: number; gapY: number; titleH: number }): YearFit | null {
  if (!(W > 0) || !(H > 0)) return null;
  let best: YearFit | null = null;
  let bestScore = -Infinity;
  for (const cols of [1, 2, 3, 4, 6, 12]) {
    const rows = 12 / cols;
    const mw = (W - opt.gapX * (cols - 1)) / cols;
    const mh = (H - opt.gapY * (rows - 1)) / rows;
    const dayW = Math.floor(mw / 7);
    const dayH = Math.floor((mh - opt.titleH) / 7);
    const score = Math.min(dayW, dayH);
    if (score > bestScore) {
      bestScore = score;
      best = { cols, rows, dayW, dayH };
    }
  }
  return best;
}

/** 量一个元素的内容尺寸，跟着窗口改大小变；没有 ResizeObserver（测试环境）时是 0 × 0。 */
export function useBoxSize(ref: RefObject<HTMLElement | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const read = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}
