#!/usr/bin/env bash
# 安卓 WebView 关掉双指缩放（Rei 2026-11-05「安卓界面禁用双指放大缩小」）：在 CI 现生成的 MainActivity.kt 里加 onWebViewCreate，
# setSupportZoom(false)、builtInZoomControls / displayZoomControls 关掉。网页里的 viewport（user-scalable=no）和 touch-action 是第一道，这里是 WebView 这一层。
# 同一个 onWebViewCreate 里再关掉系统给 WebView 自动压暗（2026-11-11，安卓拖选区时内容区变黑的兜底）：
# 页面自己有亮暗两套颜色（color-scheme: light dark），不要系统再算一遍。API 33+ setAlgorithmicDarkeningAllowed(false)；
# 29–32 settings.forceDark = FORCE_DARK_OFF；View 本身 isForceDarkAllowed = false。targetSdk ≥ 33 时前两条本来就是默认关，写明白防老 WebView。
# 再加不透明底（2026-11-11，alpha.22 装上后 Rei 05:27「还是在 select text 时就会背景变黑」）：WebView 自己的底色、窗口底色
# 先按系统深浅色设成和 Material 皮肤一样的不透明色（亮 #f9f9ff、暗 #111318；2026-11-13 紫换蓝后的值），再挂 window.MindoughAndroid.setBackground('#rrggbb')，
# 网页那边（apps/client/src/lib/android-bg.ts）换皮肤、深浅色时把 body 的底色发过来。哪一帧露出 WebView 后面，也是界面的颜色。
# tauri.conf.json 没写 backgroundColor / transparent，wry 不会在 onWebViewCreate 之后再改 WebView 底色（wry 0.57 main_pipe.rs）。
# proguard-rules.pro 里保住桥接方法，release 包混淆后 JS 照样调得到。
# 键盘高度报给网页（2026-11-21，手机编辑器的格式栏）：App 是 edge-to-edge（targetSdk ≥ 35），adjustResize 不缩窗口，
# 老 WebView（M139 以前）里 visualViewport 也看不到键盘。API 30+ 在窗口的 OnGlobalLayout 里读 rootWindowInsets 的 ime 高度，
# 换成 CSS px 写到 window.__mindoughIme 再发 `mindough-ime` 事件（apps/client/src/lib/soft-keyboard.ts）；不另设 insets 监听，免得盖掉 Tauri 自己的。
#   scripts/android-webview.sh          # tauri android init 之后、build 之前跑（重复跑不会加两遍）
#   scripts/android-webview.sh verify   # 只检查改上了没有
# 原因同 native-icons.sh：gen/ 不进仓库，MainActivity 是 init 从模板生成的。
set -euo pipefail
cd "$(dirname "$0")/../apps/client/src-tauri"
mode=${1:-patch}
MARK='mindough: no pinch zoom'
f=$(find gen/android/app/src/main -name MainActivity.kt 2>/dev/null | head -1)
[ -n "$f" ] || { echo "没找到 MainActivity.kt，先跑 tauri android init"; exit 1; }
pro=gen/android/app/proguard-rules.pro

if [ "$mode" = verify ]; then
  grep -q "$MARK" "$f" && grep -q 'setSupportZoom(false)' "$f" || { echo "$f 里没有关缩放"; exit 1; }
  grep -q 'setAlgorithmicDarkeningAllowed(false)' "$f" && grep -q 'isForceDarkAllowed = false' "$f" || { echo "$f 里没有关自动压暗"; exit 1; }
  grep -q 'mindoughApplyBackground' "$f" && grep -q 'addJavascriptInterface(MindoughBgBridge' "$f" || { echo "$f 里没有不透明底 / 底色桥"; exit 1; }
  grep -q 'mindoughWatchIme(webView)' "$f" && grep -q '__mindoughIme' "$f" || { echo "$f 里没有报键盘高度"; exit 1; }
  if [ -f "$pro" ]; then grep -q 'MindoughBgBridge' "$pro" || { echo "$pro 里没有保住底色桥"; exit 1; }; fi
  echo "WebView 缩放、自动压暗已关，不透明底、底色桥、键盘高度已加：$f"; exit 0
fi

if grep -q "$MARK" "$f"; then echo "已经改过：$f"; exit 0; fi
grep -q 'onWebViewCreate' "$f" && { echo "$f 已经有 onWebViewCreate，没法自动加，手动合并"; exit 1; }

