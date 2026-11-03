/**
 * 外链：桌面 / 手机 App（Tauri）里点链接一律交给系统浏览器（opener 插件），
 * 不在 app 自己的 WebView 里打开新窗口（那样没有地址栏、也回不来）。Web 端照常新标签页。
 *
 * 做法：document 上捕获阶段监听 click / auxclick，<a href> 指向别的源的 http(s)、或别的 App 的链接
 * （mailto: tel: codex:// obsidian:// …，见 link-scheme.ts）时拦下来交给 openUrl。
 * 这样 Markdown 渲染出来的链接、资料卡的小标签、编辑器里的链接都不用各自处理。
 *
 * 别的 App 的链接（Rei 2026-11-03「codex://threads/… 这种 deeplink 点了没反应」）：
 * - App 里：一样交给 opener（capabilities 里放行了这些协议），由系统交给对应的 App；
 * - Web：window.open 打不开自定义协议（要么没反应，要么留一个空白新标签页），
 *   改成临时建一个不带 target 的 <a> 点一下，浏览器会问「要打开 xxx 吗」，当前页不动。
 */
import { isTauri } from '../store/sqlite-tauri';
import { isAppSchemeHref, isBlockedHref } from './link-scheme';

/** 这个链接该不该交给系统：别的源的 http(s)，或别的 App 的链接（mailto / tel / codex:// …）。同源的 #/ 路由、javascript: 之类不算。 */
export function externalHref(href: string | null | undefined, origin: string): string | null {
  if (!href || isBlockedHref(href)) return null;
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }
  const scheme = url.protocol.slice(0, -1);
  if (scheme === 'http' || scheme === 'https') return url.origin === origin ? null : url.href;
  if (!isAppSchemeHref(url.href)) return null;
  // 自定义协议：URL 会把 codex://a/b 照原样留着；只有协议没有内容的不算
  return url.href.length > scheme.length + 1 ? url.href : null;
}

/** 打开的方式：http(s) 在 Web 端开新标签页；别的 App 的链接在 Web 端就地交给浏览器（不开空白标签）；App 里都交给系统。 */
export function openMode(url: string, tauri: boolean): 'opener' | 'tab' | 'handoff' {
  if (tauri) return 'opener';
  return isAppSchemeHref(url) ? 'handoff' : 'tab';
}

/** 在系统浏览器 / 对应的 App（App 里）或新标签页（Web）打开。url 要先过 externalHref。 */
export async function openExternal(url: string): Promise<void> {
  const mode = openMode(url, isTauri());
  if (mode === 'opener') {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  }
  if (mode === 'handoff') return handOff(url);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Web 端把 codex:// 之类交给浏览器：建一个 <a> 点一下（同步，在用户这次点击里完成，浏览器才会弹「打开 xxx」）。 */
function handOff(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  // 自己这个 click 不再被下面的拦截器处理
  a.dataset.handoff = '1';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

let installed = false;

/**
 * App 里：拦下所有外链点击交给系统。
 * Web 里：只拦别的 App 的链接（带 target=_blank 的 codex:// 会留一个空白新标签页），http(s) 照浏览器自己的来。
 */
export function installExternalLinks(): void {
  if (installed) return;
  installed = true;
  const tauri = isTauri();
  const handler = (e: MouseEvent) => {
    if (e.defaultPrevented) return;
    if (e.type === 'auxclick' && e.button !== 1) return;
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || a.dataset.handoff) return;
    if (!tauri && !isAppSchemeHref(a.getAttribute('href'))) return;
    // 编辑器里的链接由编辑器自己打开（点一下就打开，Rei 2026-10-17），这里不管，免得开两次
    if (a.closest('[contenteditable="true"]')) return;
    const url = externalHref(a.getAttribute('href'), window.location.origin);
    if (!url) return;
    e.preventDefault();
    void openExternal(url).catch((err) => console.error('打开链接失败', err));
  };
  document.addEventListener('click', handler, true);
  document.addEventListener('auxclick', handler, true);
}
