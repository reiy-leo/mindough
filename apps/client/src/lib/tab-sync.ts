/**
 * 手机底部标签栏双击「我的一天」立即同步（Rei 2026-11-13「手机端双击"我的一天"图标 触发同步，同时 toast 显示同步结果」）。
 * - 单击照常立刻切到我的一天，不等第二下；第二下落在 300ms 内才算双击，触发一次同步（和设置里「立即同步」同一个 syncNow）。
 * - 连点三下只算一次双击：触发后重新计时。
 * - 开始前先看能不能同步：没登录 / 服务端不可用 / 账户还在连接 / 离线 / 正在同步，各给一句 toast，不发起。
 * - 同步完按结果给 toast：已同步、离线、同步失败（带原因；状态码带中文说明，见 lib/sync readError）。
 * 这里只放纯判断，App.tsx 的标签栏接上。
 */
import type { AccountState } from './account';
import type { SyncView } from './sync';
import { tr } from './i18n';

export const DOUBLE_TAP_MS = 300;

/** 双击判定：每次点按调一次，传点按时刻（ms）；和上一下隔 ≤ ms 返回 true（并重新计时）。 */
export function createDoubleTap(ms = DOUBLE_TAP_MS): (now: number) => boolean {
  let last = Number.NEGATIVE_INFINITY;
  return (now: number) => {
    if (now - last <= ms && now >= last) {
      last = Number.NEGATIVE_INFINITY;
      return true;
    }
    last = now;
    return false;
  };
}

export interface TapSyncToast {
  tone: 'info' | 'success' | 'error';
  message: string;
  /** 带「去设置」按钮（打开设置 → 账户）。 */
  toSettings?: boolean;
}

/** 双击时能不能发起同步：null = 可以；否则返回要显示的 toast。 */
export function tapSyncGate(account: AccountState, view: SyncView, online: boolean, busy: boolean): TapSyncToast | null {
  if (busy || (view.enabled && view.phase === 'syncing')) return { tone: 'info', message: tr('正在同步…') };
  if (!online || account.status === 'offline') return { tone: 'info', message: tr('离线，联网后自动同步') };
  if (account.status === 'out') return { tone: 'info', message: tr('还没登录，登录后才能同步'), toSettings: true };
  if (account.status === 'unavailable') return { tone: 'error', message: tr('同步暂不可用：{reason}', { reason: account.reason.replace(/[。.]$/, '') }), toSettings: true };
  if (account.status === 'loading' || !view.enabled) return { tone: 'info', message: tr('账户还在连接，稍后再试') };
  return null;
}

/** 同步跑完后的 toast（看同步状态）。 */
export function tapSyncResult(view: SyncView): TapSyncToast {
  if (!view.enabled) return { tone: 'info', message: tr('还没登录，登录后才能同步'), toSettings: true };
  if (view.phase === 'offline') return { tone: 'info', message: tr('离线，联网后自动同步') };
  if (view.phase === 'error') {
    const err = (view.error ?? '').replace(/[。.]$/, '');
    return { tone: 'error', message: err ? tr('同步失败：{error}', { error: err }) : tr('同步出错'), toSettings: view.needsLogin || undefined };
  }
  return { tone: 'success', message: tr('已同步') };
}
