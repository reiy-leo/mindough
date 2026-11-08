/**
 * 严格模式（Rei 2026-11-08）：开着时，状态是「完成」或「关闭」的任务（23:38「完成和关闭的任务都锁」）只能看、重新打开、删除，别的都不能改。
 * - 规则和 Store 层的拦截在 core strict.ts（store.strictDone / store.isLocked / StrictModeError）。
 * - 这里：把本机设置同步给 Store（useStrictSync，挂在 App 和设置窗口），界面判断只读用 useLocked(task)，
 *   被拦下的写入（漏网的入口）全局接住，提示「严格模式下已完成或已关闭的任务不能修改」（installStrictGuard）。
 */
import { isStrictLocked, StrictModeError, tr, type Store, type Task } from '@mindough/core';
import { useSettings } from './settings';

/** 把开关告诉 Store。在渲染时直接设（幂等），这样同一次渲染里的子组件和 Store 看到的一样。 */
export function useStrictSync(store: Store): boolean {
  const { settings } = useSettings();
  store.strictDone = settings.strictMode;
  return settings.strictMode;
}

/** 这件任务在界面上要不要只读。 */
export function useLocked(task: Pick<Task, 'status' | 'deleted'> | null | undefined): boolean {
  const { settings } = useSettings();
  return isStrictLocked(settings.strictMode, task);
}

export const STRICT_MESSAGE = () => tr('严格模式下已完成或已关闭的任务不能修改');

export function isStrictError(e: unknown): boolean {
  return e instanceof StrictModeError || (e instanceof Error && e.name === 'StrictModeError');
}

/** 漏网的写入（快捷键、拖动、别的入口）抛出的 StrictModeError：不当成错误，给一条提示。返回卸载函数。 */
export function installStrictGuard(toast: (message: string) => void): () => void {
  const onError = (e: ErrorEvent) => {
    if (!isStrictError(e.error)) return;
    e.preventDefault();
    toast(STRICT_MESSAGE());
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    if (!isStrictError(e.reason)) return;
    e.preventDefault();
    toast(STRICT_MESSAGE());
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
