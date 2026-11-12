import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DateDisplay, MonthMarker } from '@mindough/core';
import { applyMaterialClass, syncWindowMaterial } from './vibrancy';
import { detectPlatform, layoutForWidth, MAC_OVERLAY_CLASS, resolveSkin, usesMacOverlayTitlebar, type LayoutKind, type Platform, type Skin, type SkinPref, type ThemePref } from '../skin/platform';

import { tr } from './i18n';
import type { StartPage } from './start-page';
import type { ToastPosition } from './toast-position';
import { onRelay, relay } from './window-relay';
import { isTauri } from '../store/sqlite-tauri';
export interface Settings {
  skin: SkinPref;
  theme: ThemePref;
  layout: 'auto' | LayoutKind;
  monthMarker: 'auto' | MonthMarker;
  /** 详情「关系」显示任务链（Rei 2026-10-23）：只记在本机，不同步；换一件任务也沿用。 */
  taskChain: boolean;
  /**
   * 中国农历（Rei 2026-10-25「日期部分，只有在设置中打开中国农历 switch 才显示」）：只记在本机，不同步，默认关。
   * 只在中文界面（简 / 繁）起作用，判断一律经 lib/lunar 的 useLunarUi()（core lunarUiVisible）。
   */
  chineseLunar: boolean;
  /**
   * 显示节假日（Rei 2026-11-10 定：和农历开关拆开，节假日默认开、农历仍默认关）：「休」「班」角标和放假的节日名，
   * 数据来自节假日订阅（lib/lunar.ts）。只记在本机，不同步。不分界面语言。
   */
  holidays: boolean;
  /**
   * 日历页的视图（docs/CALENDAR.md）：core CalView。2026-11-13 起改存同步的偏好 calendar.view / view_days / view_weeks（lib/calendar-view），
   * 这里的老值只用来迁移：账户里还没有时当初始值写上去，没登录时读它。不再写。
   */
  calendarView: unknown;
  /**
   * 打卡页哪几张卡片展开了活动图（Rei 2026-10-25「check-ins 中的任务活动图，不要显示在列表中，而是左上角一个圆点，toggle 全宽显示活动图」）：
   * 存打卡任务的 id，只记在本机，不同步，默认都收起。读写经 lib/habit-heatmap。
   */
  habitHeatmapOpen: string[];
  /**
   * 每个项目选的视图和排序（Rei 2026-10-26「每个项目的视图支持列表、看板、时间轴」）：项目 id → 视图 / 排序 / 正倒序 / 时间轴缩放。
   * 只记在本机，不同步，不改项目的数据结构。读写经 lib/project-view 的 normalizePrefs（认不出的值、以前的关系图都回落成列表）。
   */
  projectViews: Record<string, unknown>;
  /**
   * 任务日期怎么显示（Rei 2026-10-26）：自动 / 相对时间 / 年月日 / 年月日+时区。只记在本机，不同步，默认自动（和以前一样）。
   * 读经 lib/date-display 的 useDateDisplay()，写在设置 → 任务。
   */
  dateDisplay: DateDisplay;
  /**
   * 我的一天显示「建议」（Rei 2026-11-01「我的一天中的建议，可以toggle on/off」）：默认开。只记在本机，不同步（和日期显示、任务链一样）。
   * 关掉后建议那段不显示，也不算建议。读经 lib/myday-suggest 的 suggestionsOn()，写在设置 → 任务，或建议那段标题右边的「…」→「隐藏建议」。
   */
  myDaySuggestions: boolean;
  /**
   * 我的一天新建的任务默认日期是今天（Rei 2026-11-09 03:49「设置 - 任务 - 我的一天中，添加"默认日期：今天" switch，on 则我的一天中新建任务自动添加目标日期今天」）：
   * 默认关（Rei 没说，按以前的行为）。和「显示建议」「严格模式」一样只记在本机，不同步。管我的一天的添加框（lib/quick-add createToday）和我的一天页按 N（App newTaskDefaults）。
   */
  myDayDefaultToday: boolean;
  /** 我的一天「已完成」那段展开着吗（Rei 2026-11-08 分两段）：默认展开，只记在本机。 */
  myDayDoneOpen: boolean;
  /**
   * 打卡页顶部显示活动图吗（Rei 2026-11-10 08:30「设置里新增「打卡」选项卡，里面一个开关「在打卡页顶部显示活动图」…默认关」）：
   * 管打卡页最上面那张「过去一年」的总图。默认关；和「默认日期：今天」一样只记在本机，不同步。每张打卡卡片左上角的活动图开关（habitHeatmapOpen）不归它管。
   */
  checkInsYearHeatmap: boolean;
  /** 打卡页「已打卡」那段展开着吗（Rei 2026-11-09「今天打卡完成的放在已打卡section」）：默认展开，只记在本机。 */
  checkInsDoneOpen: boolean;
  /**
   * 严格模式（Rei 2026-11-08「设置-任务中，添加严格模式switch，严格模式开启后完成的任务不能修改」）：默认关。
   * 和同一页的「显示建议」「日期显示」一样只记在本机，不同步。打开后告诉 Store（store.strictDone），界面经 lib/strict 的 useLocked()。
   */
  strictMode: boolean;
  /**
   * 别的列表页的分区 / 排序（Rei 2026-11-08「我的一天、项目中 右上角功能区添加一个分区」「所有列表支持不分区」）：
   * 页名（myday / doable）→ { section, sort, collapsed }；已完成 2026-11-12 起固定按日期、不再存（旧的 done 键留着不读）。只记在本机，不同步（同 projectViews）。读写经 lib/list-views。
   */
  listViews: Record<string, unknown>;
  /**
   * 色彩（Rei 2026-11-09「设置 → 外观 → 色彩」）：素净 plain / 标准 standard / 多彩 vivid，默认标准。
   * 只记在本机，不同步（同严格模式）。挂在 <html data-color-level>，样式在 styles/color-level.css，读经 lib/color-level 的 useColorLevel()。
   */
  colorLevel: ColorLevel;
  /**
   * 侧栏里放进来的项目怎么显示（Rei 2026-11-11）：列表 list（图标 + 名字一行一个，默认）/ 图标 icons（只放项目图标，按行排、放不下折行）。
   * 只记在本机，不同步。入口是侧栏「项目」那行和手机「更多」页「项目」那行右边的 ···（components/PinnedStyleMenu）。读写经 lib/pinned-style。
   */
  pinnedGroupStyle: 'list' | 'icons';
  /**
   * 侧栏里放进来的资料库怎么显示（Rei 2026-11-12 00:24，照项目那串做）：列表 list（默认）/ 图标 icons。和 pinnedGroupStyle 各管各的。
   * 只记在本机，不同步。入口是侧栏「资料库」那行和手机「更多」页「资料库」那行右边的 ···（components/PinnedStyleMenu kind="library"）。读写经 lib/pinned-style。
   */
  pinnedLibraryStyle: 'list' | 'icons';
  /**
   * 类型页（侧栏「管理 → 类型」）每个大类下的类型怎么显示（Rei 2026-11-11 08:33）：列表 list（默认）/ 图标 icons（图标格子，名字在图标下）。
   * 只记在本机，不同步；所有分组一起切。入口是类型页页头右边的 ···（components/PinnedStyleMenu 的 DisplayStyleMenu）。读写经 lib/category-view。
   */
  categoryViewStyle: 'list' | 'icons';
  /**
   * 启动时打开哪一页（Rei 2026-11-13，设置 → 系统）：侧栏各页或「上次打开的页面」，默认我的一天。
   * 只记在本机，不同步（手机和电脑常想停在不同的页）。读写经 lib/start-page（启动时在 main.tsx 里、渲染前读一次）。
   */
  startPage: StartPage;
  /**
   * 提示（toast）显示在哪儿（Rei 2026-11-13 06:16，设置 → 提醒 →「通知位置」）：顶部 / 底部 / 右上角 / 右下角，默认底部（和以前一样）。
   * 只记在本机，不同步（各台设备屏幕不一样）。手机布局右上 / 右下按顶部 / 底部居中。读写经 lib/toast-position。
   */
  toastPosition: ToastPosition;
}

