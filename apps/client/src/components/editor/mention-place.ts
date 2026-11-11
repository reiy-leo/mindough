/**
 * @ 候选浮层放哪儿（Rei 2026-11-12 06:56：Mac 右侧详情栏里打「@类型」，浮层跳到窗口左上角）。
 *
 * 原因：浮层按 coordsAtPos 量出来的位置放。输入法刚上屏、ProseMirror 正在换文字节点的那一下，
 * 量到的节点可能已经不在页面上了，coordsAtPos 不报错，给回一个全是 0 的矩形，浮层就被放到 (8, 8)。
 * 现在：量出来的矩形先过 usableRect，不像样就当没量到；没量到时浮层留在上一次的位置，下一帧再量。
 */

export interface Coords {
  left: number;
  top: number;
  bottom: number;
}

/** 矩形能不能用：数字正常、不是全 0、高度不为负；给了编辑器的框就还得落在框里（留 24px 余量）。 */
export function usableRect(c: Coords | null | undefined, box?: { left: number; top: number; right: number; bottom: number } | null): c is Coords {
  if (!c) return false;
  const { left, top, bottom } = c;
  if (![left, top, bottom].every(Number.isFinite)) return false;
  if (bottom < top) return false;
  if (Math.abs(left) < 0.5 && Math.abs(top) < 0.5 && Math.abs(bottom) < 0.5) return false;
  if (box) {
    // 编辑器自己的框也是 0（整块不在页面上）就不认
    if (box.right - box.left <= 0 && box.bottom - box.top <= 0) return false;
    const m = 24;
    if (left < box.left - m || left > box.right + m || top < box.top - m || bottom > box.bottom + m) return false;
  }
  return true;
}

/**
 * 浮层贴哪儿：竖直方向跟光标那一行；横向和 @ 对齐（@ 和光标不在同一行时跟光标）。
 * at = 光标处，start = @ 处，哪个没量到就用另一个。
 */
export function mentionAnchor(start: Coords | null, at: Coords | null): Coords | null {
  if (!at) return start;
  if (!start) return at;
  return Math.abs(start.top - at.top) < 4 ? { left: start.left, top: at.top, bottom: at.bottom } : at;
}

/** 浮层左上角（视口坐标）：放在那一行下面 6px，下面放不下、上面放得下就翻到上面；横向不出窗口，四周留 8px。 */
export function placeMentionPop(
  c: Coords,
  pop: { width: number; height: number },
  view: { top: number; bottom: number; width: number },
): { left: number; top: number } {
  const left = Math.max(8, Math.min(c.left - 8, view.width - pop.width - 8));
  let top = c.bottom + 6;
  if (top + pop.height > view.bottom - 8 && c.top - 6 - pop.height >= view.top + 8) top = c.top - 6 - pop.height;
  return { left, top: Math.max(view.top + 8, top) };
}
