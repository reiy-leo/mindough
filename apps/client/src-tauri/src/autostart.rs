//! 开机时启动（Rei 2026-11-13「设置里加"系统"选项卡」，设置 → 系统）。
//! - 开 / 关、查有没有开：前端直接调 tauri-plugin-autostart 的 enable / disable / is_enabled
//!   （macOS 是 ~/Library/LaunchAgents 里的 LaunchAgent，Windows 是注册表 HKCU\…\Run，Linux 是 ~/.config/autostart）。
//!   系统登录时带 `--autostart` 启动，用它分清「开机自己起来的」和「用户点开的」。
//! - 「开机自启时最小化应用」：存在应用配置目录的 launch.json（只在这台电脑，不同步），
//!   启动时要先于前端读到，所以不放 localStorage。开机带 `--autostart` 起来、这一项开着，主窗口第一次加载完就最小化
//!   （macOS 收进程序坞，Windows 收进任务栏）；点程序坞 / 任务栏图标、再打开一次（single-instance）都能拉回来。

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager, Runtime};

/// 开机启动时带的参数（lib.rs 注册插件时传给它）。
pub const AUTOSTART_ARG: &str = "--autostart";
const FILE: &str = "launch.json";
const KEY: &str = "minimize_on_autostart";

fn file<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(FILE))
}

fn read_minimize<R: Runtime>(app: &AppHandle<R>) -> bool {
    file(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.get(KEY).and_then(|b| b.as_bool()))
        .unwrap_or(false)
}

/// 这次是不是开机时系统拉起来的。
pub fn launched_at_login() -> bool {
    std::env::args().any(|a| a == AUTOSTART_ARG)
}

/// 「开机自启时最小化应用」开着吗（默认关）。
#[tauri::command]
pub fn autostart_minimize_get<R: Runtime>(app: AppHandle<R>) -> bool {
    read_minimize(&app)
}

#[tauri::command]
pub fn autostart_minimize_set<R: Runtime>(app: AppHandle<R>, on: bool) -> Result<(), String> {
    let p = file(&app).ok_or_else(|| "no app config dir".to_string())?;
    if let Some(d) = p.parent() {
        std::fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    std::fs::write(&p, serde_json::json!({ KEY: on }).to_string()).map_err(|e| e.to_string())
}

static MINIMIZED: AtomicBool = AtomicBool::new(false);

/// 主窗口页面第一次加载完时调：开机自启 + 要最小化 → 最小化一次（之后刷新页面不再管）。
pub fn on_main_loaded<R: Runtime>(window: &tauri::Window<R>) {
    if window.label() != "main" || MINIMIZED.swap(true, Ordering::SeqCst) {
        return;
    }
    if launched_at_login() && read_minimize(window.app_handle()) {
        let _ = window.minimize();
    }
}
