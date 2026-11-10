/**
 * 安卓 App：把界面的底色告诉原生那边（2026-11-11，安卓选中文字时内容区变黑的兜底）。
 *
 * scripts/android-webview.sh 给 MainActivity 打补丁：WebView 自己的底色、窗口底色先按系统深浅色设成不透明，
 * 再挂一个 window.MindoughAndroid.setBackground('#rrggbb')。这里在界面换皮肤、换深浅色、换色彩档位时
 * 读 body 的底色（就是 var(--bg)），发过去，让 WebView 后面那几层和界面同一个颜色：哪怕哪一帧露出来，也不是黑的。
 *
 * 网页版、桌面 App、iOS 没有这个对象，什么都不做。
 */

interface AndroidBridge {
  setBackground(hex: string): void;
}

declare global {
  interface Window {
    MindoughAndroid?: AndroidBridge;
  }
}

/** rgb(a) / color(srgb …) 之类转成 #rrggbb；透明的（alpha 0）不要，返回 null。 */
export function cssColorToHex(css: string): string | null {
  const s = css.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  let m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  let rgb: number[] | null = null;
  let alpha = 1;
  if (m) {
    rgb = [m[1], m[2], m[3]].map(Number);
    if (m[4] != null) alpha = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  } else {
    m = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(s);
    if (m) {
      rgb = [m[1], m[2], m[3]].map((v) => Number(v) * 255);
      if (m[4] != null) alpha = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    }
  }
  if (!rgb || rgb.some((v) => !Number.isFinite(v)) || !(alpha > 0)) return null;
  return '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

/** 别的写法（oklab、color-mix 算出来的格式等）用 1×1 画布兜底换成 rgb。 */
function viaCanvas(css: string): string | null {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#000';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (!a) return null;
    return cssColorToHex(`rgb(${r}, ${g}, ${b})`);
  } catch {
    return null;
  }
}

export function installAndroidBackground(): void {
  const bridge = typeof window !== 'undefined' ? window.MindoughAndroid : undefined;
  if (!bridge || typeof bridge.setBackground !== 'function') return;
  let last = '';
  let queued = false;
  const send = () => {
    queued = false;
    const css = getComputedStyle(document.body).backgroundColor;
    const hex = cssColorToHex(css) ?? viaCanvas(css);
    if (!hex || hex === last) return;
    last = hex;
    try {
      bridge.setBackground(hex);
    } catch {
      /* 老包没有这个方法：不管 */
    }
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(send);
  };
  // 皮肤、深浅色、色彩档位都挂在 <html> 的属性上（lib/settings.tsx）
  new MutationObserver(queue).observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin', 'data-theme', 'data-color-level', 'class', 'style'] });
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', queue);
  if (document.body) queue();
  else window.addEventListener('DOMContentLoaded', queue, { once: true });
}
