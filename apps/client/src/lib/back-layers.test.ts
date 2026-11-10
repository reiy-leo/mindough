// @vitest-environment happy-dom
/**
 * 系统返回先关弹层（Rei 2026-11-10）：弹层开时进一条同地址记录，返回退掉它时给弹层发 Esc；弹层自己关了把那条退掉。
 * 浏览器里搜索弹窗、新建面板、菜单的实测在 LightVela：work/d1110s/back.mjs。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBackLayers, isLayerState, openOverlays, type BackLayers } from './back-layers';

/** 假的浏览记录：go 之后异步发 popstate（同浏览器）。 */
function fakeHistory() {
  const entries: unknown[] = [null];
  let i = 0;
  const h = {
    get state() {
      return entries[i];
    },
    get length() {
      return entries.length;
    },
    pushState(s: unknown) {
      entries.splice(i + 1);
      entries.push(s);
      i++;
    },
    replaceState(s: unknown) {
      entries[i] = s;
    },
    go(n: number) {
      const to = Math.max(0, Math.min(entries.length - 1, i + n));
      if (to === i) return;
      setTimeout(() => {
        i = to;
        window.dispatchEvent(new PopStateEvent('popstate', { state: entries[i] }));
      }, 0);
    },
    back() {
      h.go(-1);
    },
    get index() {
      return i;
    },
  };
  return h;
}

/** 照 React Aria 的样子在 body 下挂一个弹层：modal = div[data-rac] > div[data-rac]，popover = div > div[data-rac][data-trigger]。按 Esc 就拆掉。 */
function overlay(kind: 'modal' | 'popover' = 'modal') {
  const outer = document.createElement('div');
  const inner = document.createElement('div');
  inner.setAttribute('data-rac', '');
  if (kind === 'modal') outer.setAttribute('data-rac', '');
  else inner.setAttribute('data-trigger', 'MenuTrigger');
  outer.append(inner);
  let escapes = 0;
  inner.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      escapes++;
      outer.remove();
    }
  });
  document.body.append(outer);
  return { outer, inner, close: () => outer.remove(), escapes: () => escapes };
}

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

let hist: ReturnType<typeof fakeHistory>;
let bl: BackLayers;
let enabled = true;

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  hist = fakeHistory();
  enabled = true;
  const win = new Proxy(window, {
    get(t, k) {
      if (k === 'history') return hist;
      const v = Reflect.get(t, k, t);
      return typeof v === 'function' && k !== 'MutationObserver' ? v.bind(t) : v;
    },
  });
  bl = createBackLayers({ win, enabled: () => enabled });
});
afterEach(() => bl.dispose());

describe('openOverlays', () => {
  it('认出 ModalOverlay 和 Popover，不认普通节点、提示气泡、退场中的', () => {
    const m = overlay('modal');
    const p = overlay('popover');
    const tip = document.createElement('div');
    tip.innerHTML = '<div data-rac data-placement="top" role="tooltip"></div>';
    document.body.append(tip);
    const ex = overlay('modal');
    ex.outer.setAttribute('data-exiting', 'true');
    expect(openOverlays(document.body)).toEqual([m.inner, p.inner]);
  });
});

describe('createBackLayers', () => {
  it('弹层打开进一条记录，返回发 Esc 关掉它', async () => {
    const o = overlay();
    await tick();
    expect(hist.length).toBe(2);
    expect(isLayerState(hist.state)).toBe(true);
    hist.back();
    await tick();
    expect(o.escapes()).toBe(1);
    expect(o.outer.isConnected).toBe(false);
    expect(hist.index).toBe(0);
    expect(bl.layers()).toBe(0);
  });

  it('弹层自己关了，把那条记录退掉，返回不用多按', async () => {
    const o = overlay();
    await tick();
    o.close();
    await tick(20);
    expect(hist.index).toBe(0);
    expect(o.escapes()).toBe(0);
    // 再开一个照常进记录
    overlay();
    await tick(20);
    expect(hist.index).toBe(1);
  });

  it('叠两层：返回先关上面那层，再返回关下面那层', async () => {
    const a = overlay('modal');
    await tick();
    const b = overlay('popover');
    await tick();
    expect(hist.index).toBe(2);
    hist.back();
    await tick();
    expect(b.escapes()).toBe(1);
    expect(a.outer.isConnected).toBe(true);
    hist.back();
    await tick();
    expect(a.escapes()).toBe(1);
    expect(hist.index).toBe(0);
  });

  it('两层一起关掉：一次退两条', async () => {
    const a = overlay('modal');
    await tick();
    const b = overlay('popover');
    await tick();
    a.close();
    b.close();
    await tick(20);
    expect(hist.index).toBe(0);
  });

  it('弹层里跳了页面（记录被换掉）：关的时候不退', async () => {
    const o = overlay();
    await tick();
    hist.replaceState({ mdDetail: true });
    o.close();
    await tick(20);
    expect(hist.index).toBe(1);
    expect(hist.state).toEqual({ mdDetail: true });
  });

  it('桌面（不开）时不进记录', async () => {
    enabled = false;
    overlay();
    await tick();
    expect(hist.length).toBe(1);
  });

  it('关掉后马上又开：等退完再进新记录，不被 back 吃掉', async () => {
    const a = overlay();
    await tick();
    a.close();
    await Promise.resolve();
    await Promise.resolve();
    const b = overlay();
    await tick(30);
    expect(hist.index).toBe(1);
    expect(isLayerState(hist.state)).toBe(true);
    hist.back();
    await tick();
    expect(b.escapes()).toBe(1);
  });
});
