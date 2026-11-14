/**
 * 影人库（Rei 2026-11-14，docs/FILM-PEOPLE.md）：内置库「影人」、资料之间的关联 library_link（影人 → 影片，带角色，全部手动连）；
 * 关联行 id 由这一对算出、断开打墓碑、再连翻回来；作品按年份排、主创按连上的先后；合并、删除资料；
 * 迁移 v25、两台设备同步、老客户端忽略这张表；导出导入；TMDB / IMDb 影人编号和在线找的查询。
 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { SqlAdapter, migrate } from '../src/storage/sql';
import { SCHEMA_VERSION } from '../src/storage/schema';
import { SyncEngine } from '../src/sync/engine';
import { MemoryRemote } from '../src/sync/memory-remote';
import { BUILTIN_TYPE_IDS } from '../src/seed/builtin-types';
import { cleanRole, libraryLinkId, sortFilmography } from '../src/library-link';
import { libraryCopy } from '../src/library';
import { imdbNameIdOf, siteUrlOf, tmdbPersonIdOf } from '../src/links';
import { applyAutofill, findLookupTwin, itemOfLookup, lookupKindOf, lookupQueryOf, lookupSearchText, planAutofill, type LookupResult } from '../src/lookup';
import { exportArchive, fromUtf8, planImport, applyImport } from '../src/archive';
import { local } from './helpers';
import type { FieldValue } from '../src/types';
import { NodeSqliteDriver } from './sql-drivers';

const FP = BUILTIN_TYPE_IDS.filmPerson;
const MOVIE = BUILTIN_TYPE_IDS.movie;

async function open(adapter: MemoryAdapter | SqlAdapter = new MemoryAdapter(), deviceId = 'dev1') {
  let t = local(2026, 11, 14, 9).getTime();
  return Store.open(adapter, { deviceId, now: () => new Date((t += 10)) });
}
const film = (s: Store, name: string, year?: number) => s.createLibraryItem(MOVIE, { name, fields: year ? { year } : {} });
const person = (s: Store, name: string) => s.createLibraryItem(FP, { name, fields: { roles: ['导演'] } });

describe('内置库「影人」', () => {
  it('新库就有：圆形版式、身份多选、TMDB / IMDb 编号；能在线找（person）；库名「影人库」', async () => {
    const s = await open();
    const t = s.get('task_type', FP)!;
    expect(t).toMatchObject({ name: '影人', layout: 'round', builtin: true, hidden: false });
    expect(t.fields.find((f) => f.key === 'roles')).toMatchObject({ kind: 'multiselect', options: ['演员', '导演', '编剧', '制片', '配乐'] });
    expect(t.fields.find((f) => f.key === 'tmdb')).toMatchObject({ kind: 'site_id', site: 'tmdb_person' });
    expect(t.fields.find((f) => f.key === 'imdb')).toMatchObject({ kind: 'site_id', site: 'imdb_name' });
    expect(lookupKindOf(t)).toBe('person');
    expect(libraryCopy(t).name).toBe('影人库');
    // 排在影视后面
    const ids = s.refLibraries().map((x) => x.id);
    expect(ids.indexOf(FP)).toBe(ids.indexOf(MOVIE) + 1);
  });

  it('老库打开：本机没有这一行就补上（内置戳，和别的设备补的是同一行）', async () => {
    const adapter = new MemoryAdapter();
    const s1 = await open(adapter);
    await s1.flush();
    const snap = await adapter.loadAll();
    snap.task_type = snap.task_type.filter((r) => r.id !== FP);
    const a2 = new MemoryAdapter();
    await a2.applyRemoteChanges(Object.entries(snap).flatMap(([table, rows]) => (rows as { id: string }[]).map((row) => ({ table, row }) as never)));
    const s2 = await open(a2);
    expect(s2.get('task_type', FP)?.name).toBe('影人');
    expect(s2.get('task_type', FP)!.updated_at).toBe(s1.get('task_type', FP)!.updated_at);
  });
});

describe('编号', () => {
  it('TMDB 人物编号：数字或链接', () => {
    expect(tmdbPersonIdOf('525')).toBe('525');
    expect(tmdbPersonIdOf('https://www.themoviedb.org/person/525-christopher-nolan?language=zh-CN')).toBe('525');
    expect(tmdbPersonIdOf('https://www.themoviedb.org/movie/525')).toBeNull();
    expect(siteUrlOf('tmdb_person', '525')).toBe('https://www.themoviedb.org/person/525');
  });
  it('IMDb 影人编号：nm 加数字、链接、只填数字补 nm', () => {
    expect(imdbNameIdOf('NM0634240')).toBe('nm0634240');
    expect(imdbNameIdOf('https://www.imdb.com/name/nm0634240/?ref_=tt_ov')).toBe('nm0634240');
    expect(imdbNameIdOf('0634240')).toBe('nm0634240');
    expect(imdbNameIdOf('tt0816692')).toBeNull();
    expect(siteUrlOf('imdb_name', 'nm0634240')).toBe('https://www.imdb.com/name/nm0634240/');
  });
});

describe('在线找影人（TMDB 人物）', () => {
  const R: LookupResult = {
    source: 'tmdb',
    sourceId: 'person/525',
    name: '克里斯托弗·诺兰',
    year: 1970,
    image: 'https://image.tmdb.org/t/p/w780/x.jpg',
    subtitle: 'Christopher Nolan',
    fields: { name_en: 'Christopher Nolan', birth_year: 1970, roles: ['导演'], tmdb: '525', imdb: 'nm0634240' },
    url: 'https://www.themoviedb.org/person/525',
    note: '英国导演。',
  };
  it('输入框：名字按名字搜；IMDb 影人编号 / 链接、TMDB 人物链接按编号取；别的网址不搜', () => {
    expect(lookupSearchText('诺兰 第二季', 'person')).toEqual({ by: 'name', q: '诺兰 第二季' });
    expect(lookupSearchText('nm0634240', 'person')).toEqual({ by: 'id', source: 'imdb', id: 'nm0634240' });
    expect(lookupSearchText('https://www.imdb.com/name/nm0634240/', 'person')).toEqual({ by: 'id', source: 'imdb', id: 'nm0634240' });
    expect(lookupSearchText('https://www.themoviedb.org/person/525-christopher-nolan', 'person')).toEqual({ by: 'id', source: 'tmdb', id: 'person/525' });
    expect(lookupSearchText('https://example.com/nolan', 'person')).toBeNull();
  });
  it('自动补全：先认 TMDB 编号，再认 IMDb 编号，都没有按名字', async () => {
    const s = await open();
    const t = s.get('task_type', FP)!;
    expect(lookupQueryOf(t, { name: '诺兰', fields: { tmdb: '525', imdb: 'nm0634240' } })).toEqual({ by: 'id', source: 'tmdb', id: 'person/525' });
    expect(lookupQueryOf(t, { name: '诺兰', fields: { imdb: 'nm0634240' } })).toEqual({ by: 'id', source: 'imdb', id: 'nm0634240' });
    expect(lookupQueryOf(t, { name: '诺兰', fields: {} })).toEqual({ by: 'name', q: '诺兰' });
  });
  it('选中结果建资料：字段、来源、简介进备注；补全时简介一行能勾，空着默认勾', async () => {
    const s = await open();
    const t = s.get('task_type', FP)!;
    const data = itemOfLookup(t, R);
    expect(data.name).toBe('克里斯托弗·诺兰');
    expect(data.fields).toMatchObject({ name_en: 'Christopher Nolan', birth_year: 1970, roles: ['导演'], tmdb: '525', imdb: 'nm0634240', _source: 'tmdb:person/525' });
    expect(data.note_md).toBe('英国导演。');
    const draft: { name: string; image: string | null; fields: Record<string, FieldValue>; note_md: string } = { name: '诺兰', image: null, fields: {}, note_md: '' };
    const rows = planAutofill(t, draft, R);
    const note = rows.find((r) => r.key === '_note')!;
    expect(note).toMatchObject({ filled: false, apply: true, next: '英国导演。' });
    const out = applyAutofill(draft, rows, new Set(rows.filter((r) => r.apply && !r.def.media).map((r) => r.key)), R);
    expect(out.note_md).toBe('英国导演。');
    expect(out.fields.roles).toEqual(['导演']);
    // 备注写过：默认不勾
    expect(planAutofill(t, { ...draft, note_md: '我写的' }, R).find((r) => r.key === '_note')).toMatchObject({ filled: true, apply: false });
    // 草稿没带备注（老调用）：不列简介
    expect(planAutofill(t, { name: '诺兰', image: null, fields: {} }, R).some((r) => r.key === '_note')).toBe(false);
  });
  it('库里已有同一个人（同 TMDB 编号或 IMDb 编号）：认成同一条', async () => {
    const s = await open();
    const a = s.createLibraryItem(FP, { name: 'Nolan', fields: { imdb: 'nm0634240' } });
    expect(findLookupTwin(s.list('library_item'), FP, R)).toBe(a.id);
  });
});

describe('关联：影人 → 影片', () => {
  it('纯函数：角色整理、行 id 由这一对算出且有方向', () => {
    expect(cleanRole('  主演 ·  饰 \n 库珀 ')).toBe('主演 · 饰 库珀');
    expect(cleanRole('x'.repeat(100))).toHaveLength(80);
    expect(libraryLinkId('a', 'b')).toBe(libraryLinkId('a', 'b'));
    expect(libraryLinkId('a', 'b')).not.toBe(libraryLinkId('b', 'a'));
  });

  it('连上、改角色、断开、撤销；再连同一行翻回来', async () => {
    const s = await open();
    const nolan = person(s, '诺兰');
    const m = film(s, '星际穿越', 2014);
    const l = s.linkLibraryItems(nolan.id, m.id, ' 导演 ')!;
    expect(l).toMatchObject({ id: libraryLinkId(nolan.id, m.id), from_item: nolan.id, to_item: m.id, role: '导演', sort: 1 });
    // 再连一次只改角色
    expect(s.linkLibraryItems(nolan.id, m.id, '导演、编剧')!.id).toBe(l.id);
    expect(s.list('library_link')).toHaveLength(1);
    expect(s.linksFromItem(nolan.id).map((r) => [r.item.name, r.link.role])).toEqual([['星际穿越', '导演、编剧']]);
    expect(s.linksToItem(m.id).map((r) => r.item.name)).toEqual(['诺兰']);
    s.setLibraryLinkRole(l.id, '编剧');
    expect(s.get('library_link', l.id)!.role).toBe('编剧');
    const before = s.unlinkLibraryItems(l.id)!;
    expect(s.linksFromItem(nolan.id)).toEqual([]);
    s.restoreLibraryLink(before);
    expect(s.linksFromItem(nolan.id).map((r) => r.link.role)).toEqual(['编剧']);
    s.unlinkLibraryItems(l.id);
    const again = s.linkLibraryItems(nolan.id, m.id, '导演')!;
    expect(again.id).toBe(l.id);
    expect(again.role).toBe('导演');
    expect(s.listAll('library_link')).toHaveLength(1);
    // 自己连自己、连不在的：不写
    expect(s.linkLibraryItems(m.id, m.id)).toBeNull();
    expect(s.linkLibraryItems(nolan.id, 'nope')).toBeNull();
  });

  it('作品按年份新的在前、没年份的最后；主创按连上的先后', async () => {
    const s = await open();
    const nolan = person(s, '诺兰');
    const bale = person(s, '贝尔');
    const a = film(s, '记忆碎片', 2000);
    const b = film(s, '奥本海默', 2023);
    const c = film(s, '没写年份');
    const d = film(s, '星际穿越', 2014);
    for (const f of [a, c, b, d]) s.linkLibraryItems(nolan.id, f.id, '导演');
    expect(s.linksFromItem(nolan.id).map((r) => r.item.name)).toEqual(['奥本海默', '星际穿越', '记忆碎片', '没写年份']);
    s.linkLibraryItems(bale.id, d.id, '主演·饰某某');
    expect(s.linksToItem(d.id).map((r) => [r.item.name, r.link.role])).toEqual([['诺兰', '导演'], ['贝尔', '主演·饰某某']]);
    expect(sortFilmography([{ link: { id: 'x', created_at: '1' }, item: { name: 'A', fields: { year: '1999' } } }]).length).toBe(1);
  });

  it('删一条资料：连着它的关联一起断开；合并：顺着留下的那条，同一对只算一次', async () => {
    const s = await open();
    const nolan = person(s, '诺兰');
    const nolan2 = person(s, 'Christopher Nolan');
    const m = film(s, '星际穿越', 2014);
    const m2 = film(s, '致命魔术', 2006);
    s.linkLibraryItems(nolan.id, m.id, '导演');
    s.linkLibraryItems(nolan2.id, m.id, '编剧');
    s.linkLibraryItems(nolan2.id, m2.id, '导演');
    s.mergeLibraryItems(nolan.id, [nolan2.id]);
    expect(s.linksFromItem(nolan.id).map((r) => r.item.name)).toEqual(['星际穿越', '致命魔术']);
    expect(s.linksToItem(m.id)).toHaveLength(1);
    s.deleteLibraryItem(m2.id);
    expect(s.linksFromItem(nolan.id).map((r) => r.item.name)).toEqual(['星际穿越']);
    expect(s.list('library_link').some((l) => l.to_item === m2.id)).toBe(false);
  });
});

describe('迁移、同步、老客户端、导出导入', () => {
  it(`SQLite：迁移到 v${SCHEMA_VERSION}，library_link 存得下、读得回`, async () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(25);
    const driver = new NodeSqliteDriver();
    await migrate(driver);
    const s = await open(new SqlAdapter(driver));
    const p = person(s, '诺兰');
    const m = film(s, '星际穿越', 2014);
    const l = s.linkLibraryItems(p.id, m.id, '导演')!;
    await s.flush();
    const again = await open(new SqlAdapter(driver));
    expect(again.get('library_link', l.id)).toMatchObject({ from_item: p.id, to_item: m.id, role: '导演', sort: 1 });
    expect(again.get('task_type', FP)?.name).toBe('影人');
  });

  it('两台设备：A 连上，B 同步后看到；B 改角色、A 断开，各自同步后一致（行级 LWW）', async () => {
    const remote = new MemoryRemote();
    const dev = async (id: string) => {
      const store = await open(new MemoryAdapter(), id);
      const engine = new SyncEngine(store, remote.transport(), { account: 'rei@example.com', now: () => store.now(), timers: { set: () => 0, clear: () => {} } });
      return { store, sync: () => engine.syncNow() };
    };
    const A = await dev('devA');
    const B = await dev('devB');
    const p = person(A.store, '诺兰');
    const m = film(A.store, '星际穿越', 2014);
    const l = A.store.linkLibraryItems(p.id, m.id, '导演')!;
    await A.sync();
    await B.sync();
    expect(B.store.linksFromItem(p.id).map((r) => r.link.role)).toEqual(['导演']);
    B.store.setLibraryLinkRole(l.id, '导演、编剧');
    await B.sync();
    await A.sync();
    expect(A.store.get('library_link', l.id)!.role).toBe('导演、编剧');
    A.store.unlinkLibraryItems(l.id);
    await A.sync();
    await B.sync();
    expect(B.store.linksToItem(m.id)).toEqual([]);
  });

  it('老客户端：不认识的表拉下来直接跳过，不报错', async () => {
    const s = await open();
    const n = s.applyRemote([{ table: 'no_such_table' as never, row: { id: 'x', updated_at: '0000000001000-0000-devX', deleted: false } as never }]);
    expect(n).toBe(0);
  });

  it('导出带 _meta/library_links.json，导入到新库接回', async () => {
    const s = await open();
    const p = person(s, '诺兰');
    const m = film(s, '星际穿越', 2014);
    const l = s.linkLibraryItems(p.id, m.id, '导演')!;
    const { files } = exportArchive(s);
    const meta = files.find((f) => f.path === '_meta/library_links.json')!;
    expect(JSON.parse(fromUtf8(meta.data))).toHaveLength(1);
    const dst = await open(new MemoryAdapter(), 'dev2');
    applyImport(dst, planImport(dst, files));
    expect(dst.get('library_link', l.id)).toMatchObject({ from_item: p.id, to_item: m.id, role: '导演' });
    expect(dst.linksFromItem(p.id).map((r) => r.item.name)).toEqual(['星际穿越']);
  });
});
