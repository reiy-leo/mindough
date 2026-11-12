/**
 * 开机时启动（Rei 2026-11-13，设置 → 系统）。只有桌面 App（macOS / Windows）有：
 * - 开 / 关：tauri-plugin-autostart（macOS LaunchAgent、Windows 注册表 Run 项），开机时带 --autostart 启动。
 *   开没开以系统里登记的为准（每次打开设置去问），不另存。
 * - 「开机自启时最小化应用」：存在应用配置目录的 launch.json（Rust src/autostart.rs），启动时 Rust 先读，
 *   带 --autostart 起来又开着这项，主窗口加载完就最小化。只在这台电脑，不同步。
 * 网页、安卓、iOS 不显示这两项（安卓开机自启没做）。
 */
import type { Platform } from '../skin/platform';
import { isTauri } from '../store/sqlite-tauri';

/**
 * 截图 / 自查用（同 lib/settings 的 ?skin=）：网页地址带 ?sys=desktop 时，按桌面 App 的样子显示这两项，
 * 开关只改内存里的假值，不碰系统。Tauri 里不认这个参数。
 */
function previewing(): boolean {
  if (isTauri() || typeof location === 'undefined') return false;
  return new URLSearchParams(location.search).get('sys') === 'desktop';
}
const fake: Record<string, boolean> = { auto: false, minimize: false };

/** 这台设备显示开机启动那两项吗：Tauri 桌面 App，macOS 或 Windows。 */
export function autostartSupported(platform: Platform, tauri: boolean = isTauri()): boolean {
  return (tauri || previewing()) && (platform === 'macos' || platform === 'windows');
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (previewing()) {
    if (cmd.endsWith('|is_enabled')) return fake.auto as T;
    if (cmd.endsWith('|enable') || cmd.endsWith('|disable')) fake.auto = cmd.endsWith('|enable');
    if (cmd === 'autostart_minimize_get') return fake.minimize as T;
    if (cmd === 'autostart_minimize_set') fake.minimize = args?.on === true;
    return undefined as T;
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

export const autostartEnabled = (): Promise<boolean> => call<boolean>('plugin:autostart|is_enabled');
export const setAutostart = (on: boolean): Promise<void> => call<void>(on ? 'plugin:autostart|enable' : 'plugin:autostart|disable');
export const minimizeOnAutostart = (): Promise<boolean> => call<boolean>('autostart_minimize_get');
export const setMinimizeOnAutostart = (on: boolean): Promise<void> => call<void>('autostart_minimize_set', { on });
