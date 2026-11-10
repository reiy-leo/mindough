/**
 * 高德（餐厅、目的地，Rei 2026-11-09 / 11-10）：搜地点、按 POI id / 分享链接取、逆地理、错误码、JS API 安全密钥代理。
 * fixtures/amap-*.json 是 2026-11-10 真请求高德的返回（不含 Key），条数删短了。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { handle, type Env } from '../src/index';
import { sign } from '../src/session';
import { allowedImageHost } from '../src/lookup';
import { amapArea, amapCategory, amapError, amapThumb, poiIdOfUrl } from '../src/lookup/amap';
import { AMAP_JS_KEY, amapProxyTarget } from '../src/amap-proxy';

const ORIGIN = 'https://app.mindough.rei8t.dev';
const SECRET = 'test-secret-0123456789';
const KEY = 'amap-test-key-000';
const fx = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as unknown;

const baseEnv = (p: Partial<Env> = {}): Env => ({ SESSION_SECRET: SECRET, ALLOWED_EMAILS: 'reiy.leoz@gmail.com', ...p });

async function call(path: string, env: Env, init: RequestInit = {}, auth = true) {
  const headers = new Headers(init.headers);
  if (auth) headers.set('authorization', `Bearer ${await sign({ sub: 's', email: 'reiy.leoz@gmail.com', name: 'Rei', picture: null, exp: Date.now() + 60_000 }, SECRET)}`);
  return handle(new Request(ORIGIN + path, { ...init, headers }), env);
}

type Route = (url: URL, init?: RequestInit) => Response | Promise<Response>;
function mockFetch(routes: Record<string, Route>) {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      calls.push({ url, ...(init ? { init } : {}) });
      const key = Object.keys(routes).find((k) => `${url.origin}${url.pathname}`.startsWith(k));
      if (!key) throw new Error(`没想到的请求：${url}`);
      return routes[key]!(url, init);
    }),
  );
  return calls;
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

type Body = { results: Array<{ source: string; sourceId: string; name: string; subtitle?: string; image?: string; thumb?: string; url: string; fields: Record<string, unknown> }>; sources: Array<{ source: string; status: string; code?: number; message?: string }>; error?: string };

describe('高德：搜地点', () => {
  it('没配 AMAP_KEY：503 服务不可用（unconfigured），不发请求', async () => {
    const calls = mockFetch({});
    const res = await call('/api/lookup/search?kind=restaurant&q=%E6%B5%B7%E5%BA%95%E6%8D%9E', baseEnv());
    expect(res.status).toBe(503);
    const body = (await res.json()) as Body;
    expect(body.sources).toEqual([expect.objectContaining({ source: 'amap', status: 'unconfigured', code: 503 })]);
    expect(body.error).toMatch(/^503 服务不可用：未配置高德 Key/);
    expect(calls).toHaveLength(0);
    const item = await call('/api/lookup/item?source=amap&id=B0FFKKRXAZ', baseEnv());
    expect(item.status).toBe(503);
    expect(((await item.json()) as { state: string }).state).toBe('unconfigured');
  });

  it('餐厅：只搜餐饮（types=050000）、城市优先不限定；补齐地址、城市 / 区、经纬度、电话、类别、评分、人均、营业时间、POI id、照片', async () => {
    const calls = mockFetch({ 'https://restapi.amap.com/v5/place/text': () => Response.json(fx('amap-text-haidilao.json')) });
    const res = await call('/api/lookup/search?kind=restaurant&q=%E6%B5%B7%E5%BA%95%E6%8D%9E&lang=en&city=%E4%B8%8A%E6%B5%B7%E5%B8%82', baseEnv({ AMAP_KEY: KEY }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    const u = calls[0]!.url;
    expect(u.searchParams.get('key')).toBe(KEY);
    expect(u.searchParams.get('types')).toBe('050000');
    expect(u.searchParams.get('region')).toBe('上海市');
    expect(u.searchParams.get('city_limit')).toBe('false');
    expect(u.searchParams.get('show_fields')).toBe('business,photos');
    expect(body.results).toHaveLength(2);
    expect(body.results[0]).toMatchObject({
      source: 'amap',
      sourceId: 'B0FFKKRXAZ',
      name: '海底捞火锅(外滩店)',
      subtitle: '中餐厅 · 火锅店 · 上海市黄浦区 南京东路123号中央商场5楼',
      url: 'https://uri.amap.com/poidetail?poiid=B0FFKKRXAZ&src=mindough',
      image: 'https://store.is.autonavi.com/showpic/bcb84a02dd0ebb388d01c309af554414?operate=original',
      fields: {
        amap: 'B0FFKKRXAZ',
        address: '南京东路123号中央商场5楼',
        city: '上海市 黄浦区',
        location: '121.487590,31.238251',
        phone: '021-63339190 / 021-63339199',
        category: '中餐厅 · 火锅店',
        rating: 4.7,
        cost: { amount: 120, currency: 'CNY' },
        hours: '周一至周日 11:00-07:00',
        _city: '上海市',
      },
    });
    // 结果里的 Key 一个字也不带
    expect(JSON.stringify(body)).not.toContain(KEY);
  });

  it('目的地：不限类别、不带人均；没有上次的城市就全国找', async () => {
    const calls = mockFetch({ 'https://restapi.amap.com/v5/place/text': () => Response.json(fx('amap-text-waitan.json')) });
    const body = (await (await call('/api/lookup/search?kind=place&q=%E5%A4%96%E6%BB%A9', baseEnv({ AMAP_KEY: KEY }))).json()) as Body;
    const u = calls[0]!.url;
    expect(u.searchParams.get('types')).toBeNull();
    expect(u.searchParams.get('region')).toBeNull();
    const w = body.results.find((r) => r.name === '外滩')!;
    expect(w.fields).toMatchObject({ category: '风景名胜', hours: '周一至周日 00:00-24:00', rating: 4.9, city: '上海市 黄浦区' });
    expect(w.fields.cost).toBeUndefined();
    expect(w.image).toBe('https://store.is.autonavi.com/showpic/b9c402b7d34ea98654cc915e567761dd');
    expect(w.thumb).toBe('https://store.is.autonavi.com/showpic/b9c402b7d34ea98654cc915e567761dd?operate=merge&w=160&h=90&position=5');
  });

  it('没搜到：200 空列表；多类别（酒店 | 餐饮）各取后两段', async () => {
    mockFetch({ 'https://restapi.amap.com/v5/place/text': () => Response.json(fx('amap-text-empty.json')) });
    const empty = (await (await call('/api/lookup/search?kind=place&q=zzz', baseEnv({ AMAP_KEY: KEY }))).json()) as Body;
    expect(empty.results).toEqual([]);
    expect(empty.sources[0]!.status).toBe('ok');
    mockFetch({ 'https://restapi.amap.com/v5/place/text': () => Response.json(fx('amap-text-waitan-food.json')) });
    const food = (await (await call('/api/lookup/search?kind=restaurant&q=%E5%A4%96%E6%BB%A9', baseEnv({ AMAP_KEY: KEY }))).json()) as Body;
    expect(food.results[0]!.fields.category).toBe('宾馆酒店 · 五星级宾馆 · 餐饮相关场所 · 餐饮相关');
  });

  it('错误码：配额用完 429（limited）、Key 不对 503（unconfigured）、参数不对 400，都带中文和 infocode，不带 Key', async () => {
    mockFetch({ 'https://restapi.amap.com/v5/place/text': () => Response.json({ status: '0', info: 'DAILY_QUERY_OVER_LIMIT', infocode: '10003' }) });
    const r1 = await call('/api/lookup/search?kind=place&q=a', baseEnv({ AMAP_KEY: KEY }));
    expect(r1.status).toBe(429);
    const b1 = (await r1.json()) as Body;
    expect(b1.sources[0]).toMatchObject({ status: 'limited', code: 429 });
    expect(b1.sources[0]!.message).toBe('429 请求太多：高德今天的调用次数用完了，明天再试（10003）');
    expect(JSON.stringify(b1)).not.toContain(KEY);
    mockFetch({ 'https://restapi.amap.com/v5/place/text': () => Response.json({ status: '0', info: 'INVALID_USER_KEY', infocode: '10001' }) });
    const b2 = (await (await call('/api/lookup/search?kind=place&q=b', baseEnv({ AMAP_KEY: KEY }))).json()) as Body;
    expect(b2.sources[0]).toMatchObject({ status: 'unconfigured', code: 503 });
    mockFetch({ 'https://restapi.amap.com/v5/place/detail': () => Response.json(fx('amap-error-20000.json')) });
    const r3 = await call('/api/lookup/item?source=amap&id=B0FFKKRXAZ', baseEnv({ AMAP_KEY: KEY }));
    expect(r3.status).toBe(400);
    expect(((await r3.json()) as { error: string }).error).toBe('400 请求有误：高德说请求参数不对（20000）');
    expect(amapError('10019').status).toBe(429);
    expect(amapError('10019').state).toBe('limited');
    expect(amapError('99999', 'WHAT').message).toBe('502 错误网关：高德返回错误 WHAT（99999）');
  });

  it('超时 504、HTTP 429 限流', async () => {
    mockFetch({ 'https://restapi.amap.com/v5/place/text': () => Promise.reject(Object.assign(new Error('t'), { name: 'TimeoutError' })) });
    const r = (await (await call('/api/lookup/search?kind=place&q=c', baseEnv({ AMAP_KEY: KEY }))).json()) as Body;
    expect(r.sources[0]).toMatchObject({ code: 504, message: '504 网关超时：高德地图没有及时回应' });
    mockFetch({ 'https://restapi.amap.com/v5/place/text': () => new Response('', { status: 429 }) });
    const r2 = (await (await call('/api/lookup/search?kind=place&q=d', baseEnv({ AMAP_KEY: KEY }))).json()) as Body;
    expect(r2.sources[0]).toMatchObject({ code: 429, status: 'limited' });
  });
});

describe('高德：按 POI id、分享链接取', () => {
  it('POI id 直接取详情（kind=restaurant 带人均）', async () => {
    const calls = mockFetch({ 'https://restapi.amap.com/v5/place/detail': () => Response.json(fx('amap-detail-B0FFKKRXAZ.json')) });
    const res = await call('/api/lookup/item?source=amap&id=B0FFKKRXAZ&kind=restaurant', baseEnv({ AMAP_KEY: KEY }));
    expect(res.status).toBe(200);
    const r = (await res.json()) as Body['results'][number];
    expect(calls[0]!.url.searchParams.get('id')).toBe('B0FFKKRXAZ');
    expect(r).toMatchObject({ sourceId: 'B0FFKKRXAZ', name: '海底捞火锅(外滩店)', fields: { cost: { amount: 120, currency: 'CNY' } } });
  });

  it('分享短链：只读 surl.amap.com 的 Location 拿 POI id；短链失效 404；别的域名 400、不发请求', async () => {
    const calls = mockFetch({
      'https://surl.amap.com/55ev0xmT6PL': () => new Response(null, { status: 302, headers: { location: 'http://wb.amap.com/?p=B0FFKKRXAZ%2C31.238251%2C121.487590%2C%E6%B5%B7%E5%BA%95%E6%8D%9E&src=pc_sms_poi' } }),
      'https://surl.amap.com/deadLink01': () => new Response('', { status: 200 }),
      'https://restapi.amap.com/v5/place/detail': () => Response.json(fx('amap-detail-B0FFKKRXAZ.json')),
    });
    const ok = await call(`/api/lookup/item?source=amap&id=${encodeURIComponent('https://surl.amap.com/55ev0xmT6PL')}`, baseEnv({ AMAP_KEY: KEY }));
    expect(ok.status).toBe(200);
    expect(calls[0]!.init?.redirect).toBe('manual');
    const dead = await call(`/api/lookup/item?source=amap&id=${encodeURIComponent('https://surl.amap.com/deadLink01')}`, baseEnv({ AMAP_KEY: KEY }));
    expect(dead.status).toBe(404);
    const n = calls.length;
    const bad = await call(`/api/lookup/item?source=amap&id=${encodeURIComponent('https://evil.example.com/x')}`, baseEnv({ AMAP_KEY: KEY }));
    expect(bad.status).toBe(400);
    expect(calls.length).toBe(n);
  });

  it('各种高德链接里认 POI id', () => {
    expect(poiIdOfUrl('http://wb.amap.com/?p=B0G2FC12I8%2C29.647569%2C101.676654%2C%E5%86%B7&src=pc_sms_poi')).toBe('B0G2FC12I8');
    expect(poiIdOfUrl('https://www.amap.com/place/B0FFKKRXAZ')).toBe('B0FFKKRXAZ');
    expect(poiIdOfUrl('https://uri.amap.com/poidetail?poiid=B000A8UIN8&src=x')).toBe('B000A8UIN8');
    expect(poiIdOfUrl('https://www.amap.com/search?query=x')).toBeNull();
  });
});

describe('高德：逆地理', () => {
  it('地址、城市 / 区（直辖市 city 是空数组时用省）、附近地点按距离排', async () => {
    const calls = mockFetch({ 'https://restapi.amap.com/v3/geocode/regeo': () => Response.json(fx('amap-regeo.json')) });
    const res = await call('/api/lookup/regeo?lng=121.48759&lat=31.238251', baseEnv({ AMAP_KEY: KEY }));
    expect(res.status).toBe(200);
    const r = (await res.json()) as { location: string; address: string; city: string; pois: Array<{ name: string; distance: number }> };
    expect(calls[0]!.url.searchParams.get('location')).toBe('121.487590,31.238251');
    expect(r).toMatchObject({ location: '121.487590,31.238251', address: '上海市黄浦区外滩街道南京路步行街123号外滩中央商场', city: '上海市 黄浦区' });
    expect(r.pois.length).toBeGreaterThan(0);
    expect(r.pois.map((p) => p.distance)).toEqual([...r.pois.map((p) => p.distance)].sort((a, b) => a - b));
  });

  it('参数不对 400；没登录 401；没配 Key 503', async () => {
    mockFetch({});
    expect((await call('/api/lookup/regeo?lng=abc&lat=1', baseEnv({ AMAP_KEY: KEY }))).status).toBe(400);
    expect((await call('/api/lookup/regeo?lng=200&lat=1', baseEnv({ AMAP_KEY: KEY }))).status).toBe(400);
    expect((await call('/api/lookup/regeo?lng=121&lat=31', baseEnv({ AMAP_KEY: KEY }), {}, false)).status).toBe(401);
    expect((await call('/api/lookup/regeo?lng=121&lat=31', baseEnv())).status).toBe(503);
  });
});

describe('高德：小工具', () => {
  it('类别、城市 / 区、小图、图床白名单', () => {
    expect(amapCategory('餐饮服务;中餐厅;火锅店')).toBe('中餐厅 · 火锅店');
    expect(amapCategory('风景名胜;风景名胜;风景名胜')).toBe('风景名胜');
    expect(amapCategory('')).toBe('');
    expect(amapArea({ pname: '浙江省', cityname: '杭州市', adname: '西湖区' })).toBe('杭州市 西湖区');
    expect(amapArea({ pname: '上海市', cityname: '上海市', adname: '黄浦区' })).toBe('上海市 黄浦区');
    expect(amapThumb('http://store.is.autonavi.com/showpic/0416f6f64b163ff1c02475980c2452ac')).toBe('https://store.is.autonavi.com/showpic/0416f6f64b163ff1c02475980c2452ac?operate=merge&w=160&h=90&position=5');
    expect(amapThumb('https://aos-comment.amap.com/B0FF/comment/x.jpg')).toBe('https://aos-comment.amap.com/B0FF/comment/x.jpg');
    expect(allowedImageHost('https://store.is.autonavi.com/showpic/abc')).toBe(true);
    expect(allowedImageHost('https://aos-comment.amap.com/B0/x.jpg')).toBe(true);
    expect(allowedImageHost('http://store.is.autonavi.com/showpic/abc')).toBe(false);
    expect(allowedImageHost('https://evil.amap.com.example.com/x.jpg')).toBe(false);
  });
});

describe('高德 JS API 安全密钥代理', () => {
  it('没配 AMAP_JS_SECRET：503；配置接口说哪个配了', async () => {
    mockFetch({});
    const res = await handle(new Request(`${ORIGIN}/_AMapService/v3/geocode/regeo?key=${AMAP_JS_KEY}`), baseEnv());
    expect(res.status).toBe(503);
    const cfg = await handle(new Request(`${ORIGIN}/api/amap/config`), baseEnv({ AMAP_KEY: KEY }));
    expect(await cfg.json()).toEqual({ js: false, rest: true });
  });

  it('附上 jscode 转给 restapi / webapi / fmap01；别的 Key 403；只收 GET', async () => {
    const calls = mockFetch({
      'https://restapi.amap.com/': () => new Response('jsonp_1({"status":"1"})', { headers: { 'content-type': 'text/javascript' } }),
      'https://webapi.amap.com/v4/map/styles': () => Response.json({ ok: 1 }),
    });
    const env = baseEnv({ AMAP_JS_SECRET: 'js-secret-xyz' });
    const r = await handle(new Request(`${ORIGIN}/_AMapService/v3/geocode/regeo?key=${AMAP_JS_KEY}&location=1,2&callback=jsonp_1&jscode=fake`), env);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('jsonp_1({"status":"1"})');
    expect(calls[0]!.url.pathname).toBe('/v3/geocode/regeo');
    expect(calls[0]!.url.searchParams.getAll('jscode')).toEqual(['js-secret-xyz']);
    expect(calls[0]!.url.searchParams.get('callback')).toBe('jsonp_1');
    await handle(new Request(`${ORIGIN}/_AMapService/v4/map/styles?key=${AMAP_JS_KEY}&styleid=x`), env);
    expect(calls[1]!.url.origin).toBe('https://webapi.amap.com');
    expect(amapProxyTarget('/_AMapService/v3/vectordata/abc')).toBe('https://fmap01.amap.com/v3/vectordata/abc');
    expect((await handle(new Request(`${ORIGIN}/_AMapService/v3/ip?key=someoneelse`), env)).status).toBe(403);
    expect((await handle(new Request(`${ORIGIN}/_AMapService/v3/ip?key=${AMAP_JS_KEY}`, { method: 'POST' }), env)).status).toBe(405);
    expect(calls).toHaveLength(2);
  });
});
