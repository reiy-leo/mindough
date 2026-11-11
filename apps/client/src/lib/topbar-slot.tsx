import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * 手机顶栏右边的一格（Rei 2026-11-12 01:56「我的一天、等待安排、过期积压不显示顶部的页头」）：
 * 页面把原来页头里的按钮（我的一天的排序 / 分区）送到顶栏右边，状态还留在页面里。App.tsx 的顶栏放 id 为 TOPBAR_SLOT_ID 的空格子。
 * 宽屏和没有顶栏的页没有这个格子，什么也不画。
 */
export const TOPBAR_SLOT_ID = 'topbar-actions';

export function TopbarActions({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.getElementById(TOPBAR_SLOT_ID)), []);
  return el ? createPortal(children, el) : null;
}
