#!/usr/bin/env node
/**
 * 版本号：从 git 标签（v0.1.0-alpha.13）算出各平台要填的版本（Rei 2026-11-03「该改」：macOS app 要分得出是第几个 alpha）。
 *
 * 规则：
 * - 界面上显示的完整版本：推标签构建是标签本身「v0.1.0-alpha.13」；别的构建（手动跑 Actions、本地、网页版）是「v0.1.0-dev+<短哈希>」。
 * - macOS / iOS：CFBundleShortVersionString 只能是数字，填 0.1.0；CFBundleVersion 填预发布序号，「关于」显示「0.1.0 (13)」。
 * - Windows：msi 版本只认数字，wix 填 0.1.0.13；nsis 和 exe 资源用 0.1.0。
 * - Android：versionName 带预发布标签（0.1.0-alpha.13），versionCode 见 androidVersionCode。
 * - Linux：0.1.0。
 * 预发布序号：alpha.N → N，beta.N → 300 + N，rc.N → 600 + N；正式版 999（只用在 Android versionCode），非标签构建 0。
 *
 * 命令行（CI 用，见 .github/workflows/build.yml）：
 *   node scripts/app-version.mjs                 # 打印完整版本
 *   node scripts/app-version.mjs apply <平台>    # 平台 macos | windows | linux | android | ios：
 *                                                #   把版本合进 apps/client/src-tauri/tauri.<平台>.conf.json（Tauri 构建时自动合并），
 *                                                #   有 GITHUB_ENV 时写入 MINDOUGH_VERSION，前端构建用它
 * 纯函数另有单测：apps/client/src/lib/app-version.test.ts。
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLATFORMS = ['macos', 'windows', 'linux', 'android', 'ios'];

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * 读标签：「v0.1.0-alpha.13」「refs/tags/v0.1.0-alpha.13」「0.2.0」都认；认不出返回 null。
 * @param {string | null | undefined} tag
 */
