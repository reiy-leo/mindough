/**
 * 类型筛选胶囊的配色（Rei 2026-11-01「分类滚动条中的分类，不要用文字颜色，用背景颜色，注意对比度」）。
 *
 * 类型颜色只用在底色上：没选中是浅浅的一层类型色，选中是整块类型色。文字和图标用黑或白，
 * 按 WCAG 2.x 的对比度公式挑，保证和底色至少 4.5:1（AA 正文）。底色先和不透明的基色混好，
 * 不靠半透明叠在页面上，这样三种皮肤、明暗主题下算出来的对比度就是实际看到的。
 */

export type Rgb = readonly [number, number, number];
export type ChipTheme = 'light' | 'dark';

/** AA 正文的最低对比度。 */
export const AA_TEXT = 4.5;

/** 没选中时底色里类型色占多少（其余是基色）。暗色主题深一点才看得出颜色。 */
const TINT: Record<ChipTheme, number> = { light: 0.2, dark: 0.34 };
/** 混色用的基色：接近两种主题下卡片 / 胶囊的底。 */
const BASE: Record<ChipTheme, Rgb> = { light: [255, 255, 255], dark: [36, 36, 38] };
/** 文字候选：主题本来的字色优先，不够再换另一个，最后退到纯黑 / 纯白。 */
const INK_DARK: Rgb = [29, 29, 31];
const INK_LIGHT: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/** #rgb / #rrggbb → [r, g, b]；认不出来返回 null。 */
export function parseHex(hex: string | null | undefined): Rgb | null {
  const s = (hex ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) return [0, 1, 2].map((i) => parseInt(s[i]! + s[i]!, 16)) as unknown as Rgb;
  if (/^[0-9a-f]{6}$/i.test(s)) return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as unknown as Rgb;
  return null;
}

export function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** WCAG 相对亮度。 */
export function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** 两个颜色的对比度（1–21）。 */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** 按 t（0–1）把 a 混进 b：t = 1 就是 a。 */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [0, 1, 2].map((i) => a[i]! * t + b[i]! * (1 - t)) as unknown as Rgb;
}

/** 在底色上挑字色：先用 preferred，不到 4.5:1 换 other，再不行在纯黑、纯白里挑对比度高的（两者之一总能到 4.58:1）。 */
export function readableInk(bg: Rgb, preferred: Rgb, other: Rgb): Rgb {
  for (const ink of [preferred, other]) if (contrastRatio(ink, bg) >= AA_TEXT) return ink;
  return contrastRatio(BLACK, bg) >= contrastRatio(INK_LIGHT, bg) ? BLACK : INK_LIGHT;
}

export interface ChipColors {
  /** 没选中：底色、字色、描边。 */
  bg: string;
  fg: string;
  border: string;
  /** 选中：整块类型色 + 黑或白的字。 */
  selBg: string;
  selFg: string;
}

/** 一个类型颜色在某个主题下的胶囊配色。颜色认不出来返回 null（照旧用默认样式）。 */
export function chipColors(color: string | null | undefined, theme: ChipTheme): ChipColors | null {
  const c = parseHex(color);
  if (!c) return null;
  const base = BASE[theme];
  const bg = mix(c, base, TINT[theme]);
  const [native, other] = theme === 'light' ? [INK_DARK, INK_LIGHT] : [INK_LIGHT, INK_DARK];
  const fg = readableInk(bg, native, other);
  // 描边比底色再深 / 亮一点，浅色的类型（黄、浅绿）在白底上也看得出边
  const border = mix(c, base, Math.min(1, TINT[theme] + 0.25));
  const selFg = readableInk(c, INK_LIGHT, INK_DARK);
  return { bg: toHex(bg), fg: toHex(fg), border: toHex(border), selBg: toHex(c), selFg: toHex(selFg) };
}

/**
 * 把一个颜色当字色用（多彩档：任务行里的项目名、类型名、分区标题，Rei 2026-11-09）：
 * 和主题底色对比不到 4.5:1 就往黑（亮色）或白（暗色）一点点靠，直到够为止。认不出来返回 null。
 */
export function readableTint(color: string | null | undefined, theme: ChipTheme): string | null {
  const c = parseHex(color);
  if (!c) return null;
  // 三种皮肤的卡片底不一样：亮色最暗的是 Material 的 #e8e7ee（2026-11-13 紫换蓝，原 #ece6f0）、暗色最亮的是 Apple 的 #3a3a3c，两头都要够
  const bases: Rgb[] = theme === 'light' ? [BASE.light, [232, 231, 238]] : [BASE.dark, [58, 58, 60]];
  const toward: Rgb = theme === 'light' ? BLACK : INK_LIGHT;
  for (let t = 0; t <= 1; t += 0.05) {
    const ink = mix(toward, c, t);
    if (bases.every((b) => contrastRatio(ink, b) >= AA_TEXT)) return toHex(ink);
  }
  return toHex(toward);
}
