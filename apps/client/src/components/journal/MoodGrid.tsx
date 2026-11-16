/**
 * 选心情（日记输入框和任务的「心情」属性、详情顶栏心情按钮、新建面板共用，Rei 2026-11-08「日记的心情属性在普通任务属性中也可以添加」）。
 * 点已选的那格 = 取消（onPick(null)）。样式 .jmood-grid / .jmood-opt 在 journal.css。
 *
 * 2026-11-16（Rei 加到 31 个心情，「选择器改成一行横向滚动，参照项目图标 lucide 选择器」）：原来四列的格子改成一行，左右滑。
 * - 手机手指横滑；电脑触控板横滑，竖着滚的滚轮也会横着走（lib/hscroll wheelDelta），滚到头再滚就交给外面。
 * - 还能往哪边滑，那边渐隐一点（data-more-start / data-more-end）；打开时已选的那个滚到中间。
 * - 键盘：← → 挪到隔壁一个，Home / End 到头尾，挪到的那个滚进视野。
 */
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { Button as RacButton } from 'react-aria-components';
import { MOOD_IDS, moodLabel, type MoodId } from '@mindough/core';
import { tr } from '../../lib/i18n';
import { markMore, reveal, wheelDelta } from '../../lib/hscroll';
import { MoodIcon } from './MoodIcon';

export function MoodGrid({ value, onPick }: { value: string | null | undefined; onPick: (mood: MoodId | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const sel = box.querySelector<HTMLElement>('.jmood-opt.is-selected');
    if (sel) reveal(box, sel, { center: true });
    markMore(box);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => markMore(box));
    ro?.observe(box);
    return () => ro?.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 滚轮要能 preventDefault，React 的 onWheel 是 passive，只能自己挂
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      const d = wheelDelta(e, box, getComputedStyle(box).direction === 'rtl');
      if (!d) return;
      e.preventDefault();
      box.scrollLeft += d;
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const box = ref.current;
    if (!box || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const cells = [...box.querySelectorAll<HTMLElement>('.jmood-opt')];
    const i = cells.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const rtl = getComputedStyle(box).direction === 'rtl';
    const next = rtl ? -1 : 1;
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? cells.length - 1 : i + (e.key === 'ArrowRight' ? next : -next);
    if (j < 0 || j >= cells.length) return;
    e.preventDefault();
    cells[j]!.focus({ preventScroll: true });
    reveal(box, cells[j]!);
  };

  return (
    <div ref={ref} className="jmood-grid" role="group" aria-label={tr('心情')} onScroll={(e) => markMore(e.currentTarget)} onKeyDown={onKeyDown}>
      {MOOD_IDS.map((id) => (
        <RacButton key={id} className={`jmood-opt${value === id ? ' is-selected' : ''}`} aria-pressed={value === id} onPress={() => onPick(value === id ? null : id)}>
          <MoodIcon mood={id} size={30} />
          <span>{moodLabel(id)}</span>
        </RacButton>
      ))}
    </div>
  );
}
