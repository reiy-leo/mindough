# Android 发布：固定签名 + 自建 F-Droid 源

从 2026-11-09 起，CI 打的 Android 包是 **release APK**，每次都用同一把钥匙签名；推 `v*` 标签时，这个 APK 同时挂到 GitHub Release 草稿、发到自建的 F-Droid 源。手机上加一次源，以后 F-Droid 客户端会自己提示更新。

## 在手机上装

1. 装 F-Droid 客户端（f-droid.org），或任何认 F-Droid 源的客户端（Droid-ify、Neo Store 都行）。
2. 在客户端里添加源，地址填（或在手机浏览器里打开这个链接，客户端会接管）：

   ```
   https://fdroid.rei8t.dev/repo?fingerprint=F4B21E7612495FE53748EE9203E5966A0D931336ED7DD8646D71FD72B2AA6F83
   ```

   带上 `fingerprint`，客户端会核对源的签名，别人冒充不了这个源。
3. 刷新源，搜「Mindough」或「念头团」安装。

**第一次换到 release 包要先卸载。** alpha.17 及以前挂在 Release 上的是 debug 包，用的是每台 CI 机器临时生成的调试钥匙；release 包换了钥匙，Android 不让签名不同的包覆盖安装。所以：先把 app 里的数据同步到云端（或在设置里导出），卸载旧包，再装新包。以后的版本签名不变，直接覆盖升级。

## 钥匙

两把钥匙，都是 PKCS12、RSA 4096、有效期 30 年（10950 天），2026-11-09 在 LightVela 上用 keytool 生成，原件和密码放在 Hark 工作区的 `.keys/android/`（不进 git），LightVela 上的副本已删。

| 用途 | alias | 证书 SHA-256 |
| --- | --- | --- |
| APK 签名 | `mindough` | `1F:46:51:B3:BE:BF:FB:D4:EA:2D:DF:04:7F:37:84:51:9C:0E:21:37:B5:36:48:03:59:28:51:4A:02:B5:79:B7` |
| F-Droid 源索引签名 | `mindough-repo` | `F4:B2:1E:76:12:49:5F:E5:37:48:EE:92:03:E5:96:6A:0D:93:13:36:ED:7D:D8:64:6D:71:FD:72:B2:AA:6F:83` |

- **APK 钥匙丢了**：以后的新版本装不上去，所有用户都得卸载重装。一定要另外备份一份。
- **源钥匙丢了**：换一把新的，用户要删掉旧源、重新添加新指纹的源；APK 不受影响。

GitHub 仓库的 Actions secrets：

| secret | 内容 |
| --- | --- |
| `ANDROID_KEYSTORE_B64` | APK 钥匙文件的 base64 |
| `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_PASSWORD` | 它的密码（PKCS12 两个一样） |
| `ANDROID_KEY_ALIAS` | `mindough` |
| `FDROID_KEYSTORE_B64` | 源钥匙文件的 base64 |
| `FDROID_KEYSTORE_PASSWORD` / `FDROID_KEY_PASSWORD` | 它的密码 |
| `FDROID_KEY_ALIAS` | `mindough-repo` |
| `FDROID_UPLOAD_TOKEN` | 上传口的令牌（见下） |

## CI 怎么做（`.github/workflows/build.yml`）

1. **android 任务**：`pnpm tauri android build --apk --target aarch64` 打未签名的 release 包，`zipalign` 后用 `apksigner` 签（v2 / v3 签名），再核证书指纹，和 workflow 里写死的 `ANDROID_CERT_SHA256` 对不上就失败。图标、显示名、WebView 不缩放、版本号这几步照旧。产物叫 `Mindough-<版本>-android-arm64.apk`，artifact 名 `mindough-android-release`。
2. **release-android 任务**（推标签）：把这个 APK 挂到 Release 草稿。
3. **fdroid 任务**（推标签，或手动触发时勾选 `fdroid_test`）：用 pip 装最新的 fdroidserver（Ubuntu 源里的 2.2.1 带的 androguard 太旧，读新版 AGP 打的包会报 `res1 must be zero!`），跑 `scripts/fdroid/publish.sh`：
   - 把源里已有的 APK 下载回来，放进新的 APK；
   - `fdroid update` 重建索引（index-v1、index-v2、entry.jar），用源钥匙签名；最新 3 个版本放 `repo/`，更早的挪进 `archive/`；
   - 把 `repo/`、`archive/` 传上去，先传 APK、最后传索引；源里多出来的旧文件删掉。
   - 手动触发勾 `fdroid_test` 时发到 `_test/` 目录，不动正式源。

只打 arm64 一种架构。2019 年以后的 Android 手机基本都是 64 位，加 armv7 包会更大、CI 多编一遍。要支持老手机再加 `--target armv7`。

## 源放在哪

- R2 桶 `mindough-fdroid`，绑自定义域 `fdroid.rei8t.dev`，公开只读。正式源 `https://fdroid.rei8t.dev/repo`，旧版本 `https://fdroid.rei8t.dev/archive`。第一次推标签之前，源是空的，打开会 404。
- 写入只走 Worker `mindough-fdroid-upload`（`https://mindough-fdroid-upload.rei8t.workers.dev`，代码 `scripts/fdroid/upload-worker.js`），要带 `Authorization: Bearer <FDROID_UPLOAD_TOKEN>`。它只绑了这一个桶。Worker 一次最多收 100MB，大于 90MB 的文件分 50MB 一片传。
- 为什么不直接给 CI 一把 R2 的 S3 密钥：现有的 Cloudflare 令牌没有建令牌的权限，发不出只管这个桶的密钥；把账号级令牌放进 GitHub secrets 权限又太大。
- 缓存：`index*`、`entry.*`、`diff/` 设 `no-cache`，客户端每次都拿到最新索引；APK 和图片缓存一天（文件名带 versionCode，不会撞）。

## 源的介绍

`scripts/fdroid/metadata/` 里放 F-Droid 客户端上显示的名字、一句话介绍和长介绍（`en-US`、`zh-CN` 两种），分类、许可证、作者、主页在 `dev.rei8t.mindough.yml`。源的名字、说明、图标写在 `publish.sh` 生成的 `config.yml` 里，图标用 `apps/client/src-tauri/icons/icon.png`。

## 本地试跑

有 JDK、fdroidserver（pip 装）、Android build-tools（`aapt`、`apksigner`）的 Linux 上：

```sh
export FDROID_KEYSTORE_B64=$(base64 -w0 mindough-fdroid-repo.p12) FDROID_KEYSTORE_PASSWORD=… FDROID_KEY_ALIAS=mindough-repo FDROID_KEY_PASSWORD=…
FDROID_DRY_RUN=1 scripts/fdroid/publish.sh 某个签好名的.apk          # 只生成索引
FDROID_UPLOAD_TOKEN=… FDROID_PREFIX=_test/ scripts/fdroid/publish.sh 某个签好名的.apk   # 发到 _test/
```

2026-11-09 在 LightVela 上用 alpha.17 的 debug 包重签（release 钥匙）试过一遍：fdroidserver 2.4.5 生成并签好索引，传到 `_test/`，从 `https://fdroid.rei8t.dev/_test/repo` 读回来，包名、版本 0.1.0-alpha.17 / 100017、签名指纹都对；试完把 `_test/` 删了。
