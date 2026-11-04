#!/usr/bin/env bash
# 把仓库里的念头团图标拷进 CI 现生成的原生工程，替掉 Tauri 默认图标，并逐个比对 sha256，不一致就失败。
#   scripts/native-icons.sh android         # init 之后、build 之前跑
#   scripts/native-icons.sh android verify  # 只校验（build 之后再跑一次，防止被覆盖）
#   scripts/native-icons.sh ios | ios verify
# 原因：gen/ 不进仓库，`tauri android/ios init --ci` 只从模板拷 Tauri 默认图标，不读 src-tauri/icons/（alpha.14 Android 桌面图标还是 Tauri 的，Rei 2026-11-04）。
set -euo pipefail
cd "$(dirname "$0")/../apps/client/src-tauri"
platform=${1:?用法: native-icons.sh android|ios [verify]}; mode=${2:-copy}

# macOS runner 上不一定有 sha256sum，退回 shasum -a 256
sha(){ if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }

check(){ # $1 源目录 $2 目标目录：源里每个文件都要在目标里且 sha256 相同
  local bad=0 n=0
  while IFS= read -r f; do
    rel=${f#"$1"/}; n=$((n+1))
    if [ ! -f "$2/$rel" ]; then echo "缺少 $2/$rel"; bad=1; continue; fi
    a=$(sha "$f"); b=$(sha "$2/$rel")
    if [ "$a" != "$b" ]; then echo "不一致 $rel  仓库 $a  工程 $b"; bad=1; fi
  done < <(find "$1" -type f | sort)
  [ $bad = 0 ] || { echo "图标校验失败（工程里不是念头团图标）"; exit 1; }
  echo "图标校验通过：$n 个文件和 $1 一致"
}

case $platform in
android)
  src=icons/android; res=gen/android/app/src/main/res
  [ -d "$res" ] || { echo "没有 $res，先跑 tauri android init"; exit 1; }
  if [ "$mode" = copy ]; then
    # Tauri 模板留下的矢量默认前景/背景（drawable/ic_launcher_background.xml、drawable-v24/ic_launcher_foreground.xml）。
    # 我们的自适应图标用 @mipmap/ic_launcher_foreground + @color/ic_launcher_background，没人引用就删掉，免得混淆。
    for x in drawable/ic_launcher_background.xml drawable-v24/ic_launcher_foreground.xml; do
      [ -f "$res/$x" ] || continue
      name=$(basename "$x" .xml)
      if grep -rq --include='*.xml' "@drawable/$name" gen/android/app/src/main; then echo "保留 $x（有引用）"; else rm -f "$res/$x"; echo "删掉 $x"; fi
    done
    rmdir "$res/drawable" "$res/drawable-v24" 2>/dev/null || true
    cp -R "$src"/. "$res"/
  fi
  check "$src" "$res"
  echo "xxxhdpi/ic_launcher.png sha256: $(sha "$res/mipmap-xxxhdpi/ic_launcher.png")"
  ls -la "$res"/mipmap-xxxhdpi "$res"/mipmap-anydpi-v26
  ;;
ios)
  src=icons/ios
  set="$(find gen/apple -type d -name AppIcon.appiconset -not -path '*/build/*' | head -1)"
  [ -n "$set" ] || { echo "gen/apple 里没找到 AppIcon.appiconset，先跑 tauri ios init"; exit 1; }
  # 只拷 png，Contents.json 用模板自带的（文件名和 tauri icon 生成的一致）
  [ "$mode" = copy ] && cp "$src"/*.png "$set"/
  check "$src" "$set"
  ;;
*) echo "用法: native-icons.sh android|ios [verify]"; exit 1 ;;
esac