export function parseTag(tag) {
  if (!tag) return null;
  const m = SEMVER.exec(String(tag).trim().replace(/^refs\/tags\//, ''));
  if (!m) return null;
  const [major, minor, patch] = [m[1], m[2], m[3]].map(Number);
  const pre = m[4] ?? '';
  return { base: `${major}.${minor}.${patch}`, major, minor, patch, pre, build: preNumber(pre) };
}

/**
 * 预发布序号：alpha.N → N，beta.N → 300 + N，rc.N → 600 + N；没有预发布标签是 999（正式版）；认不出的是 0。
 * N 超出各段的范围（alpha、beta 1–299，rc 1–398）也算 0，免得和下一段撞。
 * @param {string} pre
 */
export function preNumber(pre) {
  if (!pre) return 999;
  const m = /^(alpha|beta|rc)\.?(\d+)$/i.exec(pre);
  if (!m) return 0;
  const n = Number(m[2]);
  const stage = m[1].toLowerCase();
  const [offset, max] = stage === 'alpha' ? [0, 299] : stage === 'beta' ? [300, 299] : [600, 398];
  return n >= 1 && n <= max ? offset + n : 0;
}

/**
 * 算版本：tag 是推标签构建的标签名（没有就是非标签构建），sha 是 commit 短哈希，baseVersion 是 tauri.conf.json 的 version。
 * @param {{ tag?: string | null, sha?: string | null, baseVersion: string }} input
 */
export function resolveVersion({ tag, sha, baseVersion }) {
  const t = parseTag(tag);
  const short = (sha ?? '').trim().slice(0, 7);
  if (t) {
    return {
      isTag: true,
      base: t.base,
      pre: t.pre,
      build: t.pre ? t.build : 999,
      display: `v${t.base}${t.pre ? `-${t.pre}` : ''}`,
      sha: short,
      parts: t,
    };
  }
  const b = parseTag(baseVersion);
  if (!b) throw new Error(`tauri.conf.json 的 version 不是 x.y.z：${baseVersion}`);
  return {
    isTag: false,
    base: b.base,
    pre: 'dev',
    build: 0,
    display: `v${b.base}-dev${short ? `+${short}` : ''}`,
    sha: short,
    parts: b,
  };
}

/**
 * Android versionCode = 主 × 10⁷ + 次 × 10⁵ + 修订 × 10³ + 预发布序号。0.1.0-alpha.13 → 100013，0.1.0 正式版 → 100999，非标签构建 → 100000。
 * 上限 2,100,000,000（Google Play），所以主版本最大 209，次版本、修订号最大 99。
 * @param {ReturnType<typeof resolveVersion>} v
 */
export function androidVersionCode(v) {
  const { major, minor, patch } = v.parts;
  if (major > 209 || minor > 99 || patch > 99) throw new Error(`版本 ${v.base} 超出 versionCode 的编码范围（主 ≤ 209，次、修订 ≤ 99）`);
  return major * 10_000_000 + minor * 100_000 + patch * 1_000 + v.build;
}

/**
 * 各平台合进 tauri.<平台>.conf.json 的内容（JSON merge patch，只动 version 和 bundle 下的版本字段）。
 * @param {string} platform
 * @param {ReturnType<typeof resolveVersion>} v
 */
export function nativeOverlay(platform, v) {
  // macOS / iOS 的 CFBundleVersion：预发布填序号，非标签构建填 0，正式版不填（跟 CFBundleShortVersionString 一样，「关于」只显示 0.1.0）
  const bundleVersion = v.isTag && !v.pre ? undefined : String(v.build);
  switch (platform) {
    case 'macos':
      return { version: v.base, bundle: { macOS: { bundleVersion: bundleVersion ?? null } } };
    case 'ios':
      return { version: v.base, bundle: { iOS: { bundleVersion: bundleVersion ?? null } } };
    case 'windows':
      // msi 的第四段最大 65535；只有预发布用第四段，正式版和非标签构建就是 x.y.z
      return { version: v.base, bundle: { windows: { wix: { version: v.isTag && v.pre && v.build > 0 ? `${v.base}.${v.build}` : v.base } } } };
    case 'linux':
      return { version: v.base };
    case 'android': {
      // versionName 跟 config.version 走，带预发布标签；非标签构建「0.1.0-dev+abc1234」
      const name = v.isTag ? `${v.base}${v.pre ? `-${v.pre}` : ''}` : `${v.base}-dev${v.sha ? `+${v.sha}` : ''}`;
      return { version: name, bundle: { android: { versionCode: androidVersionCode(v) } } };
    }
    default:
      throw new Error(`不认识的平台：${platform}（可选 ${PLATFORMS.join(' / ')}）`);
  }
}

/**
 * JSON merge patch（RFC 7396）：值为 null 的键删掉。
 * @param {any} target
 * @param {any} patch
 */
export function mergePatch(target, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = target && typeof target === 'object' && !Array.isArray(target) ? { ...target } : {};
  for (const [k, val] of Object.entries(patch)) {
    if (val === null) delete out[k];
    else out[k] = mergePatch(out[k], val);
  }
  return out;
}

/**
 * 从环境里认出这次构建：推标签的 Actions（GITHUB_REF_TYPE=tag）用 GITHUB_REF_NAME；短哈希取 GITHUB_SHA，没有就问 git。
 * 本地和网页版构建一律算非标签构建，显示短哈希。MINDOUGH_VERSION 已设（CI 上一步写的）就直接用它。
 * @param {Record<string, string | undefined>} env
 * @param {string} baseVersion
 * @param {() => string} [gitSha]
 */
export function versionFromEnv(env, baseVersion, gitSha = localGitSha) {
  const tag = env.GITHUB_REF_TYPE === 'tag' ? env.GITHUB_REF_NAME : null;
  const sha = env.GITHUB_SHA ? env.GITHUB_SHA.slice(0, 7) : gitSha();
  return resolveVersion({ tag, sha, baseVersion });
}

export function localGitSha() {
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TAURI_DIR = join(ROOT, 'apps/client/src-tauri');

export function baseVersionFromConf() {
  return JSON.parse(readFileSync(join(TAURI_DIR, 'tauri.conf.json'), 'utf8')).version;
}

function main(argv) {
  const v = versionFromEnv(process.env, baseVersionFromConf());
  if (argv[0] !== 'apply') {
    console.log(v.display);
    return;
  }
  const platform = argv[1];
  const overlay = nativeOverlay(platform, v);
  const file = join(TAURI_DIR, `tauri.${platform}.conf.json`);
  const cur = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { $schema: 'https://schema.tauri.app/config/2' };
  writeFileSync(file, JSON.stringify(mergePatch(cur, overlay), null, 2) + '\n');
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `MINDOUGH_VERSION=${v.display}\n`);
  console.log(`${v.display} → ${file.slice(ROOT.length + 1)}: ${JSON.stringify(overlay)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
