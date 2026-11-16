/**
 * 一行横着滑的小工具（心情选择 MoodGrid 用，Rei 2026-11-16「参照项目图标选择器那样的横向滚动」）。
 * - markMore：两头还有没有藏着的格子，写到 data-more-start / data-more-end 上，CSS 按它渐隐（同 IconPicker）。
 * - reveal：把一格横着滚进视野，只滚这一行，不带着弹层一起滚。
 * - wheelDelta：电脑上竖着滚的滚轮也让这一行横着走（触控板本来就是横滑，不管）；返回这一下该横着挪多少，0 = 不接手。
 */

export function markMore(el: HTMLElement) {
  const max = el.scrollWidth - el.clientWidth;
  const x = Math.abs(el.scrollLeft); // 从右往左的语言 scrollLeft 是负的
  el.toggleAttribute('data-more-start', x > 1);
  el.toggleAttribute('data-more-end', max - x > 1);
}

/** fade = 两头渐隐的那一截，格子要露在它外面。 */
export function reveal(box: HTMLElement, cell: HTMLElement, { center = false, fade = 24 } = {}) {
  // box 是 position: relative，offsetLeft 就是格子在这一行里的位置
  const left = cell.offsetLeft;
  const right = left + cell.offsetWidth;
  if (center) box.scrollLeft = Math.max(0, left - box.clientWidth / 2 + cell.offsetWidth / 2);
  else if (left - fade < box.scrollLeft) box.scrollLeft = Math.max(0, left - fade);
  else if (right + fade > box.scrollLeft + box.clientWidth) box.scrollLeft = right + fade - box.clientWidth;
}

/**
 * 滚轮换成横向：竖向分量大于横向时接手（触控板横滑、Shift+滚轮浏览器自己会横滚，不管）；按住 Ctrl（缩放）不管。
 * 已经滚到那一头、再往那头滚就不接手，让外面照常滚。deltaMode 1 = 行、2 = 页，换成像素。
 */
export function wheelDelta(e: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode' | 'ctrlKey'>, el: Pick<HTMLElement, 'scrollLeft' | 'scrollWidth' | 'clientWidth'>, rtl = false): number {
  if (e.ctrlKey) return 0;
  if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return 0;
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 1) return 0;
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientWidth : 1;
  // dir > 0 = 往这一行的尾巴走；从右往左的语言 scrollLeft 是 0 到 -max
  const dir = e.deltaY * unit;
  const p = rtl ? -el.scrollLeft : el.scrollLeft;
  if (dir < 0 && p <= 0) return 0;
  if (dir > 0 && p >= max - 1) return 0;
  return rtl ? -dir : dir;
}
