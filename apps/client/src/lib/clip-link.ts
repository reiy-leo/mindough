/**
 * ⌘K 加链接时顺手读剪贴板（Rei 2026-11-04「选中文本后，cmd+k后自动添加剪贴板中的链接到链接input中」）。
 *
 * - 剪贴板里是一条链接，就填进链接框的「链接」一栏并全选，回车就保存；不是链接、读不到就留空，和以前一样。
 * - 算链接的：http(s)、mailto:、tel:、www. 开头（补 https://），还有 link-scheme 放行的别的 App 的链接（codex:// …）。
 *   别的 App 的链接要带 //（mailto: tel: sms: 这几个除外）。javascript: 这类挡掉的协议照旧不收。先去掉首尾空白；中间有空白、换行的是一段话，不算。
 * - 怎么读：
 *   - 桌面 App（Tauri）：clipboard-manager 插件的 readText（capabilities 里给了 clipboard-manager:allow-read-text）。
 *   - 手机 App：不读。
 *   - 网页：navigator.clipboard.readText()。clipboard-read 已授权就直接读；Chromium 没授权会弹授权框，
 *     Safari 会弹「粘贴」小气泡，Firefox 出「粘贴」菜单——都是异步的：链接框先开，读到了再填。拒了、出错就留空。
 *     权限明确是 denied 的就不去问了。
 * 判断逻辑是纯函数 clipLink，测试在 clip-link.test.ts。
 */
import { isTauri } from '../store/sqlite-tauri';
import { OPAQUE_SCHEMES, hasSchemeBody, isAppSchemeHref, isBlockedHref, opaqueSchemeOf, schemeOf } from './link-scheme';

/** 太长的不当链接（多半是整段内容）。 */
const MAX_LEN = 2048;

/** 剪贴板文字是不是一条链接；是就返回填进框里的样子（www. 补 https://），不是返回 null。 */
export function clipLink(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t || t.length > MAX_LEN) return null;
  // 中间有空白（空格、换行、制表符、全角空格）= 一段话，不是一条链接
  if (/\s/.test(t)) return null;
  if (/[\u0000-\u001f\u007f]/.test(t)) return null;
  if (isBlockedHref(t)) return null;
  const url = /^www\./i.test(t) ? `https://${t}` : t;
  // tel:10086 这种：schemeOf 会当成「主机:端口」，这几个协议先认
  if (opaqueSchemeOf(url)) return url;
  const s = schemeOf(url);
  if (!s) return null; // 「example.com」「#/x」「备注」这种不算
  if (s === 'http' || s === 'https') {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    if (!/^\/\//.test(url.slice(s.length + 1))) return null; // 「http:foo」不算
    const host = u.hostname;
    if (!host || !(host.includes('.') || host === 'localhost' || /^\[.*\]$/.test(host))) return null;
    if (/^\.|\.$|\.\./.test(host)) return null;
    return url;
  }
  if (!isAppSchemeHref(url) || !hasSchemeBody(url)) return null;
  // 别的 App 的链接要带 //（codex://…），免得「note:xx」「备注:内容」这种普通文字被当成链接；mailto: tel: 这几个本来就不带
  if (!OPAQUE_SCHEMES.has(s) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return null;
  // 只有「codex://」「mailto:」没有内容的不算
  if (/^[a-z][a-z0-9+.-]*:\/*$/i.test(url)) return null;
  return url;
}

interface NavLike {
  userAgent?: string;
  clipboard?: { readText?: () => Promise<string> };
  permissions?: { query?: (d: { name: string }) => Promise<{ state: string }> };
}

export type ClipTextEnv = 'desktop' | 'web' | 'none';

/** 这一端怎么读剪贴板文字。 */
export function clipTextEnv(o: { tauri: boolean; mobileOs: boolean; readText: boolean }): ClipTextEnv {
  if (o.tauri) return o.mobileOs ? 'none' : 'desktop';
  return o.readText ? 'web' : 'none';
}

const mobileUa = (ua: string | undefined) => !!ua && /android|iphone|ipad|ipod/i.test(ua);

/** 读剪贴板里的文字；不支持、没授权、出错都返回 null，不抛。 */
export async function readClipboardText(): Promise<string | null> {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as unknown as NavLike;
  const env = clipTextEnv({ tauri: isTauri(), mobileOs: mobileUa(nav.userAgent), readText: typeof nav.clipboard?.readText === 'function' });
  try {
    if (env === 'desktop') {
      const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
      return await readText();
    }
    if (env === 'web') {
      // 明确拒过就不再问；问不了（Firefox、Safari 不认 clipboard-read）照样去读，浏览器自己弹「粘贴」
      try {
        const st = await nav.permissions?.query?.({ name: 'clipboard-read' });
        if (st?.state === 'denied') return null;
      } catch {
        /* 不认这个权限名 */
      }
      return await nav.clipboard!.readText!();
    }
  } catch {
    /* 拒了、剪贴板里不是文字、插件没权限 */
  }
  return null;
}

/** 读剪贴板，是链接就返回规范好的链接。 */
export async function readClipboardLink(): Promise<string | null> {
  return clipLink(await readClipboardText());
}
