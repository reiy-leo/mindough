/**
 * 编辑器的「写法和快捷键」浮层（Rei 2026-11-03「cmd+?弹出markdown键盘快捷键tooltip」）。
 * ⌘? / ⌘/（Windows / Linux 是 Ctrl）开关，Esc 关。只列编辑器真的支持的写法和快捷键（见 extensions.ts、underline.ts）。
 * Mac（和 iPad 外接键盘）显示 ⌘ ⌥ ⇧，别的系统显示 Ctrl+Alt+Shift。
 * 界面是中文时，「写法」列在半角后面并上全角写法（「> · 》 」，Rei 2026-11-21 15:53）。
 * 手机上没有 ⌘?：格式栏最右边的 info 按钮打开同一个浮层，这时只列写法，不列快捷键（shortcutRows({ touch: true })）。
 */
import { getLocale, tr, trc } from '../../lib/i18n';
import { detectPlatform, type NavigatorLike } from '../../skin/platform';

/** 一下按键：修饰键 + 主键。 */
/** ctrl：所有系统都是 Ctrl（Mac 上显示 ⌃），不跟着换成 ⌘。move：移动行用的键，Mac 是 ⌥，别的系统是 Ctrl（Rei 2026-11-20）。 */
type Mod = 'mod' | 'ctrl' | 'alt' | 'shift' | 'move';
export type Chord = (Mod | string)[];

export interface ShortcutRow {
  label: string;
  /** 手打的写法（等宽显示）；没有写法的是 null。 */
  md: string | null;
  /**
   * 全角写法（Rei 2026-11-21 方案 B，规则见 extensions.ts、details.ts）：中文输入法不用切英文就能打的那种，浮层里并在半角后面。
   * 只有界面是中文时才给（showFullWidth），别的语言是 undefined。
   */
  fw?: string;
  /** 快捷键：一下或接连几下（⌘U 然后 1）；没有快捷键是空。 */
  keys: Chord[];
}

/** 这台设备用 ⌘ 还是 Ctrl。 */
export function isAppleKeyboard(nav: NavigatorLike | undefined = typeof navigator === 'undefined' ? undefined : (navigator as NavigatorLike)): boolean {
  if (!nav) return false;
  const p = detectPlatform(nav);
  return p === 'macos' || p === 'ios';
}

