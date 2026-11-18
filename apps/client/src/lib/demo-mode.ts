/**
 * 演示模式（Rei 2026-11-18，docs/DEMO-MODE.md）。
 *
 * - 演示数据放在单独的演示库里：Tauri 是 app 数据目录下的 mindough-demo.db，网页是 OPFS 里的 /mindough-demo.db，
 *   退回 localStorage 时换一套键前缀。生产库（原来那个）永远不放演示数据。
 * - 开没开演示模式只记在这台设备的 localStorage（`mindough:demo-mode`，'1' 开 / '0' 关），不进偏好表、不同步。
 *   没有这个键 = 还没判断过（新装或升级上来的第一次启动），StoreProvider 打开生产库看一眼再定。
 * - 演示模式下完全不同步：不绑同步引擎、不传附件，账户页不让登录。
 * - 换模式要整页重新载入（换库）：先把编辑器里没存的、Store 里没落盘的写下去，再写标记、重载。
 *   Tauri 的设置窗口也跟着重载（relay 'mode'）。
 * - 皮肤、语言这些界面设置两边共用；列表添加框的草稿、空白任务记录按模式分开（modeKey），演示里打的字不会带进生产库。
 */
import type { Store } from '@mindough/core';
import { isTauri } from '../store/sqlite-tauri';
import { onRelay, relay } from './window-relay';

export const DEMO_MODE_KEY = 'mindough:demo-mode';
/** 生产库里记一笔：新装判断做过了（值是判断的时间），以后不再判断。 */
export const DEMO_MODE_CHECKED_META = 'demo_mode_checked';

/** 演示库的文件名（Tauri 与 OPFS 用同一个名字，Rust 端 db.rs 只认这个）。 */
export const DEMO_DB_FILE = 'mindough-demo.db';
/** localStorage 退路下演示库的键前缀（生产库是 core WebStorageAdapter 默认的 mindough:v1:）。 */
export const DEMO_LS_PREFIX = 'mindough:demo:v1:';

function kv(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 标记：'1' 演示 / '0' 生产 / null 还没判断。 */
export function readDemoFlag(): '1' | '0' | null {
  const v = kv()?.getItem(DEMO_MODE_KEY);
  return v === '1' || v === '0' ? v : null;
}

export function writeDemoFlag(on: boolean): void {
  kv()?.setItem(DEMO_MODE_KEY, on ? '1' : '0');
}

/**
 * 这一页现在用的是不是演示库。页面载入后由 StoreProvider 定下来（setActiveDemo），之后整页都不变——换模式就重载。
 * StoreProvider 定之前按本机标记猜（还没判断过就当生产）。
 */
let active: boolean | null = null;
export function isDemoMode(): boolean {
  return active ?? readDemoFlag() === '1';
}
export function setActiveDemo(on: boolean): void {
  active = on;
}

/** 按模式分开的本机键：演示模式在后面加 `:demo`。 */
export function modeKey(key: string): string {
  return isDemoMode() ? `${key}:demo` : key;
}

/** 把还没存的都写下去：编辑器失焦存、页面藏起来时存（onPageHide），再等 Store 落盘。 */
export async function flushEverything(store: Store | null): Promise<void> {
  const el = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
  el?.blur?.();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('pagehide'));
  await new Promise((r) => setTimeout(r, 50));
  if (store) await Promise.race([store.flush().catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
}

/** 重载到起始页（别带着演示库里的 ?task= 进生产库）。 */
function reloadClean(): void {
  const h = location.hash;
  const q = h.indexOf('?');
  if (q >= 0) history.replaceState(history.state, '', location.pathname + location.search + h.slice(0, q));
  location.reload();
}

/** 开 / 关演示模式：存好手上的改动 → 写标记 → 叫别的窗口也重载 → 自己重载。 */
export async function switchDemoMode(store: Store | null, on: boolean): Promise<void> {
  await flushEverything(store);
  writeDemoFlag(on);
  relay('mode');
  // Tauri：设置窗口里点的，主窗口先重载（它管同步）；稍等一下再重载自己
  if (isTauri()) await new Promise((r) => setTimeout(r, 300));
  reloadClean();
}

/** 别的窗口换了模式：存好自己手上的，也重载。返回停止函数。 */
export function installDemoModeRelay(store: Store): () => void {
  return onRelay('mode', () => {
    void flushEverything(store).then(reloadClean);
  });
}
