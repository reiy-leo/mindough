/**
 * 编辑器的「写法和快捷键」浮层（Rei 2026-11-03「cmd+?弹出markdown键盘快捷键tooltip」）。
 * ⌘? / ⌘/（Windows / Linux 是 Ctrl）开关，Esc 关。只列编辑器真的支持的写法和快捷键（见 extensions.ts、underline.ts）。
 * Mac（和 iPad 外接键盘）显示 ⌘ ⌥ ⇧，别的系统显示 Ctrl+Alt+Shift。
 */
import { tr, trc } from '../../lib/i18n';
import { detectPlatform, type NavigatorLike } from '../../skin/platform';

/** 一下按键：修饰键 + 主键。 */
type Mod = 'mod' | 'alt' | 'shift';
export type Chord = (Mod | string)[];

export interface ShortcutRow {
  label: string;
  /** 手打的写法（等宽显示）；没有写法的是 null。 */
  md: string | null;
  /** 快捷键：一下或接连几下（⌘U 然后 1）；没有快捷键是空。 */
  keys: Chord[];
}

/** 这台设备用 ⌘ 还是 Ctrl。 */
export function isAppleKeyboard(nav: NavigatorLike | undefined = typeof navigator === 'undefined' ? undefined : (navigator as NavigatorLike)): boolean {
  if (!nav) return false;
  const p = detectPlatform(nav);
  return p === 'macos' || p === 'ios';
}

const MAC: Record<Mod, string> = { mod: '⌘', alt: '⌥', shift: '⇧' };
const PC: Record<Mod, string> = { mod: 'Ctrl', alt: 'Alt', shift: 'Shift' };
const isMod = (k: string): k is Mod => k === 'mod' || k === 'alt' || k === 'shift';

/** 一下按键写成文字：Mac「⌘⌥X」，别的「Ctrl+Alt+X」。回车 Mac 写 ↩，别的写 Enter。 */
export function formatChord(chord: Chord, mac: boolean): string {
  const names = chord.map((k) => (isMod(k) ? (mac ? MAC : PC)[k] : k === 'Enter' ? (mac ? '↩' : 'Enter') : k));
  return mac ? names.join('') : names.join('+');
}

/** ⌘ / Ctrl 的显示（说明文字里用）。 */
export const modName = (mac: boolean) => (mac ? '⌘' : 'Ctrl');

/** 浮层里的行（每次取：换语言后文字跟着变）。 */
export function shortcutRows(): ShortcutRow[] {
  const text = trc('格式', '文字');
  return [
    { label: trc('格式', '粗体'), md: `**${text}**`, keys: [['mod', 'B']] },
    { label: trc('格式', '斜体'), md: `*${text}*`, keys: [['mod', 'I']] },
    { label: trc('格式', '下划线'), md: null, keys: [['mod', 'U']] },
    { label: trc('格式', '波浪线'), md: null, keys: [['mod', 'U'], ['1']] },
    { label: trc('格式', '双线'), md: null, keys: [['mod', 'U'], ['2']] },
    { label: trc('格式', '删除线'), md: `~~${text}~~`, keys: [['mod', 'alt', 'X']] },
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
  ];
}

/** 浮层的标题和底下几行说明。 */
export const shortcutTexts = (mac: boolean) => ({
  title: tr('写法和快捷键'),
  /** 任务正文才显示（第一行纯文字，Rei 2026-11-03）。 */
  title1: tr('第一行是标题，只能是纯文字'),
  combo: tr('波浪线、双线：按住 {mod}，先按 U，再按 1 或 2；同样再按一遍就去掉。', { mod: modName(mac) }),
  /** ⌘K 读剪贴板（Rei 2026-11-04）。 */
  clipLink: tr('{keys} 加链接时，剪贴板里的链接会自动填上。', { keys: formatChord(['mod', 'K'], mac) }),
  /** 能打 @ 的编辑器才显示（任务正文、日记，Rei 2026-11-10）。 */
  mention: tr('打 @ 提到一件任务，点它就打开那件任务。'),
  close: tr('{keys} 或 Esc 关闭', { keys: formatChord(['mod', '?'], mac) }),
});

/** 键盘事件是不是开关浮层：⌘? 就是 ⌘⇧/，也认 ⌘/（不带 ⌥）。 */
export function isHelpShortcut(e: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey' | 'key' | 'code'>): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return false;
  return e.key === '?' || e.key === '/' || e.code === 'Slash';
}
