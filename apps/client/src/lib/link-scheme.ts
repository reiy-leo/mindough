/**
 * 链接的协议（scheme）：哪些能点、哪些不收。
 * Rei 2026-11-03「codex://threads/… 这种 deeplink 点了没反应」：以前只认 http(s) / mailto / tel，
 * 别的 App 的链接（codex://、obsidian://、vscode://、things:///、zotero://…）一律不打开。
 * 现在：任何像样的协议都放行，只挡下面这几类——
 * - 能跑脚本或塞内容的：javascript: vbscript: data:
 * - 读本机文件、浏览器内部页面的：file: blob: filesystem: about: view-source: chrome: chrome-extension: resource: jar:
 * - 本 App 自己 WebView 用的：tauri: asset: ipc:
 * 编辑器（读入、手打、链接框）、只读显示（marked + DOMPurify）、点开（external.ts）都用这一份。
 */

/** 不收的协议（小写、不带冒号）。 */
export const BLOCKED_SCHEMES: ReadonlySet<string> = new Set([
  'javascript',
  'vbscript',
  'data',
  'file',
  'blob',
  'filesystem',
  'about',
  'view-source',
  'chrome',
  'chrome-extension',
  'resource',
  'jar',
  'tauri',
  'asset',
  'ipc',
]);

/** 协议：字母开头，后面字母数字 + . -，至少两个字（单个字母是 Windows 盘符 C:\…）。 */
const SCHEME_RE = /^\s*([a-z][a-z0-9+.-]{1,31}):/i;

/** href 的协议（小写，不带冒号）；没有协议（相对地址、#/…、example.com）返回 null。「example.com:8080」这种主机加端口不算协议。 */
export function schemeOf(href: string | null | undefined): string | null {
  if (!href) return null;
  const m = SCHEME_RE.exec(href);
  if (!m) return null;
  const rest = href.trim().slice(m[0].trim().length);
  // localhost:3000、a.com:8080/x：冒号后面直接是端口号
  if (/^\d+(?:[/?#]|$)/.test(rest)) return null;
  return m[1]!.toLowerCase();
}

/** 这个协议挡不挡（javascript: 之类）。大小写、前后空白、中间夹的控制字符都不影响判断。 */
export function isBlockedHref(href: string | null | undefined): boolean {
  if (!href) return false;
  // 浏览器解析时会去掉制表符、换行（java\nscript: 也是 javascript:），这里也先去掉
  const s = schemeOf(href.replace(/[\u0000-\u001f\u007f]/g, ''));
  return s !== null && BLOCKED_SCHEMES.has(s);
}

/** 别的 App 的链接：有协议、不是 http(s)、不在挡的名单里（mailto: tel: codex: obsidian: …）。 */
export function isAppSchemeHref(href: string | null | undefined): boolean {
  const s = schemeOf(href);
  return s !== null && s !== 'http' && s !== 'https' && !BLOCKED_SCHEMES.has(s);
}

/** 协议后面得有东西（「codex:」「mailto:」光一个协议不算链接）。 */
export function hasSchemeBody(href: string): boolean {
  const s = schemeOf(href);
  if (!s) return false;
  return href.trim().length > s.length + 1;
}

/**
 * 正文里的裸链接「scheme://…」（GFM 只认 http(s) / www，别的协议它不管，这里补上）。
 * 要求带 //，免得「备注:内容」「note:xx」这种普通文字被当成链接。末尾的标点不算链接。
 * 中文标点（，。、）】「」等）到此为止，链接后面直接接中文句子也不会连进去。
 * 前面不能紧贴字母数字（「xcodex://」不认）。g 标志，用前把 lastIndex 归零。
 */
export const BARE_SCHEME_URL_RE = /(?<![\w+.-])([a-z][a-z0-9+.-]{1,31}):\/\/[^\s<>，。；：！？、）】「」『』《》]*[^\s<>.,;:!?'"）)\]】，。；：！？、「」『』《》]/gi;

/** 文字里找出裸的 App 链接（不含 http(s)、不含挡掉的协议）：[{ start, end, url }]。 */
export function findBareAppLinks(text: string): { start: number; end: number; url: string }[] {
  const out: { start: number; end: number; url: string }[] = [];
  BARE_SCHEME_URL_RE.lastIndex = 0;
  for (let m = BARE_SCHEME_URL_RE.exec(text); m; m = BARE_SCHEME_URL_RE.exec(text)) {
    const url = m[0];
    if (!isAppSchemeHref(url)) continue;
    // 只有「scheme://」没有内容的不算
    if (url.length <= m[1]!.length + 3) continue;
    out.push({ start: m.index, end: m.index + url.length, url });
  }
  return out;
}

/**
 * 给 DOMPurify 用的 ALLOWED_URI_REGEXP：在它默认的基础上（http(s) mailto tel 等、相对地址），
 * 再放行所有不在挡的名单里的协议。DOMPurify 判断前会先去掉空白和控制字符。
 */
export const SANITIZE_URI_RE = new RegExp(
  `^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\\-]+(?:[^a-z+.\\-:]|$)|(?!(?:${[...BLOCKED_SCHEMES]
    .map((s) => s.replace(/[-.]/g, '\\$&'))
    .join('|')}):)[a-z][a-z0-9+.\\-]{1,31}:)`,
  'i',
);
