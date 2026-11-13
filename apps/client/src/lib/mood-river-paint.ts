/**
 * 心情河流的逐像素画法（照 work/mood-river/mock7.html 第七版稿移植，Rei 2026-11-05 定稿）。
 * 纯函数：给一块低分辨率 RGBA 缓冲（画布的 ImageData.data），按每行各股水流的份量（core riverProfile）、
 * 每股的颜色、时间 t 填颜色和透明度。画布再用 CSS 放大，看起来是连续的渐变。
 *
 * - 颜色：每个像素 = 各股颜色按 (份量 + 一点底) × 横向高斯（以这股此刻的路线为中心）加权平均，像几股水流混在一起。
 * - 路线：每股有基准位置（core laneBase），沿高度正弦摆动 + 一点噪声，随时间缓慢漂移。
 * - 软边：四边距离用 smooth-min 合成（圆滑的角），再减去一圈噪声决定的边宽，smoothstep 淡出；边形随数据的 seed 变。
 * - 呼吸：约 6 秒一个周期，透明度 0.8–1.0、亮度 ±4%，边宽 ±6px。t 固定为 0 就是静止画面（减少动态效果时用）。
 */
import { laneBase } from '@mindough/core';

export type Rgb = readonly [number, number, number];

export interface RiverPaint {
  /** 画布像素宽高（低分辨率）。 */
  cw: number;
  ch: number;
  /** 一个画布像素对应几个 CSS 像素。 */
  scale: number;
  /** 区域的 CSS 宽高。 */
  W: number;
  H: number;
  /** riverProfile 的结果：ch 行 × colors.length 股。 */
  profile: Float32Array;
  colors: readonly Rgb[];
  /** 秒。 */
  t: number;
  /** 呼吸开着没有（减少动态效果时 false：不起落、不漂）。 */
  motion: boolean;
  /** 透明度上限（深色 240，浅色 255）。 */
  maxAlpha: number;
  /** 软边噪声的起点（core riverSeed）。 */
  seed: number;
}

export const BREATH_SECONDS = 6;

const hash = (x: number, y: number) => {
  const t = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return t - Math.floor(t);
};
/** 值噪声（0–1），smoothstep 插值。 */
export function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - v) + (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * v;
}
const fbm = (x: number, y: number) => valueNoise(x, y) * 0.6 + valueNoise(x * 2.3, y * 2.3) * 0.3 + valueNoise(x * 5.1, y * 5.1) * 0.1;

/** 呼吸的相位（-1–1）。 */
export function breath(t: number): number {
  return Math.sin((t * 2 * Math.PI) / BREATH_SECONDS);
}

/** 到四边距离的 smooth-min（k 越大角越圆）。 */
export function edgeDistance(x: number, y: number, W: number, H: number, k = 14): number {
  return -k * Math.log(Math.exp(-x / k) + Math.exp(-(W - x) / k) + Math.exp(-y / k) + Math.exp(-(H - y) / k));
}

export function paintRiver(out: Uint8ClampedArray, p: RiverPaint): void {
  const { cw, ch, scale, W, H, profile, colors, maxAlpha, seed } = p;
  const L = colors.length;
  const t = p.motion ? p.t : 0;
  const br = p.motion ? breath(t) : 0;
  const lum = 1 + 0.04 * br;
  const alphaK = maxAlpha * (0.9 + 0.1 * br);
  const laneX = new Float32Array(L);
  // 份量的底：股数少时 0.05（第七版稿），多时按比例压低，少见的心情只占一点点
  const floor = L > 5 ? 0.25 / L / 5 : 0.05;
  // 股数多时每股窄一点，免得十来种颜色全混成灰
  const sigmaX = W * (L > 5 ? 0.26 : 0.32);
  for (let py = 0; py < ch; py++) {
    const y = (py + 0.5) * scale;
    const yr = y / H;
    for (let k = 0; k < L; k++) laneX[k] = (laneBase(k) + Math.sin(yr * 5.5 + k * 1.9 + t * 0.5) * 0.18 + (fbm(k * 3.7 + t * 0.07, yr * 4) - 0.5) * 0.16) * W;
    const row = py * L;
    for (let px = 0; px < cw; px++) {
      const x = (px + 0.5) * scale;
      let ws = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = 0; k < L; k++) {
        const dx = (x - laneX[k]!) / sigmaX;
        const w = ((profile[row + k] ?? 0) + floor) * Math.exp(-dx * dx) + 0.002;
        const c = colors[k]!;
        ws += w;
        r += w * c[0];
        g += w * c[1];
        b += w * c[2];
      }
      const i = (py * cw + px) * 4;
      if (ws > 0) {
        out[i] = (r / ws) * lum;
        out[i + 1] = (g / ws) * lum;
        out[i + 2] = (b / ws) * lum;
      }
      // 不规则软边
      const d = edgeDistance(x, y, W, H);
      const en = valueNoise((x / W) * 1.6 + yr * 0.5 + 7 + seed + t * 0.08, yr * 2.6 + (x / W) * 0.4) * 0.75 + valueNoise((x / W) * 3.4 + 3 + seed, yr * 5.2) * 0.25;
      const edge = 4 + en * 34 + br * 6;
      const s = Math.max(0, Math.min(1, (d - edge * 0.55) / (edge * 0.7 + 12)));
      out[i + 3] = alphaK * s * s * (3 - 2 * s);
    }
  }
}

/** 低分辨率画布多大：一个画布像素 = scale 个 CSS 像素。 */
export function canvasSize(W: number, H: number, scale: number): { cw: number; ch: number } {
  return { cw: Math.max(1, Math.ceil(W / scale)), ch: Math.max(1, Math.ceil(H / scale)) };
}