const MAC: Record<Mod, string> = { mod: '⌘', ctrl: '⌃', alt: '⌥', shift: '⇧', move: '⌥' };
const PC: Record<Mod, string> = { mod: 'Ctrl', ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', move: 'Ctrl' };
const isMod = (k: string): k is Mod => k === 'mod' || k === 'ctrl' || k === 'alt' || k === 'shift' || k === 'move';

/** 一下按键写成文字：Mac「⌘⌥X」，别的「Ctrl+Alt+X」。回车 Mac 写 ↩，别的写 Enter。 */
export function formatChord(chord: Chord, mac: boolean): string {
  const names = chord.map((k) => (isMod(k) ? (mac ? MAC : PC)[k] : k === 'Enter' ? (mac ? '↩' : 'Enter') : k));
  return mac ? names.join('') : names.join('+');
}

/** ⌘ / Ctrl 的显示（说明文字里用）。 */
export const modName = (mac: boolean) => (mac ? '⌘' : 'Ctrl');

/** 界面是中文才显示全角写法（Rei 2026-11-21 15:53，代定：外语用户多半不用中文输入法）。 */
export const showFullWidth = (locale: string = getLocale()) => locale === 'zh';

/** 半角写法 → 全角写法，和 c51d87c 的五条全角规则一一对应。 */
const FULL_WIDTH: Record<string, string> = {
  '> ': '》 ', // i18n-ignore：写法本身，不翻
  '>> ': '》》 ', // i18n-ignore：写法本身，不翻
  '[] ': '【】 ', // i18n-ignore：写法本身，不翻
  '1. ': '1。 ', // i18n-ignore：写法本身，不翻
  '```': '··· ',
};

/**
 * 浮层里的行（每次取：换语言后文字跟着变）。
 * touch：从手机格式栏的 info 按钮打开（Rei 2026-11-21 15:55）——只留有写法的行，快捷键清空（触屏没有 ⌘ / Ctrl）。
 */
export function shortcutRows(opts: { touch?: boolean; locale?: string } = {}): ShortcutRow[] {
  const rows = baseRows();
  const fw = showFullWidth(opts.locale);
  return rows
    .filter((r) => !opts.touch || r.md)
    .map((r) => ({
      ...r,
      ...(fw && r.md && FULL_WIDTH[r.md] ? { fw: FULL_WIDTH[r.md] } : {}),
      ...(opts.touch ? { keys: [] } : {}),
    }));
}

function baseRows(): ShortcutRow[] {
  const text = trc('格式', '文字');
  return [
    { label: trc('格式', '粗体'), md: `**${text}**`, keys: [['mod', 'B']] },
    { label: trc('格式', '斜体'), md: `*${text}*`, keys: [['mod', 'I']] },
    { label: trc('格式', '下划线'), md: null, keys: [['mod', 'U']] },
    { label: trc('格式', '波浪线'), md: null, keys: [['mod', 'U'], ['1']] },
    { label: trc('格式', '双线'), md: null, keys: [['mod', 'U'], ['2']] },
    { label: trc('格式', '删除线'), md: `~~${text}~~`, keys: [['mod', 'alt', 'X']] },
    // Rei 2026-11-20：==文字== 黄色高亮，⌘⇧H 切换；换颜色点高亮（highlight.ts）
    { label: trc('格式', '高亮'), md: `==${text}==`, keys: [['mod', 'shift', 'H']] },
    { label: trc('格式', '行内代码'), md: `\`${trc('格式', '代码')}\``, keys: [['mod', 'E']] },
    { label: trc('格式', '链接'), md: `[${text}](${trc('格式', '网址')})`, keys: [['mod', 'K']] },
    { label: trc('格式', '标题'), md: '# ', keys: [['mod', 'alt', '1–6']] },
    { label: trc('格式', '列表'), md: '- ', keys: [['mod', 'alt', '8']] },
    { label: trc('格式', '编号列表'), md: '1. ', keys: [['mod', 'alt', '7']] },
    { label: trc('格式', '清单'), md: '[] ', keys: [] },
    { label: trc('格式', '引用'), md: '> ', keys: [['mod', 'shift', 'B']] },
    { label: trc('格式', '代码块'), md: '```', keys: [['mod', 'alt', 'C']] },
    { label: trc('格式', '分隔线'), md: '---', keys: [] },
    { label: trc('格式', '表格'), md: '|3x2| ', keys: [] },
    { label: trc('格式', '折叠块'), md: '>> ', keys: [] },
    { label: trc('格式', '公式'), md: '$x^2$', keys: [] },
    { label: trc('格式', '换行'), md: null, keys: [['shift', 'Enter']] },
    // Rei 2026-11-20：上下移动当前行，Mac ⌥↑↓（12:36 改），别的系统 Ctrl+↑↓（见 move-block.ts）
    { label: trc('格式', '上下移动这一行'), md: null, keys: [['move', '↑↓']] },
  ];
}

/** 浮层的标题和底下几行说明。 */
export const shortcutTexts = (mac: boolean) => ({
  title: tr('写法和快捷键'),
  /** 任务正文才显示（第一行纯文字，Rei 2026-11-03）。 */
  title1: tr('第一行是标题，只能是纯文字'),
  combo: tr('波浪线、双线：按住 {mod}，先按 U，再按 1 或 2；同样再按一遍就去掉。', { mod: modName(mac) }),
  /** 高亮换颜色（Rei 2026-11-20 12:16「高亮的点击直接切换颜色就好」）。 */
  highlight: tr('点一下高亮，可以换颜色或去掉。'),
  /** ⌘K 读剪贴板（Rei 2026-11-04）。 */
  clipLink: tr('{keys} 加链接时，剪贴板里的链接会自动填上。', { keys: formatChord(['mod', 'K'], mac) }),
  /** 能打 @ 的编辑器才显示（任务正文、日记，Rei 2026-11-10）。 */
  mention: tr('打 @ 提到一件任务，点它就打开那件任务。'),
  close: tr('{keys} 或 Esc 关闭', { keys: formatChord(['mod', '?'], mac) }),
  /** 从手机格式栏打开时的关闭说明（触屏没有 ⌘?、Esc）。 */
  closeTouch: tr('点任意处关闭'),
});

/** 键盘事件是不是开关浮层：⌘? 就是 ⌘⇧/，也认 ⌘/（不带 ⌥）。 */
export function isHelpShortcut(e: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey' | 'key' | 'code'>): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return false;
  return e.key === '?' || e.key === '/' || e.code === 'Slash';
}
