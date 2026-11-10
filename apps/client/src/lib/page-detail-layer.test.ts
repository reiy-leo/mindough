/**
 * 手机整页详情拖选变黑（Rei 2026-11-11 录屏：安卓拖选区手柄、系统放大镜出来时，顶栏以下整块变黑，松手恢复）：
 * 正文那层（滚动容器，单独的合成层）自己画不透明底，不靠下面 .page-detail 透上来；.page-detail 不常驻 will-change。
 * alpha.22 只给滚动容器写 background-color 没用（Rei 05:27「还是在 select text 时就会背景变黑」）：底色画在容器外层，
 * 跟着滚的那层还是透明。现在底色 local（画进跟着滚的那层），内容外面再包一层铺满的不透明「纸」（.pane-body-sheet）。
 * 彩色档位的顶部淡色在「纸」上接着画。手机上 html 自己画底。安卓原生那边的兜底在 scripts/android-webview.sh（关自动压暗、不透明底、底色桥）。
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
  it('滚动区底色画进跟着滚的那层（local），内边距挪到「纸」上', () => {
    const body = ruleBody(app, '.page-detail .pane-body')!;
    expect(body).toMatch(/background:\s*var\(--pane-page-bg, var\(--bg\)\) local/);
    expect(body).toMatch(/padding:\s*0/);
  });
  it('「纸」不透明、至少铺满滚动区、带内边距', () => {
    const body = ruleBody(app, '.page-detail .pane-body-sheet')!;
    expect(body).toMatch(/background-color:\s*var\(--pane-page-bg, var\(--bg\)\)/);
    expect(body).toMatch(/min-height:\s*100%/);
    expect(body).toMatch(/box-sizing:\s*border-box/);
    expect(body).toMatch(/padding:\s*var\(--space-1\) var\(--space-4\) var\(--space-8\)/);
  });
  it('手机上 html 自己画不透明底', () => {
    expect(app).toMatch(/html\[data-layout='mobile'\]\s*\{\s*background-color:\s*var\(--bg\);\s*\}/);
  });
  it('只有整页详情把正文包进「纸」', () => {
    const tsx = readFileSync(fileURLToPath(new URL('../components/task/TaskDetail.tsx', import.meta.url)), 'utf8');
    expect(tsx).toMatch(/page \? <div className="pane-body-sheet">\{children\}<\/div> : children/);
  });
  it('整页不常驻 will-change（推入动画照旧）', () => {
    const body = ruleBody(app, '.page-detail')!;
    expect(body).toMatch(/animation:\s*page-push/);
    expect(body).not.toMatch(/will-change/);
  });
  it('彩色档位的顶部淡色在「纸」上接着画，往上挪状态栏 + 顶栏高', () => {
    const body = ruleBody(read('color-level.css'), ":root[data-color-level='vivid'][style*='--detail-tint'] .page-detail .pane-body-sheet");
    expect(body).toMatch(/background-image:\s*linear-gradient/);
    expect(body).toMatch(/background-position:\s*0 calc\(-1 \* \(env\(safe-area-inset-top\) \+ var\(--page-head-h, 52px\)\)\)/);
  });
});
