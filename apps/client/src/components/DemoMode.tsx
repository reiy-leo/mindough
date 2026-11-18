/**
 * 演示模式的界面件（Rei 2026-11-18，docs/DEMO-MODE.md）：
 * - DemoModeBadge：侧栏最上面（手机在抽屉里）的小徽标「演示模式」。悬停提示「不会同步」；点一下弹确认，确认后关闭演示模式。
 *   关了以后整页重载回生产库，这一项就不显示了。
 * - DemoOffDialog：关闭演示模式的确认弹窗（侧栏、设置 → 数据、设置 → 账户共用）。
 */
import { useState } from 'react';
import { Button as RacButton } from 'react-aria-components';
import { FlaskConical } from 'lucide-react';
import type { Store } from '@mindough/core';
import { ConfirmDialog, Tip } from '../ui/primitives';
import { isDemoMode, switchDemoMode } from '../lib/demo-mode';
import { tr } from '../lib/i18n';
import { useStore } from '../store/StoreProvider';

export function DemoOffDialog({ isOpen, onOpenChange, store }: { isOpen: boolean; onOpenChange: (open: boolean) => void; store: Store }) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={tr('关闭演示模式？')}
      message={tr('回到你自己的数据。演示数据会留着，以后可以在 设置 → 数据 里再打开。')}
      confirmLabel={tr('关闭演示模式')}
      onConfirm={() => void switchDemoMode(store, false)}
    />
  );
}

/** 侧栏 / 抽屉顶上的「演示模式」。不在演示模式就什么都不画。compact = 中等宽度的图标栏，只留图标。 */
export function DemoModeBadge({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  if (!isDemoMode()) return null;
  const tip = tr('演示模式下的数据只存在这台设备上，不会同步。点一下可以关闭。');
  return (
    <>
      <Tip content={tip} delay={300}>
        <RacButton className={`demo-badge${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`} aria-label={compact ? tr('演示模式') : undefined} onPress={() => setOpen(true)}>
          <FlaskConical size={14} aria-hidden className="demo-badge-icon" />
          {!compact && <span className="demo-badge-text">{tr('演示模式')}</span>}
        </RacButton>
      </Tip>
      <DemoOffDialog isOpen={open} onOpenChange={setOpen} store={store} />
    </>
  );
}
