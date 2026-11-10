/** 餐厅、目的地接高德（Rei 2026-11-09 / 11-10）：类型能在线找、粘贴编号 / 链接、补字段、同一家去重、地图选点。 */
import { describe, expect, it } from 'vitest';
import {
  BUILTIN_TASK_TYPES,
  BUILTIN_TYPE_IDS,
  LOOKUP_SOURCES,
  amapPoiIdOf,
  amapShareUrlOf,
  applyMapPick,
  findLookupTwin,
  itemOfLookup,
  lookupKindOf,
  lookupQueryOf,
  lookupSearchText,
  parseLngLat,
  planAutofill,
  siteIdOf,
  SITES,
  type LookupResult,
} from '../src';

const restaurant = BUILTIN_TASK_TYPES.find((t) => t.id === BUILTIN_TYPE_IDS.restaurant)!;
const travel = BUILTIN_TASK_TYPES.find((t) => t.id === BUILTIN_TYPE_IDS.travel)!;

const HDL: LookupResult = {
  source: 'amap',
  sourceId: 'B0FFKKRXAZ',
  name: '海底捞火锅(外滩店)',
  image: 'https://store.is.autonavi.com/showpic/x',
  subtitle: '中餐厅 · 火锅店 · 上海市黄浦区 南京东路123号',
  url: 'https://uri.amap.com/poidetail?poiid=B0FFKKRXAZ&src=mindough',
  fields: {
    amap: 'B0FFKKRXAZ',
    address: '南京东路123号中央商场5楼',
    city: '上海市 黄浦区',
    location: '121.487590,31.238251',
    phone: '021-63339190',
    category: '中餐厅 · 火锅店',
    rating: 4.7,
    cost: { amount: 120, currency: 'CNY' },
    hours: '周一至周日 11:00-07:00',
    _city: '上海市',
  },
};

describe('高德：类型与字段', () => {
  it('餐厅 → restaurant，目的地（旅行）→ place；来源是高德地图', () => {
    expect(lookupKindOf(restaurant)).toBe('restaurant');
    expect(lookupKindOf(travel)).toBe('place');
    expect(LOOKUP_SOURCES.amap.kinds).toEqual(['restaurant', 'place']);
    expect(LOOKUP_SOURCES.amap.url('B0FFKKRXAZ')).toBe('https://uri.amap.com/poidetail?poiid=B0FFKKRXAZ&src=mindough');
  });

  it('餐厅有人均，目的地没有；都在资料字段里，原有字段不动', () => {
    const keys = (t: typeof restaurant) => t.fields.map((f) => f.key);
    expect(keys(restaurant)).toEqual(['name', 'photo', 'address', 'city', 'location', 'phone', 'category', 'rating', 'cost', 'hours', 'amap', 'link']);
    expect(keys(travel)).toEqual(['destination', 'photo', 'address', 'city', 'location', 'phone', 'category', 'rating', 'hours', 'amap', 'depart', 'return']);
    expect(restaurant.fields.find((f) => f.key === 'cost')!.kind).toBe('money');
    expect(travel.fields.find((f) => f.key === 'amap')).toMatchObject({ kind: 'site_id', site: 'amap' });
  });

  it('选中一条：补齐所有字段，_city 不进资料，来源记成 amap:编号', () => {
    const data = itemOfLookup(restaurant, HDL);
    expect(data.name).toBe('海底捞火锅(外滩店)');
    expect(data.fields).toEqual({ ...HDL.fields, _city: undefined, _source: 'amap:B0FFKKRXAZ' } as never);
    expect('_city' in data.fields).toBe(false);
    const placeData = itemOfLookup(travel, HDL);
    expect(placeData.fields.cost).toBeUndefined();
  });

  it('自动补全：已有地址默认不覆盖，空的勾上，照片也是一行', () => {
    const rows = planAutofill(restaurant, { name: '海底捞', image: null, fields: { address: '我记的地址' } }, HDL);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.address).toMatchObject({ filled: true, apply: false });
    expect(byKey.phone).toMatchObject({ filled: false, apply: true });
    expect(byKey.photo!.next).toBe(HDL.image);
    expect(byKey.amap!.next).toBe('B0FFKKRXAZ');
  });

  it('库里已有同一个高德地点：认出来，不再新建', () => {
    const items = [{ id: 'a', type_id: restaurant.id, name: '外滩那家海底捞', fields: { amap: 'B0FFKKRXAZ' }, deleted: false }];
    expect(findLookupTwin(items, restaurant.id, HDL)).toBe('a');
  });
});

