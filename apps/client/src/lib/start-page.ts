/**
 * 启动时打开哪一页（Rei 2026-11-13「设置里加"系统"选项卡」，设置 → 系统 →「启动时打开」）。
 * - 选项是侧栏各页：我的一天（默认）、等待安排、过期积压、日历、项目、打卡、倒数日、日记、资料库、类型、已完成，外加「上次打开的页面」。
 * - 只记在本机（Settings.startPage），不同步：手机和电脑常想停在不同的页。
 * - 只管「冷启动、地址里没有页面」那一次：桌面 / 手机 App 打开、网页敲根地址。
 *   地址里已经有页面（网页刷新、#/… 链接）就照地址走；mindough:// 深链在启动后才到，到了照常跳过去，所以深链也优先。
 * - 「上次打开的页面」：主窗口每换一页记一次路径（不带 ?task= 这类参数）；设置、搜索、「更多」和做事的链接（#/task/…、#/new?…）不记，
 *   日记不记哪天（回到日记首页 = 今天）。还没记过就是我的一天。
 */
import { parseHashLink } from './deeplink';
import { href, parseHash, type Route } from './router';

export const START_PAGES = ['myday', 'backlog', 'doable', 'agenda', 'groups', 'checkin', 'countdown', 'journal', 'library', 'types', 'done', 'last'] as const;
export type StartPage = (typeof START_PAGES)[number];
export const START_PAGE_DEFAULT: StartPage = 'myday';

/** 存的值认不出来（老数据、手改）就当我的一天。 */
export function normalizeStartPage(v: unknown): StartPage {
  return typeof v === 'string' && (START_PAGES as readonly string[]).includes(v) ? (v as StartPage) : START_PAGE_DEFAULT;
}

const SETTINGS_KEY = 'mindough:settings';
export const LAST_PAGE_KEY = 'mindough:last-page';

/** 地址里有没有指定页面：#、#/ 都算没有。 */
export function hasPageInHash(hash: string): boolean {
  const h = hash.replace(/^#/, '');
  const path = h.split('?')[0] ?? '';
  return path !== '' && path !== '/';
}

/** 这一页值得记成「上次打开的页面」吗；值得就给出要存的 hash（统一写法，不带参数）。 */
export function lastPageHash(hash: string): string | null {
  if (!hasPageInHash(hash)) return null;
  if (parseHashLink(hash)) return null; // #/task/…、#/new?…、#/checkin-now/… 是做事的链接
  const route = parseHash(hash);
  if (route.page === 'settings' || route.page === 'search' || route.page === 'more') return null;
  const r: Route = route.page === 'journal' ? { page: 'journal' } : route;
  return href(r);
}

/** 启动时该去的 hash；null = 不动（地址里已经有页面，或者就是我的一天）。 */
export function startHash(hash: string, pref: StartPage, last: string | null): string | null {
  if (hasPageInHash(hash)) return null;
  if (pref === 'last') {
    const h = last ? lastPageHash(last) : null;
    return h && h !== '#/myday' ? h : null;
  }
  if (pref === 'myday') return null;
  return href({ page: pref } as Route);
}

function readPref(): StartPage {
  try {
    return normalizeStartPage((JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as { startPage?: unknown }).startPage);
  } catch {
    return START_PAGE_DEFAULT;
  }
}

/**
 * 主窗口启动时、渲染之前调一次：地址里没页面就换成选的那页（replaceState，不多一条历史，也不触发 hashchange）。
 * 然后开始记「上次打开的页面」。设置窗口不调。
 */
export function installStartPage(): void {
  try {
    const target = startHash(location.hash, readPref(), localStorage.getItem(LAST_PAGE_KEY));
    if (target) history.replaceState(history.state, '', `${location.pathname}${location.search}${target}`);
  } catch {
    /* 读不到本机设置就照默认 */
  }
  const remember = () => {
    const h = lastPageHash(location.hash);
    if (!h) return;
    try {
      localStorage.setItem(LAST_PAGE_KEY, h);
    } catch {
      /* 存不下不要紧 */
    }
  };
  remember();
  window.addEventListener('hashchange', remember);
}
