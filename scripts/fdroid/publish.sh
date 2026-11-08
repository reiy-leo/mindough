#!/usr/bin/env bash
# 把签好名的 APK 发到自建 F-Droid 源（https://fdroid.rei8t.dev/repo）。
#
#   scripts/fdroid/publish.sh <签好名的 APK>...
#
# 要的环境变量（CI 里来自 GitHub secrets）：
#   FDROID_KEYSTORE_B64 / FDROID_KEYSTORE_PASSWORD / FDROID_KEY_ALIAS / FDROID_KEY_PASSWORD  源索引的签名钥匙
#   FDROID_UPLOAD_TOKEN   上传口（Worker mindough-fdroid-upload）的令牌
# 可选：
#   FDROID_PUBLIC_URL     公开地址，默认 https://fdroid.rei8t.dev
#   FDROID_UPLOAD_URL     上传口，默认 https://mindough-fdroid-upload.rei8t.workers.dev
#   FDROID_PREFIX         桶里的前缀，默认空；试跑时设成 _test/，跑完会删掉
#   FDROID_WORKDIR        工作目录，默认 mktemp
#   FDROID_DRY_RUN=1      只生成索引，不上传
#
# 流程：先把源里已有的 APK 拉回来（repo/ 和 archive/），放进新的 APK，跑 fdroid update 重建并签索引，
# 再把 repo/ archive/ 整个传上去，源里多出来的旧文件删掉。新版放 repo，超过 3 个版本的挪进 archive。
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
pub=${FDROID_PUBLIC_URL:-https://fdroid.rei8t.dev}
up=${FDROID_UPLOAD_URL:-https://mindough-fdroid-upload.rei8t.workers.dev}
prefix=${FDROID_PREFIX:-}
appid=dev.rei8t.mindough
[ $# -ge 1 ] || { echo "用法：$0 <APK>..."; exit 2; }
for v in FDROID_KEYSTORE_B64 FDROID_KEYSTORE_PASSWORD FDROID_KEY_ALIAS FDROID_KEY_PASSWORD; do
  [ -n "${!v:-}" ] || { echo "缺环境变量 $v"; exit 2; }
done
[ "${FDROID_DRY_RUN:-}" = 1 ] || [ -n "${FDROID_UPLOAD_TOKEN:-}" ] || { echo "缺环境变量 FDROID_UPLOAD_TOKEN"; exit 2; }

apks=()
for a in "$@"; do apks+=("$(cd "$(dirname "$a")" && pwd)/$(basename "$a")"); done
work=${FDROID_WORKDIR:-$(mktemp -d)}
mkdir -p "$work/repo/icons" "$work/archive" "$work/metadata"
cd "$work"
umask 077
echo "$FDROID_KEYSTORE_B64" | base64 -d > keystore.p12
trap 'rm -f "$work/keystore.p12" "$work/config.yml"' EXIT

# 源的设置。密码写进 config.yml，权限 600，跑完就删
cat > config.yml <<YML
repo_url: $pub/${prefix}repo
repo_name: Mindough（念头团）
repo_description: >-
  Mindough（念头团）的官方 F-Droid 源，作者 Rei Leo 自己打包、自己签名。
  The official F-Droid repo for Mindough, built and signed by Rei Leo.
repo_icon: mindough.png
archive_older: 3
archive_url: $pub/${prefix}archive
archive_name: Mindough（念头团）旧版本
archive_description: Mindough 的旧版本。Older versions of Mindough.
archive_icon: mindough.png
keystore: keystore.p12
keystorepass: $FDROID_KEYSTORE_PASSWORD
keypass: $FDROID_KEY_PASSWORD
repo_keyalias: $FDROID_KEY_ALIAS
keydname: CN=Mindough F-Droid repo, O=Rei Leo
make_current_version_link: false
YML
chmod 600 config.yml
cp "$root/apps/client/src-tauri/icons/icon.png" repo/icons/mindough.png
mkdir -p archive/icons && cp repo/icons/mindough.png archive/icons/mindough.png
cp -r "$here/metadata/." metadata/

# 拉回源里已有的 APK（第一次发布时源是空的，跳过）
if [ "${FDROID_DRY_RUN:-}" != 1 ]; then
  curl -fsS -H "Authorization: Bearer $FDROID_UPLOAD_TOKEN" "$up/" > remote.json
  for k in $(jq -r --arg p "$prefix" '.[].key | select(startswith($p)) | ltrimstr($p) | select(test("^(repo|archive)/[^/]+\\.apk$"))' remote.json); do
    [ -f "$k" ] || curl -fsS -o "$k" "$pub/$prefix$k"
  done
fi
for apk in "${apks[@]}"; do
  vc=$(aapt dump badging "$apk" 2>/dev/null | sed -n "s/.*versionCode='\([0-9]*\)'.*/\1/p" || true)
  [ -n "$vc" ] || vc=$(python3 -c "import sys; from androguard.core.bytecodes.apk import APK; print(APK(sys.argv[1]).get_androidversion_code())" "$apk" 2>/dev/null || true)
  [ -n "$vc" ] || vc=$(date +%s)
  cp "$apk" "repo/${appid}_${vc}.apk"
done

fdroid update --pretty --use-date-from-apk --verbose

# 上传：先传 APK 和图标，最后传索引，免得客户端读到新索引时文件还没到
put() {
  local f=$1 ct=application/octet-stream
  case "$f" in *.json) ct=application/json ;; *.png) ct=image/png ;; *.jar) ct=application/java-archive ;; *.apk) ct=application/vnd.android.package-archive ;; *.html) ct=text/html ;; esac
  local url="$up/$prefix$f" h="Authorization: Bearer $FDROID_UPLOAD_TOKEN"
  if [ "$(stat -c %s "$f")" -le $((90 * 1024 * 1024)) ]; then
    curl -fsS -X PUT -H "$h" -H "content-type: $ct" --data-binary "@$f" "$url" >/dev/null
  else
    # Worker 一次最多收 100MB，大文件按 50MB 分片
    local id parts=() n=1 p
    id=$(curl -fsS -X POST -H "$h" -H "content-type: $ct" "$url?uploads" | jq -r .uploadId)
    rm -rf "$work/parts"; mkdir "$work/parts"; split -b 50M -d -a 3 "$f" "$work/parts/p"
    for p in "$work/parts"/p*; do
      parts+=("$(curl -fsS -X PUT -H "$h" --data-binary "@$p" "$url?uploadId=$(jq -rn --arg v "$id" '$v|@uri')&part=$n")")
      n=$((n + 1))
    done
    printf '%s\n' "${parts[@]}" | jq -s '[.[] | {partNumber, etag}]' |
      curl -fsS -X POST -H "$h" --data-binary @- "$url?uploadId=$(jq -rn --arg v "$id" '$v|@uri')&complete" >/dev/null
    rm -rf "$work/parts"
  fi
  echo "  传 $prefix$f"
}
if [ "${FDROID_DRY_RUN:-}" = 1 ]; then
  echo "试跑：不上传。索引在 $work/repo"; ls -l repo; exit 0
fi
files=$(find repo archive -type f | sort)
for f in $(echo "$files" | grep -Ev '/(index|entry|diff/)'); do put "$f"; done
for f in $(echo "$files" | grep -E '/(index|entry|diff/)'); do put "$f"; done
# 删掉源里已经不在本地的文件（比如挪进 archive 的旧 APK）
for k in $(jq -r --arg p "$prefix" '.[].key | select(startswith($p)) | ltrimstr($p) | select(test("^(repo|archive)/"))' remote.json); do
  if ! echo "$files" | grep -qxF "$k"; then
    curl -fsS -X DELETE -H "Authorization: Bearer $FDROID_UPLOAD_TOKEN" "$up/$prefix$k" >/dev/null; echo "  删 $prefix$k"
  fi
done
fp=$(keytool -list -v -keystore keystore.p12 -storepass "$FDROID_KEYSTORE_PASSWORD" -alias "$FDROID_KEY_ALIAS" | sed -n 's/.*SHA256: //p' | head -1 | tr -d ':')
echo "完成：$pub/${prefix}repo?fingerprint=$fp"
