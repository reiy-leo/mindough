/**
 * 安卓 App 把界面底色发给原生（lib/android-bg.ts，scripts/android-webview.sh 的 MindoughAndroid.setBackground）。
 * 原生只收 #rrggbb，这里管颜色字符串怎么转。
 */
import { describe, expect, it } from 'vitest';
import { cssColorToHex } from './android-bg';

describe('cssColorToHex', () => {
  it('rgb / rgba 转成 #rrggbb', () => {
    expect(cssColorToHex('rgb(254, 247, 255)')).toBe('#fef7ff');
    expect(cssColorToHex('rgba(20, 18, 24, 1)')).toBe('#141218');
    expect(cssColorToHex('rgb(20 18 24 / 0.5)')).toBe('#141218');
  });
  it('color(srgb …)（color-mix 算出来的）也认', () => {
    expect(cssColorToHex('color(srgb 1 0.5 0)')).toBe('#ff8000');
  });
  it('透明的、认不出的不发', () => {
    expect(cssColorToHex('rgba(0, 0, 0, 0)')).toBeNull();
    expect(cssColorToHex('transparent')).toBeNull();
    expect(cssColorToHex('oklab(0.5 0 0)')).toBeNull();
  });
  it('已经是 6 位十六进制的照原样', () => {
    expect(cssColorToHex('#FEF7FF')).toBe('#fef7ff');
  });
});
