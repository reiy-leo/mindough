#!/usr/bin/env bash
# 从 apps/client/src-tauri/icons/source-icon.png 生成全部图标。需要 ImageMagick 7。
# 源图是 Rei 给的成品图标（2026-11-08，https://m.rei8t.dev/i/ItpxEelT.png）：1254 见方、透明底，中间是蓝色圆角方块 + 白色对勾。
set -euo pipefail
cd "$(dirname "$0")/../apps/client"
I=src-tauri/icons; P=public/icons; T=$(mktemp -d)
S=$I/source-icon.png
# 1. 抠出圆角方块：按不透明区域裁边，方块本体的透明度拉满（源图是 253/255），缩成 1024 见方
magick "$S" -channel A -level 2%,99% +channel -trim +repage -resize 1024x1024! $T/tile.png
# 2. 满版（iOS、安卓旧图标、maskable）：方块放大 1.3 倍再糊开垫底，补上四个透明角，再叠原方块
magick $T/tile.png -resize 1330x1330 -gravity center -crop 1024x1024+0+0 +repage -blur 0x40 $T/fill.png
magick $T/fill.png $T/tile.png -gravity center -composite -background '#2BA4FB' -alpha remove -alpha off -depth 8 $I/source-full.png
# 3. macOS：824 见方 + 阴影，放进 1024（苹果图标网格）；Windows / Linux 同图
magick $T/tile.png -resize 824x824 $T/t824.png
magick $T/t824.png \( +clone -background '#0b3a7a' -shadow 35x14+0+12 \) +swap -background none -layers merge +repage $T/sh.png
magick $T/sh.png -gravity center -background none -extent 1024x1024 -depth 8 $I/source-macos.png
pnpm exec tauri icon $I/source-macos.png -o $T/mac >/dev/null
cp $T/mac/*.png $T/mac/icon.icns $T/mac/icon.ico $I/
# 4. iOS（满版、不能有透明）
pnpm exec tauri icon $I/source-full.png -o $T/full >/dev/null
for f in $T/full/ios/*.png; do magick "$f" -background white -alpha remove -alpha off $I/ios/$(basename "$f"); done
# 5. Android：旧版满版 / 圆形；自适应前景 = 满版图缩到 108dp 里的 80dp，外圈用糊开的底色补满（可见区只有中间 72dp）
magick $T/fill.png -resize 1382x1382 $T/fg-bg.png
magick $I/source-full.png -resize 1024x1024 $T/fg-c.png
magick $T/fg-bg.png $T/fg-c.png -gravity center -composite -alpha off $T/fg.png
for p in mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do IFS=: read d s g <<<"$p"; D=$I/android/mipmap-$d
  magick $I/source-full.png -resize ${s}x${s} -alpha off $D/ic_launcher.png
  magick $I/source-full.png -resize ${s}x${s} \( -size ${s}x${s} xc:none -fill white -draw "circle $((s/2)),$((s/2)) $((s/2)),0" \) -alpha off -compose CopyOpacity -composite $D/ic_launcher_round.png
  magick $T/fg.png -resize ${g}x${g} $D/ic_launcher_foreground.png; done
# 6. 网页 / PWA：普通图标和 favicon 用方块本身（四周留 3%），maskable、apple-touch-icon 用满版
magick $T/tile.png -resize 964x964 -gravity center -background none -extent 1024x1024 $T/web.png
magick $T/web.png -resize 192x192 $P/icon-192.png; magick $T/web.png -resize 512x512 $P/icon-512.png
magick $I/source-full.png -resize 192x192 $P/maskable-192.png; magick $I/source-full.png -resize 512x512 $P/maskable-512.png
magick $I/source-full.png -resize 180x180 -alpha off $P/apple-touch-icon.png
magick $T/web.png -resize 64x64 public/favicon.png; magick $T/web.png -define icon:auto-resize=48,32,16 public/favicon.ico
rm -rf $T; echo "图标已生成。改了 public/icons 记得把 public/sw.js 的 SHELL 版本号 +1。"
