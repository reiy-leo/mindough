/**
 * 手机上不能双指放大缩小（Rei 2026-11-05「安卓界面禁用双指放大缩小」）：viewport、touch-action、安卓 WebView 三层都在。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('手机不能缩放', () => {
  it('viewport：maximum-scale=1、user-scalable=no，viewport-fit 还在', () => {
    const meta = /<meta name="viewport" content="([^"]+)"/.exec(read('../../index.html'))?.[1] ?? '';
    expect(meta).toContain('maximum-scale=1');
    expect(meta).toContain('user-scalable=no');
    expect(meta).toContain('viewport-fit=cover');
  });
  it('touch-action 只留平移，只给手机布局 / 触屏', () => {
    const css = read('../styles/app.css');
    expect(css).toMatch(/html\[data-layout='mobile'\] \{\s*touch-action: pan-x pan-y;/);
    expect(css).toMatch(/@media \(hover: none\) and \(pointer: coarse\) \{\s*html \{\s*touch-action: pan-x pan-y;/);
  });
  it('安卓 WebView：CI 脚本关掉 setSupportZoom / builtInZoomControls，并在 build.yml 里接上', () => {
    const sh = read('../../../../scripts/android-webview.sh');
    expect(sh).toContain('setSupportZoom(false)');
    expect(sh).toContain('builtInZoomControls = false');
    const yml = read('../../../../.github/workflows/build.yml');
    expect(yml).toContain('scripts/android-webview.sh');
    expect(yml).toContain('scripts/android-webview.sh verify');
  });
});
