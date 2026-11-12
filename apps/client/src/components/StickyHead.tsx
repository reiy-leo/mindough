import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStuck } from './QuickAddBar';

/**
 * 页面顶部固定、只滚下面的内容（Rei 2026-11-11「资料库页面中只有内容部分滚动，顶部固定」，「已完成」页同一天追加）。
 * 做法照打卡页（.checkin-head-sticky）：整块 sticky、不透明页面底，滚的还是 .main（macOS 无标题栏时 .main-scroll），
 * 所以触屏照常滑、手机返回手势和安全区不受影响；滚动后底下一条细线（is-stuck）。页面要加 has-sticky-head，把上边距挪进固定块。
 * 用在：资料库列表页、资料详情页、人物详情页、过期积压页（已完成页 2026-11-12 10:19 去掉页头后不用了）。
 */
export function StickyHead({ className, children }: { className?: string; children: ReactNode }) {
  const { sentinel, stuck } = useStuck();
  return (
    <>
      <div ref={sentinel} className="add-bar-sentinel" aria-hidden />
      <div className={`sticky-head${className ? ` ${className}` : ''}${stuck ? ' is-stuck' : ''}`}>{children}</div>
    </>
  );
}

/**
 * 某个元素（详情页的大标题）滚到固定顶栏下面看不见了没有：看不见时顶栏里补一行小标题。
 * offset 是顶栏大概的高度，上边按这么多算「看不见」。
 */
export function useScrolledPast<T extends HTMLElement>(offset = 64) {
  const ref = useRef<T>(null);
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setPast(!!e && !e.isIntersecting && e.boundingClientRect.top < offset), { rootMargin: `-${offset}px 0px 0px 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, [offset]);
  return { ref, past };
}
