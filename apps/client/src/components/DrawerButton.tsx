import { createContext, useContext, type ReactNode } from 'react';
import { Button as RacButton } from 'react-aria-components';
import { Menu, PanelLeft } from 'lucide-react';
import { useSettings } from '../lib/settings';
import { tr } from '../lib/i18n';

/**
 * 手机「打开侧边栏」按钮（Rei 2026-11-15 手机导航改版；2026-11-16 17:31「项目页也要添加侧边栏按钮」、17:33「抽屉按钮和功能按钮放在同一行」）。
 * 抽屉开关在 App（MobileDrawer），这里用 context 拿，所以顶栏和页面自己的工具行用的是同一个按钮：
 * - 顶栏：我的一天、等待安排这些顶上没有自己工具行的页（App 里 MobileTopbarRow 的 menu）；
 * - 页面自己的第一行最左边：打卡、倒数日、日历、项目列表、项目详情、资料库 / 人物库、类型（lib/mobile-topbar INLINE_DRAWER_PAGES），不再单独占一行。
 * 电脑（没有 context，或不是手机布局）什么都不画。
 * Apple 用侧栏图标（iOS「sidebar.left」），WinUI / Material 用三道杠。
 */
type DrawerCtx = { isOpen: boolean; open: () => void };
const Ctx = createContext<DrawerCtx | null>(null);

export function DrawerProvider({ isOpen, open, children }: DrawerCtx & { children: ReactNode }) {
  return <Ctx.Provider value={{ isOpen, open }}>{children}</Ctx.Provider>;
}

export function DrawerButton({ className = '' }: { className?: string }) {
  const ctx = useContext(Ctx);
  // 没有 context（电脑壳子外、单测里单独渲染页面）就不画，也不碰设置
  return ctx ? <DrawerButtonInner ctx={ctx} className={className} /> : null;
}

function DrawerButtonInner({ ctx, className }: { ctx: DrawerCtx; className: string }) {
  const { layout, skin } = useSettings();
  if (layout !== 'mobile') return null;
  return (
    <RacButton className={`icon-btn topbar-menu${className ? ` ${className}` : ''}`} aria-label={tr('打开侧边栏')} aria-haspopup="dialog" aria-expanded={ctx.isOpen} onPress={ctx.open}>
      {skin === 'apple' ? <PanelLeft size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
    </RacButton>
  );
}
