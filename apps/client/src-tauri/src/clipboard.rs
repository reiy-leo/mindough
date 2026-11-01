//! 剪贴板里的文件和图片（Rei 2026-10-29：任务详情顶栏、日记工具栏的「剪贴板」按钮）。
//! - clipboard_peek：看一眼剪贴板，有哪些文件（完整路径）、有没有图片，图片给个签名（宽 × 高 + 像素的哈希），前端拿它判断「这份内容加过了没有」。
//! - clipboard_read_file：读剪贴板里的某个文件，原样返回字节（只认剪贴板里正好有的路径，别的路径一律拒绝）。
//! 图片本身由前端用 tauri-plugin-clipboard-manager 的 readImage 读（再编成 PNG）。
//! 文件列表用 arboard 的 file_list：macOS 读 NSPasteboard 的文件 URL，Windows 读 CF_HDROP，Linux 读 text/uri-list。
//! 手机上（iOS / Android）没做：两个命令都是空的，前端手机上也不显示按钮。

use serde::Serialize;

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClipPeek {
    /// 剪贴板里的文件（完整路径，只要普通文件，文件夹不算）
    pub files: Vec<String>,
    pub has_image: bool,
    /// 图片签名：「宽x高:哈希」，没图片时为空
    pub image_sig: Option<String>,
}

#[cfg(desktop)]
fn files_now() -> Vec<std::path::PathBuf> {
    let Ok(mut cb) = arboard::Clipboard::new() else { return vec![] };
    cb.get().file_list().unwrap_or_default().into_iter().filter(|p| p.is_file()).collect()
}

#[cfg(desktop)]
#[tauri::command]
pub fn clipboard_peek() -> ClipPeek {
    use std::hash::{Hash, Hasher};
    let files: Vec<String> = files_now().into_iter().map(|p| p.to_string_lossy().into_owned()).collect();
    let mut out = ClipPeek { files, ..Default::default() };
    // 有文件时就不看图片了（访达里复制的图片文件，有的系统同时放一张图标图片）
    if out.files.is_empty() {
        if let Ok(mut cb) = arboard::Clipboard::new() {
            if let Ok(img) = cb.get().image() {
                let mut h = std::collections::hash_map::DefaultHasher::new();
                img.bytes.hash(&mut h);
                out.has_image = true;
                out.image_sig = Some(format!("{}x{}:{:016x}", img.width, img.height, h.finish()));
            }
        }
    }
    out
}

#[cfg(desktop)]
#[tauri::command]
pub fn clipboard_read_file(path: String) -> Result<tauri::ipc::Response, String> {
    let want = std::path::PathBuf::from(&path);
    if !files_now().iter().any(|p| p == &want) {
        return Err("剪贴板里没有这个文件".into());
    }
    std::fs::read(&want).map(tauri::ipc::Response::new).map_err(|e| format!("读不了这个文件：{e}"))
}

#[cfg(mobile)]
#[tauri::command]
pub fn clipboard_peek() -> ClipPeek {
    ClipPeek::default()
}

#[cfg(mobile)]
#[tauri::command]
pub fn clipboard_read_file(_path: String) -> Result<tauri::ipc::Response, String> {
    Err("手机上还不支持".into())
}
