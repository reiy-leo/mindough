// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MOOD_IDS } from '@mindough/core';
import { MoodIcon } from './MoodIcon';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('心情图标', () => {
  it('31 个各画各的、颜色走 --mood 令牌（类名），不写死颜色', () => {
    const svgs = MOOD_IDS.map((id) => renderToStaticMarkup(<MoodIcon mood={id} />));
    expect(svgs).toHaveLength(31);
    // 去掉外层的 mood-<id> 类名再比，确认画的东西本身不一样
    expect(new Set(svgs.map((s) => s.replace(/class="mood-icon[^"]*"/, ''))).size).toBe(31);
    for (const [i, svg] of svgs.entries()) {
      expect(svg).toContain(`mood-${MOOD_IDS[i]}`);
      expect(svg).toContain('stroke="currentColor"');
      expect(svg).not.toMatch(/#[0-9a-f]{3,6}/i);
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain('class="mi-face"');
    }
  });
  it('点选时带 is-playing；不认识的 id 画成「一般」', () => {
    expect(renderToStaticMarkup(<MoodIcon mood="happy" playing />)).toContain('is-playing');
    expect(renderToStaticMarkup(<MoodIcon mood="future-mood" />)).toBe(renderToStaticMarkup(<MoodIcon mood="okay" />));
  });
});

describe('心情样式（2026-11-16 加到 31 个）', () => {
  const journal = read('../../styles/journal.css');
  const tokens = read('../../skin/tokens.css');
  const plain = read('../../styles/color-level.css');
  it('每个心情都有颜色类、点选动画，动画都包在「不减少动态效果」里', () => {
    const motion = journal.slice(journal.indexOf('@media (prefers-reduced-motion: no-preference)'), journal.indexOf('@keyframes'));
    expect(motion.length).toBeGreaterThan(0);
    for (const id of MOOD_IDS) {
      expect(journal, id).toContain(`.mood-${id} { color: var(--mood-${id}); }`);
      expect(motion, `${id} 没有点选动画`).toMatch(new RegExp(`\\.mood-${id}\\.is-playing `));
    }
    // 用到的 keyframes 都有定义
    for (const [, name] of motion.matchAll(/animation: (mi-[a-z-]+)/g)) expect(journal, name).toContain(`@keyframes ${name} `);
  });
  it('三套皮肤 × 亮暗、素净档亮暗，每个心情都有 --mood 令牌；不用 color-mix', () => {
    const blocks = (css: string, sel: RegExp) => [...css.matchAll(sel)].map((m) => m[1] ?? '').filter((b) => b.includes('--mood-happy'));
    const skin = blocks(tokens, /\[data-skin='(?:apple|winui|material)'\](?:\[data-theme='dark'\])? \{([^}]*)\}/g);
    expect(skin).toHaveLength(6);
    const pl = blocks(plain, /:root\[data-color-level='plain'\]\[data-theme='(?:light|dark)'\] \{([^}]*)\}/g);
    expect(pl).toHaveLength(2);
    for (const b of [...skin, ...pl]) {
      for (const id of MOOD_IDS) expect(b, id).toMatch(new RegExp(`--mood-${id}: #[0-9a-f]{6};`));
      expect(b).not.toContain('color-mix');
    }
  });
  it('Material 的新颜色不用紫（色相不在 270°–330°）', () => {
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      if (d < 0.08) return null; // 近灰，不算
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    const mat = [...tokens.matchAll(/\[data-skin='material'\](?:\[data-theme='dark'\])? \{([^}]*)\}/g)].map((m) => m[1] ?? '').filter((b) => b.includes('--mood-happy'));
    for (const b of mat) {
      for (const id of MOOD_IDS.slice(12)) {
        const hex = new RegExp(`--mood-${id}: (#[0-9a-f]{6})`).exec(b)![1]!;
        const h = hue(hex);
        if (h !== null) expect(h < 270 || h > 330, `${id} ${hex} 色相 ${h.toFixed(0)}`).toBe(true);
      }
    }
  });
});
