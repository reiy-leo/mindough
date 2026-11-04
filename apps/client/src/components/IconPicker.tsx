/**
 * 图标选择（项目面板、项目 ··· 换图标、资料库、打卡分类共用）。
 * 2026-11-02 重做（Rei「确保设计符合对应的皮肤，项目弹窗中的这个图标部分也太难看了吧」）：格子 38px 正方，图标 20px，选中是实心（形状、颜色按皮肤，见 skin/skins.css）。
 * 2026-11-04（Rei「编辑项目中的图标左右滚动，删掉搜索框，emoji不支持」，更正「是整个lucide icons section左右滑动，不再有文字标题，而是每列占满了占下一列，添加更多lucide icons，包括动物、植物」）：
 * - 整块是一张固定行数的网格（宽屏 5 行、手机 4 行），图标一列从上往下排满再排下一列，整块左右滑（触控板横滑、手指滑、Shift+滚轮）。
 *   没有组名，顺序按 lib/icons 的 PICKER_GROUPS（常用在最前）。还能往哪边滑，那边就渐隐一点。
 * - 没有搜索框，也不能再选 emoji，只能选 Lucide 图标。
 * - 老数据存的是 emoji：照常显示（lib/icons 的 typeIcon），这里一个格子都不选中，用户点了图标才改。
 * - 打开时把选中的格子滚到中间；方向键在格子间挪（↑↓ 同一列，←→ 隔壁列），Home / End 到头尾，挪到的格子滚进视野。
 */
import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { Button as RacButton } from 'react-aria-components';
import { PICKER_ICONS, typeIcon } from '../lib/icons';
import { tr } from '../lib/i18n';

/** 两头还有没有藏着的图标：写到 data-more-start / data-more-end 上，CSS 按它渐隐。 */
function markMore(el: HTMLElement) {
  const max = el.scrollWidth - el.clientWidth;
  const x = Math.abs(el.scrollLeft); // 从右往左的语言 scrollLeft 是负的
  el.toggleAttribute('data-more-start', x > 1);
  el.toggleAttribute('data-more-end', max - x > 1);
}

/** 把格子横着滚进视野（只滚这一块，不带着弹窗一起滚）。.icon-grid 是 position: relative，offsetLeft 就是格子在网格里的位置。 */
function reveal(box: HTMLElement, cell: HTMLElement, center = false) {
  const left = cell.offsetLeft;
  const right = left + cell.offsetWidth;
  const pad = 28; // 渐隐那一截
  if (center) box.scrollLeft = Math.max(0, left - box.clientWidth / 2 + cell.offsetWidth / 2);
  else if (left - pad < box.scrollLeft) box.scrollLeft = Math.max(0, left - pad);
  else if (right + pad > box.scrollLeft + box.clientWidth) box.scrollLeft = right + pad - box.clientWidth;
}

/** 网格现在几行（CSS 按宽屏 / 手机给的 --icon-rows）。 */
const rowsOf = (box: HTMLElement) => Math.max(1, getComputedStyle(box).gridTemplateRows.split(' ').filter(Boolean).length);

export function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const sel = box.querySelector<HTMLElement>('.icon-cell.is-selected');
    if (sel) reveal(box, sel, true);
    markMore(box);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => markMore(box));
    ro?.observe(box);
    return () => ro?.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const box = ref.current;
    if (!box || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    const cells = [...box.querySelectorAll<HTMLElement>('.icon-cell')];
    const i = cells.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const rows = rowsOf(box);
    const rtl = getComputedStyle(box).direction === 'rtl';
    const col = rtl ? -rows : rows;
    const step: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -col, ArrowRight: col };
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? cells.length - 1 : i + step[e.key]!;
    if (j < 0 || j >= cells.length) return;
    e.preventDefault();
    cells[j]!.focus({ preventScroll: true });
    reveal(box, cells[j]!);
  };

  return (
    <div className="icon-picker">
      <div ref={ref} className="icon-grid" role="group" aria-label={tr('图标')} onScroll={(e) => markMore(e.currentTarget)} onKeyDown={onKeyDown}>
        {PICKER_ICONS.map((n) => {
          const I = typeIcon(n);
          const on = value === n;
          return (
            <RacButton key={n} className={`icon-cell${on ? ' is-selected' : ''}`} aria-label={n} aria-pressed={on} onPress={() => onChange(n)}>
              <I size={20} />
            </RacButton>
          );
        })}
      </div>
    </div>
  );
}
