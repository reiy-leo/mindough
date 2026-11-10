/**
 * 系统返回先关弹层（Rei 2026-11-10「安卓端用全屏手势返回时，全局搜索弹窗不关闭」）。
 *
 * 安卓 App 的返回怎么到前端（Tauri 2.12 的 AppPlugin.kt）：前端没注册 onBackButtonPress 时，
 * 返回手势 / 返回键 = WebView 能退就 webView.goBack()（同一页里的浏览记录，前端收到 popstate），退不了就交给系统（App 退到后台）。
 * 弹窗、菜单都是 React 状态，不进浏览记录，所以以前返回会越过弹窗：退回上一个页面 / 关掉任务详情，弹窗还开着；没有记录时直接退出 App。
 *
 * 做法：弹层（React Aria 的 ModalOverlay / Popover，渲染在 body 下面）一打开，就同地址进一条记录 { mdLayer }；
 * 返回退掉这条记录时（popstate），给最上面那层发一个 Esc，它自己按 Esc 的规矩关掉（同一套 onClose，不另写关闭逻辑）。
 * 弹层自己关了（点了关闭、点外面、选了一项），那条记录还在顶上就 history.back() 退掉，免得返回要多按一下。
 * 弹层里跳页面（搜索里点了任务 / 项目）时，记录顶上是这层的记录：router.navigate / ui.openEditor 看 onLayerEntry() 换掉它，不再叠一条。
 *
 * 只在手机布局或触屏上开（桌面鼠标不进记录，浏览器的后退照旧）。网页版手机浏览器的返回手势也走这条路。
 * 不需要改 MainActivity，也不注册 onBackButtonPress（注册了就得自己处理「退出 App」，系统默认的退到后台做不出来）。
 */

/** 记录里这一层的标记。 */
export interface LayerState {
  mdLayer: number;
}

export function isLayerState(s: unknown): s is LayerState {
  return !!s && typeof s === 'object' && typeof (s as { mdLayer?: unknown }).mdLayer === 'number';
}

/**
 * body 下开着的弹层，按叠放顺序（最上面的在最后）。返回的是收 Esc 的那个元素：
 * ModalOverlay 是 body 下的 div[data-rac]，Esc 挂在它里面的 Modal（第一个子元素）上；
 * Popover / 菜单是 body 下的一个容器 div，第一个子元素是 [data-rac] 的弹层本身。
 * 正在退场的（data-exiting）、提示气泡（role=tooltip）不算。
 */
export function openOverlays(body: Element): Element[] {
  const out: Element[] = [];
  for (const c of Array.from(body.children)) {
    const first = c.firstElementChild;
    if (!first || !first.hasAttribute('data-rac')) continue;
    if (!c.hasAttribute('data-rac') && !first.hasAttribute('data-trigger') && !first.hasAttribute('data-placement')) continue;
    if (first.getAttribute('role') === 'tooltip') continue;
    if (c.hasAttribute('data-exiting') || first.hasAttribute('data-exiting')) continue;
    out.push(first);
  }
  return out;
}

/** 给弹层发 Esc（React Aria 的 useOverlay 在弹层元素上听 Esc，关掉走它自己的 onClose）。 */
export function sendEscape(el: Element) {
  const init = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true } as KeyboardEventInit;
  el.dispatchEvent(new KeyboardEvent('keydown', init));
  el.dispatchEvent(new KeyboardEvent('keyup', init));
}

export interface BackLayersEnv {
  win: Window;
  /** 现在要不要管（手机布局或触屏）。 */
  enabled: () => boolean;
}

interface Layer {
  el: Element;
  seq: number;
}

export interface BackLayers {
  /** 重新对一遍：新开的弹层进记录，关掉的退记录。 */
  reconcile: () => void;
  dispose: () => void;
  /** 测试用 */
  layers: () => number;
}

