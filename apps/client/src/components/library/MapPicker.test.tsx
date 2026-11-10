// @vitest-environment happy-dom
/** 在地图上选点（Rei 2026-11-10）：没配安全密钥提示未配置；拖标记后逆地理显示地址，「用这个位置」带回经纬度和地址。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../../lib/lookup', () => ({ useLookupAvailable: () => true }));

import { MapPicker } from './MapPicker';
import type { AMapNS } from '../../lib/amap';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const wait = async (ms = 0) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

/** 假的高德：记下 Map / Marker，能手动触发 dragend。 */
function fakeAMap() {
  const handlers: Record<string, () => void> = {};
  let pos: [number, number] = [0, 0];
  const marker = {
    setPosition: (p: [number, number]) => (pos = p),
    getPosition: () => ({ getLng: () => pos[0], getLat: () => pos[1] }),
    on: (ev: string, fn: () => void) => (handlers[ev] = fn),
  };
  const map = { setCenter: vi.fn(), setZoom: vi.fn(), on: vi.fn(), destroy: vi.fn() };
  const ns = {
    Map: vi.fn(function (this: unknown, _el: HTMLElement, opts: { center: [number, number] }) {
      pos = opts.center;
      return map;
    }),
    Marker: vi.fn(function () {
      return marker;
    }),
  } as unknown as AMapNS;
  return { ns, map, drag: (p: [number, number]) => ((pos = p), handlers.dragend!()) };
}

describe('MapPicker', () => {
  it('没配 AMAP_JS_SECRET：提示未配置，不加载地图，「用这个位置」灰着', async () => {
    const load = vi.fn();
    act(() => root.render(<MapPicker location={null} address="" onCancel={() => {}} onPick={() => {}} deps={{ config: async () => ({ js: false, rest: true }), load }} />));
    await wait();
    expect(host.textContent).toContain('高德地图还没配置，选不了点');
    expect(load).not.toHaveBeenCalled();
    const use = [...host.querySelectorAll('button')].find((b) => b.textContent === '用这个位置')!;
    expect(use.disabled || use.getAttribute('aria-disabled') === 'true' || use.hasAttribute('data-disabled')).toBe(true);
  });

  it('从已有经纬度打开；拖到新位置后逆地理；地址不同才给「地址也换成这个」，带回点和地址', async () => {
    const amap = fakeAMap();
    const regeo = vi.fn(async (lng: number, lat: number) => ({ location: `${lng},${lat}`, address: '上海市黄浦区南京东路123号', city: '上海市 黄浦区', pois: [{ id: 'B0', name: '万国建筑博览群', address: '', distance: 20, type: '' }] }));
    const onPick = vi.fn();
    act(() => root.render(<MapPicker location="121.48759,31.238251" address="旧地址" onCancel={() => {}} onPick={onPick} deps={{ config: async () => ({ js: true, rest: true }), load: async () => amap.ns, regeo }} />));
    await wait();
    expect((amap.ns.Map as unknown as { mock: { calls: Array<[unknown, { zoom: number; center: number[] }]> } }).mock.calls[0]![1]).toMatchObject({ zoom: 16, center: [121.48759, 31.238251] });
    act(() => amap.drag([121.49, 31.24]));
    await wait(450);
    expect(regeo).toHaveBeenLastCalledWith(121.49, 31.24, expect.anything());
    expect(host.textContent).toContain('上海市黄浦区南京东路123号');
    expect(host.textContent).toContain('附近：万国建筑博览群');
    expect(host.textContent).toContain('地址也换成这个');
    const use = [...host.querySelectorAll('button')].find((b) => b.textContent === '用这个位置')!;
    act(() => use.click());
    expect(onPick).toHaveBeenCalledWith({ lng: 121.49, lat: 31.24, address: '上海市黄浦区南京东路123号', city: '上海市 黄浦区' }, false);
  });
});
