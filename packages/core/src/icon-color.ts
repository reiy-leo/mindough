/**
 * 图标块的颜色（Rei 2026-11-04「类型的图标也和项目图标一样，共用样式和图标」「类型的颜色很少，也不好看，优化一点」）。
 *
 * 类型和项目的图标都画成「彩色圆角方块 + 白色图标」，选颜色用同一套色板 ICON_COLORS。
 * 色板按色相排：前 15 个彩色在 OKLCH 里明度、彩度基本一样（L≈0.61–0.65，C≤0.17），
 * 每个都调到白色图标在上面对比度约 3.5:1（WCAG 要求图形至少 3:1）；最后 3 个是棕、蓝灰、灰。
 * 亮、暗主题用同一个色值：方块是实心的，两种底上都看得清。
 *
 * 存的是 hex（类型 category.color 本来就存 hex，项目 group.color 也存 hex），
 * 老数据里不在色板上的 hex、自己调的颜色照常显示。
 * 倒数日卡片的背景色（card-color.ts）是另一回事：那是大块浅底配文字，亮暗主题各一套，不共用。
 */
export const ICON_COLORS = [
  { id: 'red', hex: '#e45d58' },
  { id: 'orange', hex: '#dd6517' },
  { id: 'amber', hex: '#be7a0b' },
  { id: 'lime', hex: '#7c9209' },
  { id: 'green', hex: '#259d3c' },
  { id: 'emerald', hex: '#119a70' },
  { id: 'teal', hex: '#0d9990' },
  { id: 'cyan', hex: '#1296ab' },
  { id: 'sky', hex: '#1091c9' },
  { id: 'blue', hex: '#4786ee' },
  { id: 'indigo', hex: '#767df1' },
  { id: 'violet', hex: '#9c72e6' },
  { id: 'purple', hex: '#b969d1' },
  { id: 'magenta', hex: '#d25fac' },
  { id: 'pink', hex: '#e05a83' },
  { id: 'brown', hex: '#95694c' },
  { id: 'slate', hex: '#647386' },
  { id: 'graphite', hex: '#717171' },
] as const;

export const ICON_COLOR_HEXES: readonly string[] = ICON_COLORS.map((c) => c.hex);

const HEX = /^#[0-9a-f]{6}$/i;

/** 能当颜色存的值：#rrggbb（大小写都行），别的都不算。 */
export function isIconColor(v: unknown): v is string {
  return typeof v === 'string' && HEX.test(v.trim());
}

/** 存之前整理一下：#RRGGBB → #rrggbb；认不出来的返回 null（= 用默认色）。 */
export function normalizeIconColor(v: unknown): string | null {
  return isIconColor(v) ? v.trim().toLowerCase() : null;
}

/**
 * 没选过颜色的东西（老项目、group.color 是空的）用哪个颜色：按 id 稳定地从色板里挑一个彩色（不挑最后 3 个灰的），
 * 同一个项目在每台设备上都是同一个颜色，项目多了也不会全是一个色。
 */
export function defaultIconColor(id: string | null | undefined): string {
  const s = id ?? '';
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = ICON_COLORS.length - 3;
  return ICON_COLORS[(h >>> 0) % n]!.hex;
}

/** 项目图标的颜色：选过的用选的，没选过按 id 挑。 */
export function groupColor(group: { id?: string; color?: string | null } | null | undefined): string {
  return normalizeIconColor(group?.color) ?? defaultIconColor(group?.id);
}