/** 装上。返回值能拆掉（测试用）。 */
export function createBackLayers({ win, enabled }: BackLayersEnv): BackLayers {
  const doc = win.document;
  const MO = (win as Window & { MutationObserver: typeof MutationObserver }).MutationObserver;
  const hist = win.history;
  let layers: Layer[] = [];
  /** 被返回关掉、还在等它退场的弹层：别再给它进记录。 */
  const dismissed = new WeakSet<Element>();
  let seq = 0;
  /** 自己调的 history.back() 还没等到 popstate：这期间不进新记录（不然 back 会把新记录退掉）。 */
  let pendingBacks = 0;
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;

  const curSeq = () => (isLayerState(hist.state) ? hist.state.mdLayer : null);

  const back = (n: number) => {
    pendingBacks++;
    clearTimeout(pendingTimer);
    // 万一 popstate 一直不来（不该发生），别永远卡住
    pendingTimer = setTimeout(() => {
      pendingBacks = 0;
      reconcile();
    }, 800);
    hist.go(-n);
  };

  const reconcile = () => {
    const open = openOverlays(doc.body).filter((el) => !dismissed.has(el));
    // 关掉了的：它们的记录如果在最上面（上面没有还开着的层），一次退掉
    const closed = layers.filter((l) => !open.includes(l.el));
    if (closed.length) {
      layers = layers.filter((l) => open.includes(l.el));
      const cur = curSeq();
      const keepMax = Math.max(0, ...layers.map((l) => l.seq));
      const n = cur == null ? 0 : closed.filter((l) => l.seq > keepMax && l.seq <= cur).length;
      if (n > 0 && cur! > keepMax) back(n);
    }
    if (!enabled() || pendingBacks > 0) return;
    // 新开的：一层一条记录，地址不变
    for (const el of open) {
      if (layers.some((l) => l.el === el)) continue;
      const s = ++seq;
      hist.pushState({ mdLayer: s } satisfies LayerState, '', win.location.href);
      layers.push({ el, seq: s });
    }
  };

  const onPop = () => {
    if (pendingBacks > 0) {
      pendingBacks--;
      if (pendingBacks === 0) clearTimeout(pendingTimer);
      reconcile();
      return;
    }
    // 返回退到了哪一条：比它新的层都该关（一般就最上面一层）
    const at = curSeq() ?? 0;
    const gone = layers.filter((l) => l.seq > at);
    if (!gone.length) return;
    layers = layers.filter((l) => l.seq <= at);
    for (const l of gone.reverse()) {
      dismissed.add(l.el);
      sendEscape(l.el);
    }
  };

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      reconcile();
    });
  };
  // 弹层都挂在 body 下：只看 body 的直接子元素增删，和退场标记
  const mo = new MO(schedule);
  mo.observe(doc.body, { childList: true });
  const moAttr = new MO(schedule);
  moAttr.observe(doc.body, { attributes: true, attributeFilter: ['data-exiting'], subtree: true });
  win.addEventListener('popstate', onPop);

  return {
    reconcile,
    dispose: () => {
      mo.disconnect();
      moAttr.disconnect();
      win.removeEventListener('popstate', onPop);
      clearTimeout(pendingTimer);
    },
    layers: () => layers.length,
  };
}

/**
 * 弹层开着时要往记录里写新地址（跳页面、打开任务详情）：顶上是弹层的记录就换掉它，不是就照常进一条。
 * 不然弹层关了以后，下面还剩一条和上一页一样的记录，返回要多按一下。
 */
export function onLayerEntry(win: Window = window): boolean {
  return isLayerState(win.history.state);
}

let installed: BackLayers | null = null;

export function installBackLayers(win: Window = window) {
  if (installed || typeof (win as Window & { MutationObserver?: unknown }).MutationObserver !== 'function') return;
  const coarse = typeof win.matchMedia === 'function' ? win.matchMedia('(pointer: coarse)') : null;
  installed = createBackLayers({
    win,
    enabled: () => win.document.documentElement.dataset.layout === 'mobile' || !!coarse?.matches,
  });
}
