//! macOS Touch Bar（Rei 2026-11-21「touchbar显示我的一天、日历、侧边栏的项目、打卡、倒数日、日记的图标」）。
//!
//! - 主窗口的 Touch Bar 上一排 6 个图标：我的一天、日历、项目、打卡、倒数日、日记；当前页那个高亮。
//! - 前端（lib/touch-bar.ts）定下界面语言、每次换页都调 `set_touch_bar`，带上 6 个按钮的文字（tr() 出来的，当提示和无障碍文字）
//!   和当前页对应的按钮名；第一次调时才把 Touch Bar 装到主窗口上。
//! - 点了按钮发事件 `mindough:touchbar` 给主窗口，payload 是按钮名（myday、calendar、projects、checkin、countdown、journal，
//!   和深链 view/{页面} 的名字一样），前端跳到那一页。
//! - AppKit 的部分在 touchbar_mac.rs。别的平台（Windows、Linux、手机）这个命令什么都不做。

use serde::Deserialize;

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub const TOUCH_BAR_EVENT: &str = "mindough:touchbar";

/// 6 个按钮的文字（前端按界面语言传；没传的用英文）。
#[derive(Deserialize, Clone)]
#[serde(default, rename_all = "camelCase")]
pub struct TouchBarLabels {
    pub my_day: String,
    pub calendar: String,
    pub projects: String,
    pub checkin: String,
    pub countdown: String,
    pub journal: String,
}

impl Default for TouchBarLabels {
    fn default() -> Self {
        Self {
            my_day: "My Day".into(),
            calendar: "Calendar".into(),
            projects: "Projects".into(),
            checkin: "Check-ins".into(),
            countdown: "Countdowns".into(),
            journal: "Journal".into(),
        }
    }
}

#[cfg(target_os = "macos")]
#[path = "touchbar_mac.rs"]
mod mac;

/// 前端调：装上 / 刷新 Touch Bar。`active` 是当前页对应的按钮名，不在 6 个里就传 null。
#[tauri::command]
pub fn set_touch_bar<R: tauri::Runtime>(app: tauri::AppHandle<R>, labels: TouchBarLabels, active: Option<String>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use tauri::{Emitter, Manager};
        let Some(window) = app.get_webview_window("main") else {
            return Ok(());
        };
        let ptr = window.ns_window().map_err(|e| e.to_string())? as usize;
        let emitter = app.clone();
        mac::set_on_pick(Box::new(move |key| {
            let _ = emitter.emit_to("main", TOUCH_BAR_EVENT, key);
        }));
        let l = labels;
        let texts = [l.my_day, l.calendar, l.projects, l.checkin, l.countdown, l.journal];
        let idx = active.and_then(|a| mac::SLOTS.iter().position(|s| s.key == a));
        // AppKit 只能在主线程动
        app.run_on_main_thread(move || mac::apply(ptr, &texts, idx)).map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, labels, active);
        Ok(())
    }
}
