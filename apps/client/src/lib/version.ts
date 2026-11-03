/**
 * 界面上显示的版本号（设置底部那行小字、设置 → 关于）。由 vite.config.ts 的 define 注入，规则在 scripts/app-version.mjs：
 * - 推标签的 Actions 构建：标签本身「v0.1.0-alpha.13」
 * - 别的构建（手动跑 Actions、本地、网页版）：「v0.1.0-dev+60eeba0」，后面是构建时的 commit 短哈希
 * 没注入（比如单测）就是空串。
 */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
export const GIT_SHA: string = typeof __GIT_SHA__ === 'string' ? __GIT_SHA__ : '';

/** 显示用的版本：注入的完整版本；只有短哈希时显示短哈希。 */
export function versionLabel(version = APP_VERSION, sha = GIT_SHA): string {
  return version || sha;
}
