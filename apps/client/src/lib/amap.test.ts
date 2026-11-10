// @vitest-environment happy-dom
/** 高德（Rei 2026-11-09 / 11-10）：搜索带上次的城市、选中记城市、选中高德结果不再取详情；地图加载先设安全代理；逆地理出错带状态码。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_TYPE_IDS, MemoryAdapter, SOURCE_KEY, Store, type LookupResult } from '@mindough/core';
import { createItemFromLookup, lastLookupCity, searchOnline } from './lookup';
import { AMAP_JS_KEY, RegeoError, amapServiceHost, loadAMap, regeo } from './amap';

const HDL: LookupResult = {
  source: 'amap',
  sourceId: 'B0FFKKRXAZ',
  name: '海底捞火锅(外滩店)',
  image: 'https://store.is.autonavi.com/showpic/x',
  url: 'https://uri.amap.com/poidetail?poiid=B0FFKKRXAZ&src=mindough',
  fields: { amap: 'B0FFKKRXAZ', address: '南京东路123号', city: '上海市 黄浦区', location: '121.487590,31.238251', cost: { amount: 120, currency: 'CNY' }, _city: '上海市' },
};
const flush = () => new Promise((x) => setTimeout(x, 0));

// happy-dom 不真加载脚本（一插进去就报错）：截下插进 head 的脚本，自己触发 onload / onerror
let added: HTMLScriptElement[] = [];
beforeEach(() => {
  added = [];
  vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(n: T) => {
    added.push(n as unknown as HTMLScriptElement);
    return n;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  delete window.AMap;
  delete window._AMapSecurityConfig;
});

describe('高德：搜地点', () => {
  it('选中一条：建资料（不存 _city），记下城市；下次搜带 city；不再取详情，照片拉进 R2', async () => {
    const store = await Store.open(new MemoryAdapter());
    const type = store.get('task_type', BUILTIN_TYPE_IDS.restaurant)!;
    const fetchItem = vi.fn();
    const importImage = vi.fn(async () => 'asset-9');
    const { id } = createItemFromLookup(store, type, HDL, { fetchItem, importImage });
    expect(store.get('library_item', id)!.fields).toMatchObject({ amap: 'B0FFKKRXAZ', cost: { amount: 120, currency: 'CNY' }, [SOURCE_KEY]: 'amap:B0FFKKRXAZ' });
    expect('_city' in store.get('library_item', id)!.fields).toBe(false);
    expect(lastLookupCity()).toBe('上海市');
    await flush();
    await flush();
    expect(fetchItem).not.toHaveBeenCalled();
    expect(importImage).toHaveBeenCalledWith(store, HDL.image, 'banner');
    expect(store.get('library_item', id)!.image).toBe('asset-9');

    const fetcher = vi.fn(async () => Response.json({ results: [], sources: [] }));
    await searchOnline('restaurant', '火锅', undefined, fetcher as unknown as typeof fetch);
    expect(String((fetcher.mock.calls[0] as unknown[])[0])).toContain('kind=restaurant&q=%E7%81%AB%E9%94%85');
    expect(String((fetcher.mock.calls[0] as unknown[])[0])).toContain('&city=%E4%B8%8A%E6%B5%B7%E5%B8%82');
    // 影视不带城市
    await searchOnline('movie', 'dune', undefined, fetcher as unknown as typeof fetch);
    expect(String((fetcher.mock.calls[1] as unknown[])[0])).not.toContain('city=');
  });
});

describe('高德：地图', () => {
  it('加载前先设安全代理 serviceHost（不放安全密钥），脚本带公开 Key', async () => {
    const p = loadAMap(1000);
    expect(window._AMapSecurityConfig).toEqual({ serviceHost: amapServiceHost() });
    expect(amapServiceHost()).toMatch(/\/_AMapService$/);
    const s = added[0]!;
    expect(s.src).toBe(`https://webapi.amap.com/maps?v=2.0&key=${AMAP_JS_KEY}`);
    window.AMap = { Map: vi.fn(), Marker: vi.fn() } as never;
    s.onload!(new Event('load'));
    await expect(p).resolves.toBe(window.AMap);
    // 已经加载过：不再注入
    await loadAMap();
    expect(added).toHaveLength(1);
  });

  it('脚本加载失败：拒绝，下次能重试', async () => {
    const p = loadAMap(1000);
    added[0]!.onerror!(new Event('error'));
    await expect(p).rejects.toThrow();
    void loadAMap(1000).catch(() => {});
    expect(added).toHaveLength(2);
  });

  it('逆地理：成功给地址；出错带状态码和状态', async () => {
    const ok = vi.fn(async () => Response.json({ location: '121.487590,31.238251', address: '上海市黄浦区', city: '上海市 黄浦区', pois: [] }));
    await expect(regeo(121.48759, 31.238251, undefined, ok as unknown as typeof fetch)).resolves.toMatchObject({ address: '上海市黄浦区' });
    expect(String((ok.mock.calls[0] as unknown[])[0])).toContain('/api/lookup/regeo?lng=121.487590&lat=31.238251');
    const bad = vi.fn(async () => Response.json({ error: '503 服务不可用：未配置高德 Key', state: 'unconfigured' }, { status: 503 }));
    const e = await regeo(1, 2, undefined, bad as unknown as typeof fetch).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(RegeoError);
    expect(e).toMatchObject({ status: 503, state: 'unconfigured' });
  });
});
