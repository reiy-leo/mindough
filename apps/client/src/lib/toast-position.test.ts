/**
 * 通知位置（Rei 2026-11-13 06:16「toast通知的位置可以在设置-通知中设置：顶部、底部、右上角、右下角」）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { effectiveToastPosition, normalizeToastPosition, TOAST_POSITION_DEFAULT, TOAST_POSITIONS } from './toast-position';

describe('通知位置', () => {
  it('四个选项，默认底部（和以前一样）', () => {
    expect(TOAST_POSITIONS).toEqual(['top', 'bottom', 'top-right', 'bottom-right']);
    expect(TOAST_POSITION_DEFAULT).toBe('bottom');
  });

  it('认不出的值当底部', () => {
    expect(normalizeToastPosition(undefined)).toBe('bottom');
    expect(normalizeToastPosition('left')).toBe('bottom');
    expect(normalizeToastPosition(3)).toBe('bottom');
    expect(normalizeToastPosition('top-right')).toBe('top-right');
  });

  it('电脑照选的放；手机右上 → 顶部、右下 → 底部', () => {
    for (const p of TOAST_POSITIONS) expect(effectiveToastPosition(p, 'desktop')).toBe(p);
    expect(effectiveToastPosition('top', 'mobile')).toBe('top');
    expect(effectiveToastPosition('bottom', 'mobile')).toBe('bottom');
    expect(effectiveToastPosition('top-right', 'mobile')).toBe('top');
    expect(effectiveToastPosition('bottom-right', 'mobile')).toBe('bottom');
    expect(effectiveToastPosition('nope', 'mobile')).toBe('bottom');
  });

  describe('样式', () => {
    const css = readFileSync(fileURLToPath(new URL('../styles/app.css', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sels: (m[1] ?? '').split(',').map((s) => s.trim()), body: m[2] ?? '' }));
    const body = (sel: string) => rules.filter((r) => r.sels.includes(sel)).map((r) => r.body).join('\n');

    it('最宽 420px，窄屏不超过屏宽减两边 16px；长文案换行、最多 4 行', () => {
      expect(body('.toasts')).toMatch(/--toast-max-w:\s*min\(420px,\s*calc\(100vw - 32px\)\)/);
      expect(body('.toasts')).toMatch(/max-width:\s*var\(--toast-max-w\)/);
      expect(body('.toast')).toMatch(/max-width:\s*100%/);
      expect(body('.toast-msg')).toMatch(/overflow-wrap:\s*anywhere/);
      expect(body('.toast-msg')).toMatch(/-webkit-line-clamp:\s*4/);
    });

    it('四个位置都有样式；顶部的盖过手机底部那条', () => {
      expect(body(".toasts[data-pos='top']")).toMatch(/top:/);
      expect(body(".toasts[data-pos='top-right']")).toMatch(/top:/);
      expect(body(".toasts[data-pos='bottom-right']")).toMatch(/right:/);
      expect(body("[data-layout='mobile'] .toasts[data-pos='top']")).toMatch(/bottom:\s*auto/);
    });

    it('提示的样式里没有新加 color-mix（只留原来那一处）', () => {
      const toastRules = rules.filter((r) => r.sels.some((s) => /\.toasts?\b/.test(s)));
      expect(toastRules.map((r) => r.body).join('\n').match(/color-mix/g) ?? []).toHaveLength(1);
    });
  });
});
