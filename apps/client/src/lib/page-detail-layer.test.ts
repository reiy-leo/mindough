/**
 * 手机整页详情拖选变黑（Rei 2026-11-11 录屏：安卓拖选区手柄、系统放大镜出来时，顶栏以下整块变黑，松手恢复）：
 * 正文那层（滚动容器，单独的合成层）自己画不透明底，不靠下面 .page-detail 透上来；.page-detail 不常驻 will-change。
 * 彩色档位的顶部淡色在正文层上接着画。安卓原生那边的兜底在 scripts/android-webview.sh（关自动压暗）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(fileURLToPath(new URL(`../styles/${f}`, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const ruleBody = (css: string, sel: string) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'm').exec(css)?.[1];
};

describe('手机整页详情的正文层', () => {
  const app = read('app.css');
  it('正文层有自己的底色，跟整页一样', () => {
    expect(ruleBody(app, '.page-detail .pane-body')).toMatch(/background-color:\s*var\(--pane-page-bg, var\(--bg\)\)/);
  });
  it('整页不常驻 will-change（推入动画照旧）', () => {
    const body = ruleBody(app, '.page-detail')!;
    expect(body).toMatch(/animation:\s*page-push/);
    expect(body).not.toMatch(/will-change/);
  });
  it('彩色档位的顶部淡色在正文层上接着画，往上挪状态栏 + 顶栏高', () => {
    const body = ruleBody(read('color-level.css'), ":root[data-color-level='vivid'][style*='--detail-tint'] .page-detail .pane-body");
    expect(body).toMatch(/background-image:\s*linear-gradient/);
    expect(body).toMatch(/background-position:\s*0 calc\(-1 \* \(env\(safe-area-inset-top\) \+ var\(--page-head-h, 52px\)\)\)/);
  });
});
