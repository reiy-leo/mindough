import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * 手机顶栏的两格（Rei 2026-11-12 01:56「我的一天、等待安排、过期积压不显示顶部的页头」；
 * 09:41「手机端的每一页的顶部都有header……页面都不用header」）：
 * - 左边 TopbarLead：顶栏不写页名，只有我的一天把今天的日期 + 农历送上来（09:39「顶部"我的一天"换成今天的日期，和PC端保持一致」）；
 * - 右边 TopbarActions：页面把原来页头里的按钮（我的一天的排序 / 分区、已完成的分区）送到顶栏右边，状态还留在页面里。
 * 两格都空时顶栏收成只剩状态栏那一截（styles/app.css `.topbar.is-empty`）。宽屏和没有顶栏的页没有这两个格子，什么也不画。
 */
export const TOPBAR_SLOT_ID = 'topbar-actions';
export const TOPBAR_LEAD_ID = 'topbar-lead';

function useSlot(id: string) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.getElementById(id)), [id]);
  return el;
}

export function TopbarActions({ children }: { children: ReactNode }) {
  const el = useSlot(TOPBAR_SLOT_ID);
  return el ? createPortal(children, el) : null;
}

export function TopbarLead({ children }: { children: ReactNode }) {
  const el = useSlot(TOPBAR_LEAD_ID);
  return el ? createPortal(children, el) : null;
}
