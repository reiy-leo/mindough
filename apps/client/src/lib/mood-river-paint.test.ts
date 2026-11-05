// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { riverProfile } from '@mindough/core';
import { breath, canvasSize, edgeDistance, paintRiver, type RiverPaint } from './mood-river-paint';

function setup(over: Partial<RiverPaint> = {}) {
  const W = 200;
  const H = 300;
  const scale = 4;
  const { cw, ch } = canvasSize(W, H, scale);
  const colors = over.colors ?? [[240, 200, 90] as const];
  const profile = over.profile ?? riverProfile(Array.from({ length: 10 }, () => colors.map(() => 1)), ch);
  const p: RiverPaint = { cw, ch, scale, W, H, profile, colors, t: 0, motion: true, maxAlpha: 255, seed: 1, ...over };
  const out = new Uint8ClampedArray(cw * ch * 4);
  paintRiver(out, p);
  const at = (x: number, y: number) => Array.from(out.slice((y * cw + x) * 4, (y * cw + x) * 4 + 4));
  return { out, at, cw, ch, p };
}

describe('心情河流的像素', () => {
  it('中间不透明，四角淡出成透明', () => {
    const { at, cw, ch } = setup();
    expect(at(Math.floor(cw / 2), Math.floor(ch / 2))[3]).toBeGreaterThan(200);
    expect(at(0, 0)[3]).toBe(0);
    expect(at(cw - 1, ch - 1)[3]).toBe(0);
  });
  it('只有一股时颜色就是那股的颜色', () => {
    const { at, cw, ch } = setup();
    const [r, g, b] = at(Math.floor(cw / 2), Math.floor(ch / 2));
    expect(Math.abs(r! - 240)).toBeLessThanOrEqual(2);
    expect(Math.abs(g! - 200)).toBeLessThanOrEqual(2);
    expect(Math.abs(b! - 90)).toBeLessThanOrEqual(2);
  });
  it('两股时颜色在两者之间，份量大的那股占上风', () => {
    const colors = [[255, 0, 0] as const, [0, 0, 255] as const];
    const { ch } = setup({ colors });
    const profile = riverProfile(Array.from({ length: 10 }, () => [9, 1]), ch);
    const { at, cw } = setup({ colors, profile });
    const [r, , b] = at(Math.floor(cw / 2), Math.floor(ch / 2));
    expect(r!).toBeGreaterThan(b!);
    expect(b!).toBeGreaterThan(0);
  });
  it('减少动态效果：不管 t 是多少画面都一样', () => {
    const a = setup({ motion: false, t: 0 }).out;
    const b = setup({ motion: false, t: 2.7 }).out;
    expect(Buffer.from(b).equals(Buffer.from(a))).toBe(true);
  });
  it('呼吸：半个周期前后透明度不一样，一个周期后回到原样', () => {
    const { cw, ch } = setup();
    const idx = (Math.floor(ch / 2) * cw + Math.floor(cw / 2)) * 4 + 3;
    const a0 = setup({ t: 1.5 }).out[idx]!;
    const a1 = setup({ t: 4.5 }).out[idx]!;
    expect(a0).toBeGreaterThan(a1);
    expect(breath(0)).toBeCloseTo(breath(6), 6);
  });
  it('数据变了（seed 不同）边形跟着变', () => {
    const a = setup({ seed: 1 }).out;
    const b = setup({ seed: 9 }).out;
    expect(Buffer.from(b).equals(Buffer.from(a))).toBe(false);
  });
  it('edgeDistance：中心远、边上近；canvasSize 向上取整', () => {
    expect(edgeDistance(100, 150, 200, 300)).toBeGreaterThan(edgeDistance(5, 150, 200, 300));
    expect(edgeDistance(0, 0, 200, 300)).toBeLessThan(0);
    expect(canvasSize(201, 299, 4)).toEqual({ cw: 51, ch: 75 });
    expect(canvasSize(0, 0, 4)).toEqual({ cw: 1, ch: 1 });
  });
});