# 加在 class 的最后一个 } 前面
python3 - "$f" "$MARK" <<'PY'
import sys
path, mark = sys.argv[1], sys.argv[2]
s = open(path, encoding='utf-8').read()
i = s.rstrip().rfind('}')
if i < 0 or 'class MainActivity' not in s:
    sys.exit('MainActivity.kt 的样子和预想的不一样')
block = f'''
  // {mark}（Rei 2026-11-05）
  override fun onWebViewCreate(webView: android.webkit.WebView) {{
    super.onWebViewCreate(webView)
    webView.settings.setSupportZoom(false)
    webView.settings.builtInZoomControls = false
    webView.settings.displayZoomControls = false
    // 不让系统给 WebView 自动压暗（2026-11-11）：页面自己管亮暗
    if (android.os.Build.VERSION.SDK_INT >= 29) {{
      webView.isForceDarkAllowed = false
    }}
    if (android.os.Build.VERSION.SDK_INT >= 33) {{
      webView.settings.setAlgorithmicDarkeningAllowed(false)
    }} else if (android.os.Build.VERSION.SDK_INT >= 29) {{
      webView.settings.forceDark = android.webkit.WebSettings.FORCE_DARK_OFF
    }}
    // 不透明底（2026-11-11，选中文字时内容区变黑的兜底）：先按系统深浅色，网页起来后按界面底色换
    mindoughApplyBackground(webView, mindoughDefaultBackground())
    webView.addJavascriptInterface(MindoughBgBridge(this, webView), "MindoughAndroid")
    // 键盘高度报给网页（2026-11-21，手机编辑器的格式栏）
    mindoughWatchIme(webView)
  }}

  // 键盘高度（CSS px，收起是 0）写到 window.__mindoughIme，再发 mindough-ime 事件；没变不发。API 30 以前没有 ime insets，不报
  private var mindoughImeLast = -1
  private fun mindoughWatchIme(webView: android.webkit.WebView) {{
    if (android.os.Build.VERSION.SDK_INT < 30) return
    val root = window.decorView
    root.viewTreeObserver.addOnGlobalLayoutListener {{
      val insets = root.rootWindowInsets ?: return@addOnGlobalLayoutListener
      val type = android.view.WindowInsets.Type.ime()
      val px = if (insets.isVisible(type)) insets.getInsets(type).bottom else 0
      val css = Math.round(px / resources.displayMetrics.density)
      if (css != mindoughImeLast) {{
        mindoughImeLast = css
        webView.evaluateJavascript("window.__mindoughIme=" + css + ";window.dispatchEvent(new Event('mindough-ime'))", null)
      }}
    }}
  }}

  // 和 Material 皮肤的 --bg 一样（skin/tokens.css）：亮 #f9f9ff、暗 #111318
  private fun mindoughDefaultBackground(): Int {{
    val mode = resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK
    return if (mode == android.content.res.Configuration.UI_MODE_NIGHT_YES) 0xFF111318.toInt() else 0xFFF9F9FF.toInt()
  }}

  fun mindoughApplyBackground(webView: android.webkit.WebView, color: Int) {{
    webView.setBackgroundColor(color)
    window.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(color))
  }}

  // 网页调 window.MindoughAndroid.setBackground('#rrggbb')（apps/client/src/lib/android-bg.ts）；只收 6 位十六进制，回主线程再改
  class MindoughBgBridge(private val activity: MainActivity, private val webView: android.webkit.WebView) {{
    @android.webkit.JavascriptInterface
    fun setBackground(hex: String) {{
      if (!Regex("^#[0-9a-fA-F]{{6}}$").matches(hex)) return
      val color = android.graphics.Color.parseColor(hex)
      activity.runOnUiThread {{ activity.mindoughApplyBackground(webView, color) }}
    }}
  }}
'''
s = s[:i].rstrip() + '\n' + block + s[i:]
open(path, 'w', encoding='utf-8').write(s)
PY
# release 包会混淆：保住桥接方法（默认的 proguard-android-optimize 一般也保，写明白）
if [ -f "$pro" ] && ! grep -q MindoughBgBridge "$pro"; then
  printf '\n# mindough: 网页调的底色桥（scripts/android-webview.sh）\n-keepclassmembers class **.MainActivity$MindoughBgBridge {\n  @android.webkit.JavascriptInterface <methods>;\n}\n' >> "$pro"
fi
echo "已关掉 WebView 缩放、自动压暗，加上不透明底、底色桥和键盘高度：$f"; cat "$f"