export type ColorLevel = 'plain' | 'standard' | 'vivid';
export const COLOR_LEVELS: readonly ColorLevel[] = ['plain', 'standard', 'vivid'];
/** 存的值认不出来（老数据、手改）就当标准。 */
export function normalizeColorLevel(v: unknown): ColorLevel {
  return v === 'plain' || v === 'vivid' ? v : 'standard';
}

const DEFAULTS: Settings = { skin: 'auto', theme: 'system', layout: 'auto', monthMarker: 'auto', taskChain: false, chineseLunar: false, holidays: true, calendarView: null, habitHeatmapOpen: [], projectViews: {}, dateDisplay: 'auto', myDaySuggestions: true, myDayDefaultToday: false, myDayDoneOpen: true, checkInsDoneOpen: true, checkInsYearHeatmap: false, strictMode: false, listViews: {}, colorLevel: 'standard', pinnedGroupStyle: 'list', pinnedLibraryStyle: 'list', categoryViewStyle: 'list', startPage: 'myday', toastPosition: 'bottom' };
const KEY = 'mindough:settings';

/** 不经 React 读本机设置（迁移老设置用，如 lib/calendar-view）。 */
export const readLocalSettings = (): Settings => load();

function load(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

/** URL 参数可临时覆盖（截图 / 调试用）：?skin=winui&theme=dark&dates=ymd */
function urlOverrides(): Partial<Settings> {
  const p = new URLSearchParams(location.search);
  const out: Partial<Settings> = {};
  const skin = p.get('skin');
  if (skin === 'apple' || skin === 'winui' || skin === 'material') out.skin = skin;
  const theme = p.get('theme');
  if (theme === 'light' || theme === 'dark') out.theme = theme;
  const dates = p.get('dates');
  if (dates === 'auto' || dates === 'relative' || dates === 'ymd' || dates === 'ymd-tz') out.dateDisplay = dates;
  if (p.get('strict') === '1') out.strictMode = true;
  const color = p.get('color');
  if (color === 'plain' || color === 'standard' || color === 'vivid') out.colorLevel = color;
  return out;
}

interface SettingsCtx {
  settings: Settings;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  platform: Platform;
  skin: Skin;
  theme: 'light' | 'dark';
  layout: LayoutKind;
}

const Ctx = createContext<SettingsCtx | null>(null);

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

function useWidth(): number {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Settings>(load);
  const settings = useMemo(() => ({ ...stored, ...urlOverrides() }), [stored]);
  const [platform, setPlatform] = useState<Platform>(() => detectPlatform(navigator as Navigator & { userAgentData?: { platform?: string } }));
  // Tauri 端用 os 插件拿准确的平台（iPadOS 等 UA 不可靠的情况）
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    import('@tauri-apps/plugin-os')
      .then(({ platform: p }) => {
        const v = p();
        if (v === 'macos' || v === 'ios' || v === 'windows' || v === 'android' || v === 'linux') setPlatform(v);
      })
      .catch(() => {});
  }, []);
  const prefersDark = useMedia('(prefers-color-scheme: dark)');
  const width = useWidth();
  const skin = resolveSkin(settings.skin, platform);
  const theme = settings.theme === 'system' ? (prefersDark ? 'dark' : 'light') : settings.theme;
  const layout = settings.layout === 'auto' ? layoutForWidth(width) : settings.layout;

  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    // 先落到 localStorage 再通知别的窗口（它们收到就重新读）；以 localStorage 为准，别的窗口刚改的也不丢
    const next = { ...load(), [key]: value };
    localStorage.setItem(KEY, JSON.stringify(next));
    setStored(next);
    relay('settings');
  }, []);

  // 别的窗口（Tauri）或同一浏览器的别的标签页改了本机设置：重新读
  useEffect(() => {
    const reload = () => setStored(load());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) reload();
    };
    window.addEventListener('storage', onStorage);
    const off = onRelay('settings', reload);
    return () => {
      window.removeEventListener('storage', onStorage);
      off();
    };
  }, []);

  useEffect(() => {
    const el = document.documentElement;
    el.dataset.skin = skin;
    el.dataset.theme = theme;
    el.dataset.layout = layout;
    el.dataset.platform = platform;
    el.style.colorScheme = theme;
  }, [skin, theme, layout, platform]);
  // 色彩档位在渲染时直接挂（幂等）：子组件的 useLayoutEffect 读 CSS 变量（心情河流、日记热力图）比这里的 effect 早，得先挂好
  const colorLevel = normalizeColorLevel(settings.colorLevel);
  if (document.documentElement.dataset.colorLevel !== colorLevel) document.documentElement.dataset.colorLevel = colorLevel;
  // macOS 桌面端主窗口：没有系统标题栏，侧边栏顶到窗口最上、给红绿灯让位（样式见 skin/skins.css）
  useEffect(() => {
    document.documentElement.classList.toggle(MAC_OVERLAY_CLASS, usesMacOverlayTitlebar(platform, { tauri: isTauri() }));
  }, [platform]);

  // 桌面 app：窗口材质（macOS 侧边栏毛玻璃 / Windows 11 Mica，lib/vibrancy.ts）。界面手动选了深浅色时窗口也跟着换
  const themeOverride = settings.theme === 'system' ? null : theme;
  useEffect(() => {
    if (!isTauri()) return;
    let dead = false;
    void syncWindowMaterial(themeOverride).then((m) => {
      if (!dead) applyMaterialClass(document.documentElement, m);
    });
    return () => {
      dead = true;
    };
  }, [themeOverride]);

  const value = useMemo(() => ({ settings, set, platform, skin, theme, layout }), [settings, set, platform, skin, theme, layout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 只读色彩档位；没有 SettingsProvider（单测里单独渲染的组件）时当标准。 */
export function useColorLevelSetting(): ColorLevel {
  return normalizeColorLevel(useContext(Ctx)?.settings.colorLevel);
}

export function useSettings(): SettingsCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error(tr('SettingsProvider 缺失'));
  return v;
}
