# 小组件（M3-3）

不开 app 也能看「我的一天」和「今天要打卡」。现在只做手机，两块进度不一样：

| 平台 | 形式 | 状态 |
|---|---|---|
| Android | 主屏 AppWidget，读 app 写的 JSON 快照 | 快照 ✅（app 写）；Kotlin 小组件写好了，**还没接进构建** |
| iOS | WidgetKit 扩展 | 只有脚手架（Swift 文件 + 步骤），要 Rei 在 Xcode 里加 target、开 App Group |

## 桌面

桌面以前有个置顶的「小窗」（Tauri 第二个窗口）。2026-11-04 Rei 要求删除小窗，已经删了，桌面现在没有小组件。手机小组件和它不共用代码，下面的不受影响。

## Android AppWidget

已经有的：
- 在手机 app 里，数据一变（防抖 2 秒），`lib/widget-snapshot.ts` 就把快照交给 Rust 命令 `widget_snapshot`（`src-tauri/src/widget.rs`），写进 app 数据目录的 `widget-snapshot.json`（先写 .tmp 再改名）：

```json
{ "version": 1, "at": "2026-10-16T01:00:00.000Z", "date": "2026-10-16",
  "myDay": [{ "id": "…", "title": "买菜", "done": false }],
  "checkIns": [{ "id": "…", "title": "喝 8 杯水", "done": false }] }
```

- `src-tauri/mobile/android-widget/`：`MindoughWidget.kt`（AppWidgetProvider，读快照、拼成几行、点了打开 app）、`res/layout/mindough_widget.xml`、`res/xml/mindough_widget_info.xml`（3 × 2 格，30 分钟系统刷新）。

还要做的（`gen/android` 由 `tauri android init` 生成，不进仓库，所以还没接）：
1. 在 `build.yml` 的 Android job 里 `tauri android init` 之后加一步，把 `MindoughWidget.kt` 拷到 `gen/android/app/src/main/java/dev/rei8t/mindough/`，`res/` 合到 `gen/android/app/src/main/res/`。
2. 在 `gen/android/app/src/main/AndroidManifest.xml` 的 `<application>` 里加：

```xml
<receiver android:name=".MindoughWidget" android:exported="false">
  <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
  <meta-data android:name="android.appwidget.provider" android:resource="@xml/mindough_widget_info" />
</receiver>
```

3. 真机确认 Tauri 的 `app_data_dir` 在 Android 上是 `context.dataDir`（Kotlin 里两处都找）。
4. 以后再做：写完快照马上刷新小组件（Rust → JNI 调 `MindoughWidget.refresh`）；列表改用 `RemoteViewsService`，能滚动，也能直接勾。

为什么还没接：本机没有 Android SDK，编不了也验证不了，所以先不往 CI 里加，免得把打包弄坏。

## iOS WidgetKit

`src-tauri/mobile/ios-widget/MindoughWidget.swift` 是写好的小组件代码（小、中两种尺寸，读快照显示前 5 件）。接入要在 Mac 上做：
1. `pnpm tauri ios init` 后用 Xcode 打开 `gen/apple`，File → New → Target → Widget Extension，名字 MindoughWidget，用这个 Swift 文件替换模板。
2. app target 和 widget target 都打开 App Groups：`group.dev.rei8t.mindough`。
3. `widget.rs` 在 iOS 上要写到共享容器（`FileManager.containerURL(forSecurityApplicationGroupIdentifier:)`），现在写的是 app 自己的数据目录，小组件读不到。要写个小 Swift 插件或 objc 调用来拿容器路径。
4. 写完快照调 `WidgetCenter.shared.reloadAllTimelines()`。

iOS 要用开发者账号签名（App Group 也要），怎么分发还等 Rei 定，所以只做到脚手架。
