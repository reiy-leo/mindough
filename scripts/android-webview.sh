#!/usr/bin/env bash
# 安卓 WebView 关掉双指缩放（Rei 2026-11-05「安卓界面禁用双指放大缩小」）：在 CI 现生成的 MainActivity.kt 里加 onWebViewCreate，
# setSupportZoom(false)、builtInZoomControls / displayZoomControls 关掉。网页里的 viewport（user-scalable=no）和 touch-action 是第一道，这里是 WebView 这一层。
# 同一个 onWebViewCreate 里再关掉系统给 WebView 自动压暗（2026-11-11，安卓拖选区时内容区变黑的兜底）：
# 页面自己有亮暗两套颜色（color-scheme: light dark），不要系统再算一遍。API 33+ setAlgorithmicDarkeningAllowed(false)；
# 29–32 settings.forceDark = FORCE_DARK_OFF；View 本身 isForceDarkAllowed = false。targetSdk ≥ 33 时前两条本来就是默认关，写明白防老 WebView。
#   scripts/android-webview.sh          # tauri android init 之后、build 之前跑（重复跑不会加两遍）
#   scripts/android-webview.sh verify   # 只检查改上了没有
# 原因同 native-icons.sh：gen/ 不进仓库，MainActivity 是 init 从模板生成的。
set -euo pipefail
cd "$(dirname "$0")/../apps/client/src-tauri"
mode=${1:-patch}
MARK='mindough: no pinch zoom'
f=$(find gen/android/app/src/main -name MainActivity.kt 2>/dev/null | head -1)
[ -n "$f" ] || { echo "没找到 MainActivity.kt，先跑 tauri android init"; exit 1; }

if [ "$mode" = verify ]; then
  grep -q "$MARK" "$f" && grep -q 'setSupportZoom(false)' "$f" || { echo "$f 里没有关缩放"; exit 1; }
  grep -q 'setAlgorithmicDarkeningAllowed(false)' "$f" && grep -q 'isForceDarkAllowed = false' "$f" || { echo "$f 里没有关自动压暗"; exit 1; }
  echo "WebView 缩放、自动压暗已关：$f"; exit 0
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
  }}
'''
s = s[:i].rstrip() + '\n' + block + s[i:]
open(path, 'w', encoding='utf-8').write(s)
PY
echo "已关掉 WebView 缩放、自动压暗：$f"; cat "$f"
