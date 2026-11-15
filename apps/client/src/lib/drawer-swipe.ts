/**
 * 手机抽屉侧栏向左滑关掉（Rei 2026-11-15 手机导航改版）：手指在抽屉上往左拖，抽屉跟着手走；
 * 松手时拖过抽屉宽度的三成，或者往左甩得够快，就关；不然弹回去。上下滑是在滚列表，不算。
 */

/** 手指挪了多少才认方向（px）。 */
export const SWIPE_SLOP = 10;

/** 认方向：横着挪得比竖着多、超过 SWIPE_SLOP 才算横滑；竖着先超过就是滚动，这一下不再管。 */
export function swipeAxis(dx: number, dy: number): 'x' | 'y' | null {
  if (Math.abs(dx) < SWIPE_SLOP && Math.abs(dy) < SWIPE_SLOP) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}

/** 抽屉跟手的位移：只能往左（≤ 0），不超过抽屉宽度。 */
export function swipeOffset(dx: number, width: number): number {
  return Math.max(-width, Math.min(0, dx));
}

/** 松手关不关：拖过三成宽，或者速度（px/ms，往左为负）快过 0.4 且确实往左挪了一点。 */
export function swipeShouldClose(dx: number, velocity: number, width: number): boolean {
  if (dx <= -width * 0.3) return true;
  return velocity < -0.4 && dx < -SWIPE_SLOP;
}