describe('高德：粘贴编号和链接', () => {
  it('站点编号：编号、各种高德链接都认，大小写不敏感；短链和普通网址不认', () => {
    expect(SITES.amap!.url('B0FFKKRXAZ')).toContain('poiid=B0FFKKRXAZ');
    expect(amapPoiIdOf('B0FFKKRXAZ')).toBe('B0FFKKRXAZ');
    expect(amapPoiIdOf('b0ffkkrxaz')).toBe('B0FFKKRXAZ');
    expect(amapPoiIdOf('https://www.amap.com/place/B0FFKKRXAZ')).toBe('B0FFKKRXAZ');
    expect(amapPoiIdOf('https://uri.amap.com/poidetail?poiid=B000A8UIN8')).toBe('B000A8UIN8');
    expect(amapPoiIdOf('http://wb.amap.com/?p=B0G2FC12I8%2C29.6%2C101.6%2C%E5%86%B7&src=pc_sms_poi')).toBe('B0G2FC12I8');
    expect(amapPoiIdOf('https://surl.amap.com/55ev0xmT6PL')).toBeNull();
    expect(amapPoiIdOf('BAD')).toBeNull();
    expect(amapPoiIdOf('https://example.com/place/B0FFKKRXAZ')).toBeNull();
    expect(siteIdOf('amap', 'https://www.amap.com/place/B0FFKKRXAZ')).toBe('B0FFKKRXAZ');
  });

  it('分享文字里找短链', () => {
    expect(amapShareUrlOf('【高德地图】海底捞火锅(外滩店)\n地址：南京东路123号\nhttp://surl.amap.com/55ev0xmT6PL')).toBe('https://surl.amap.com/55ev0xmT6PL');
    expect(amapShareUrlOf('海底捞')).toBeNull();
  });

  it('输入框：编号 / 链接按编号取，名字照原文搜（不去季标记），别的高德链接不当名字', () => {
    expect(lookupSearchText('B0FFKKRXAZ', 'restaurant')).toEqual({ by: 'id', source: 'amap', id: 'B0FFKKRXAZ' });
    expect(lookupSearchText('【高德地图】某店 https://surl.amap.com/55ev0xmT6PL', 'place')).toEqual({ by: 'id', source: 'amap', id: 'https://surl.amap.com/55ev0xmT6PL' });
    expect(lookupSearchText('上海 火锅 第二季', 'restaurant')).toEqual({ by: 'name', q: '上海 火锅 第二季' });
    expect(lookupSearchText('https://www.amap.com/search?query=x', 'place')).toBeNull();
    // 影视照旧
    expect(lookupSearchText('B0FFKKRXAZ', 'movie')).toEqual({ by: 'name', q: 'B0FFKKRXAZ' });
  });

  it('自动补全：填了高德编号就按编号取', () => {
    expect(lookupQueryOf(travel, { name: '外滩', fields: { amap: 'B00155FXB3' } })).toEqual({ by: 'id', source: 'amap', id: 'B00155FXB3' });
    expect(lookupQueryOf(travel, { name: '外滩', fields: {} })).toEqual({ by: 'name', q: '外滩' });
  });
});

describe('地图选点', () => {
  it('经纬度读写', () => {
    expect(parseLngLat('121.487590,31.238251')).toEqual({ lng: 121.48759, lat: 31.238251 });
    expect(parseLngLat('121.4，31.2')).toEqual({ lng: 121.4, lat: 31.2 });
    expect(parseLngLat('200,31')).toBeNull();
    expect(parseLngLat('上海')).toBeNull();
    expect(parseLngLat(null)).toBeNull();
  });

  it('经纬度总换；地址、城市默认只填空的，勾了才换；高德编号不动', () => {
    const pick = { lng: 121.4876, lat: 31.2383, address: '上海市黄浦区南京东路123号', city: '上海市 黄浦区' };
    const a = applyMapPick({ address: '旧地址', amap: 'B0FFKKRXAZ' }, pick);
    expect(a).toEqual({ address: '旧地址', amap: 'B0FFKKRXAZ', location: '121.487600,31.238300', city: '上海市 黄浦区' });
    const b = applyMapPick({ address: '旧地址' }, pick, true);
    expect(b.address).toBe('上海市黄浦区南京东路123号');
  });
});
