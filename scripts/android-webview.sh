#!/usr/bin/env bash
# 安卓 WebView 关掉双指缩放（Rei 2026-11-05「安卓界面禁用双指放大缩小」）：在 CI 现生成的 MainActivity.kt 里加 onWebViewCreate，
# setSupportZoom(false)、builtInZoomControls / displayZoomControls 关掉。网页里的 viewport（user-scalable=no）和 touch-action 是第一道，这里是 WebView 这一层。
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
  echo "WebView 缩放已关：$f"; exit 0
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
  }}
'''
s = s[:i].rstrip() + '\n' + block + s[i:]
open(path, 'w', encoding='utf-8').write(s)
PY
echo "已关掉 WebView 缩放：$f"; cat "$f"
