/**
 * 豆瓣单季并进剧集（Rei 2026-11-21）：豆瓣把剧集的每一季记成单独一条（「星期三 第二季」），TMDB 是一整部剧。
 * - 选豆瓣单季结果时，库里有同一部剧（TMDB 剧集，或带 IMDb 编号的剧集）就不新建，把这条豆瓣链接记到那部剧对应的季上；
 * - 反过来，先有豆瓣单季条目、后选 TMDB 剧集：单季条目并进剧集（走资料合并，任务改指剧集，能撤销）；
 * - 「季」一节每季带豆瓣、IMDb 链接：并入时知道的直接用；其余季按「剧名 第N季」+ 年份在豆瓣搜，
 *   只认名字对得上、年份差不超过一年、而且只有一条候选的，配不上就不显示（不乱配）。
 *
 * 每季的豆瓣编号存在资料的保留键 `_douban_seasons`（JSON 文字），跟着资料同步，不加列；
 * 和 `_seasons` 分开存：老客户端补拉季时只重写 `_seasons`，不会丢掉这里的编号。
 * 这里只放纯逻辑；在线搜在 client lib/douban-seasons.ts，写入在 Store（mergeLibraryItems / absorbDoubanSeasons）。
 */
import { BUILTIN_TYPE_IDS } from './seed/builtin-types';
import { stripEpisode } from './episode';
import { normalizeName } from './library';
import { siteIdOf } from './links';
import { sourceOfFields, type LookupResult } from './lookup';
import { isShowItem, readSeasons, seasonsOf, type SeasonInfo } from './seasons';
import type { FieldValue, LibraryItem, TaskType } from './types';

export const DOUBAN_SEASONS_KEY = '_douban_seasons';
/** 自动搜过的季多久再搜一次（豆瓣会给新一季建条目）。 */
export const DOUBAN_SEASONS_MAX_AGE_MS = 30 * 24 * 3600 * 1000;
/** 一次自动搜最多发几次请求（先按剧名搜一次，再按「剧名 第N季」补）。 */
export const DOUBAN_SEASON_QUERIES = 5;

/**
 * 存在 `_douban_seasons` 里的样子。
 * ids：季号（字符串）→ 豆瓣编号；tried：自动搜过的季号；at：上次自动搜的时间（ISO），没搜过是 null。
 */
export interface StoredDoubanSeasons {
  v: 1;
  ids: Record<string, string>;
  tried: number[];
  at: string | null;
}

const EMPTY: StoredDoubanSeasons = { v: 1, ids: {}, tried: [], at: null };
const DOUBAN_ID = /^\d{4,12}$/;

/** 读 `_douban_seasons`；没有、坏了都当空的。 */
export function readDoubanSeasons(fields: Record<string, FieldValue> | null | undefined): StoredDoubanSeasons {
  const raw = fields?.[DOUBAN_SEASONS_KEY];
  if (typeof raw !== 'string' || !raw) return { ...EMPTY, ids: {}, tried: [] };
  try {
    const d = JSON.parse(raw) as Partial<StoredDoubanSeasons>;
    const ids: Record<string, string> = {};
    if (d && typeof d.ids === 'object' && d.ids)
      for (const [k, v] of Object.entries(d.ids)) if (/^\d{1,3}$/.test(k) && typeof v === 'string' && DOUBAN_ID.test(v)) ids[String(Number(k))] = v;
    const tried = Array.isArray(d?.tried) ? [...new Set(d.tried.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < 1000))].sort((a, b) => a - b) : [];
    const at = typeof d?.at === 'string' && Number.isFinite(Date.parse(d.at)) ? d.at : null;
    return { v: 1, ids, tried, at };
  } catch {
    return { ...EMPTY, ids: {}, tried: [] };
  }
}

/** 写成 `_douban_seasons` 的值；什么都没有时返回 null（调用方删掉这个键）。 */
export function encodeDoubanSeasons(d: StoredDoubanSeasons): string | null {
  if (!Object.keys(d.ids).length && !d.tried.length && !d.at) return null;
  const ids: Record<string, string> = {};
  for (const k of Object.keys(d.ids).sort((a, b) => Number(a) - Number(b))) ids[k] = d.ids[k]!;
  return JSON.stringify({ v: 1, ids, tried: [...new Set(d.tried)].sort((a, b) => a - b), at: d.at });
}

function putStored(fields: Record<string, FieldValue>, d: StoredDoubanSeasons): Record<string, FieldValue> {
  const out = { ...fields };
  const v = encodeDoubanSeasons(d);
  if (v) out[DOUBAN_SEASONS_KEY] = v;
  else delete out[DOUBAN_SEASONS_KEY];
  return out;
}

/** 把一季的豆瓣编号记上（同一个编号原来记在别的季上的，挪过来）。 */
export function withDoubanSeason(fields: Record<string, FieldValue>, season: number, doubanId: string): Record<string, FieldValue> {
  const d = readDoubanSeasons(fields);
  for (const [k, v] of Object.entries(d.ids)) if (v === doubanId) delete d.ids[k];
  d.ids[String(season)] = doubanId;
  return putStored(fields, d);
}

/** 这条资料各季记着的豆瓣编号。 */
export function doubanSeasonIds(fields: Record<string, FieldValue> | null | undefined): Set<string> {
  return new Set(Object.values(readDoubanSeasons(fields).ids));
}

// ───────────── 认出豆瓣单季 ─────────────

/** 名字里的季：「星期三 第二季」→ { base: 星期三, season: 2 }；带集号的、只有季标记的不算。 */
export function seasonOfName(name: string): { base: string; season: number } | null {
  const { rest, match } = stripEpisode(name);
  const s = match?.value.season;
  if (!match || s === undefined || match.value.episode !== undefined || s < 1 || !rest.trim()) return null;
  return { base: rest.trim(), season: s };
}

/** 一条豆瓣单季（结果或库里的资料）。 */
export interface DoubanSeasonRef {
  doubanId: string;
  season: number;
  /** 去掉季标记后的剧名。 */
  base: string;
  /** 别的叫法（豆瓣给的原名，同样去掉季标记）。 */
  alt?: string;
  year?: number;
  imdb?: string;
  /** 名字里没写季，按「只有一季、年份和第 1 季一样」认成第 1 季：配的时候年份要完全对上。 */
  implicit?: boolean;
}

const isMovieType = (type: Pick<TaskType, 'id'> | null | undefined) => !!type && type.id === BUILTIN_TYPE_IDS.movie;
const yearOfFields = (f: Record<string, FieldValue>) => (typeof f.year === 'number' ? f.year : undefined);

/** 豆瓣在线结果是不是单季：剧集（不是电影），名字带季标记。 */
export function doubanSeasonOfResult(r: Pick<LookupResult, 'source' | 'sourceId' | 'name' | 'subtitle' | 'year' | 'fields'>): DoubanSeasonRef | null {
  if (r.source !== 'douban' || !DOUBAN_ID.test(r.sourceId) || r.fields.kind === '电影') return null; // i18n-ignore 选项值（数据）
  const s = seasonOfName(r.name);
  if (!s) return null;
  const alt = r.subtitle ? (seasonOfName(r.subtitle)?.base ?? r.subtitle.trim()) : undefined;
  const imdb = siteIdOf('imdb', r.fields.imdb) ?? undefined;
  return { doubanId: r.sourceId, season: s.season, base: s.base, ...(alt ? { alt } : {}), ...(r.year ? { year: r.year } : {}), ...(imdb ? { imdb } : {}) };
}

/** 库里的资料是不是豆瓣单季：影视库、有豆瓣编号、不是从 TMDB 来的、不是电影，名字带季标记。 */
export function doubanSeasonOfItem(type: Pick<TaskType, 'id'> | null | undefined, item: Pick<LibraryItem, 'name' | 'fields'>): DoubanSeasonRef | null {
  if (!isMovieType(type) || item.fields.kind === '电影') return null; // i18n-ignore 选项值（数据）
  const src = sourceOfFields(item.fields);
  if (src && src.source !== 'douban') return null;
  const doubanId = src?.source === 'douban' ? src.sourceId : siteIdOf('douban', item.fields.douban);
  if (!doubanId || !DOUBAN_ID.test(doubanId)) return null;
  const s = seasonOfName(item.name);
  if (!s) return null;
  const imdb = siteIdOf('imdb', item.fields.imdb) ?? undefined;
  const year = yearOfFields(item.fields);
  return { doubanId, season: s.season, base: s.base, ...(year ? { year } : {}), ...(imdb ? { imdb } : {}) };
}

/** 能当「整部剧」收豆瓣单季的资料：是剧集、能拉季（TMDB 剧集编号或 IMDb 编号），自己不是豆瓣单季。 */
export function isSeasonHost(type: Pick<TaskType, 'id'> | null | undefined, item: Pick<LibraryItem, 'name' | 'fields'>): boolean {
  if (!isShowItem(type, item) || doubanSeasonOfItem(type, item)) return false;
  const src = sourceOfFields(item.fields);
  if (src?.source === 'tmdb' && /^tv\/\d+$/.test(src.sourceId)) return true;
  return !!siteIdOf('imdb', item.fields.imdb);
}

/**
 * 这条豆瓣单季是不是这部剧的：IMDb 编号相同，或去掉季标记后同名（原名也算）；年份要合理——
 * 知道这一季的首播年份就差不超过一年，不知道就不能比整部剧早一年以上（第 1 季还不能晚一年以上）。
 * 返回分数（越大越像），不是返回 0。
 */
export function seasonHostScore(host: Pick<LibraryItem, 'name' | 'fields'>, ref: DoubanSeasonRef): number {
  const hostImdb = siteIdOf('imdb', host.fields.imdb);
  const imdbHit = !!ref.imdb && !!hostImdb && ref.imdb === hostImdb;
  const hostName = normalizeName(host.name);
  const nameHit = !!hostName && (normalizeName(ref.base) === hostName || (!!ref.alt && normalizeName(ref.alt) === hostName));
  if (!imdbHit && !nameHit) return 0;
  const season = readSeasons(host.fields)?.seasons.find((s) => s.number === ref.season);
  const hy = yearOfFields(host.fields);
  let score = (imdbHit ? 4 : 0) + (nameHit ? 1 : 0);
  if (ref.year && season?.year) {
    const diff = Math.abs(ref.year - season.year);
    if (ref.implicit ? diff !== 0 : diff > 1) return 0;
    score += diff === 0 ? 2 : 1;
  } else if (ref.implicit) return 0;
  else if (ref.year && hy) {
    if (ref.year < hy - 1 || (ref.season === 1 && ref.year > hy + 1)) return 0;
  }
  return score;
}

/** 在一堆候选剧里挑这条单季的那部：最像的只有一部才算（同分的两部剧 → 不配）。 */
function pickHost<T extends Pick<LibraryItem, 'id' | 'name' | 'fields'>>(hosts: readonly T[], ref: DoubanSeasonRef): T | null {
  let best: T | null = null;
  let bestScore = 0;
  let tie = false;
  for (const h of hosts) {
    const s = seasonHostScore(h, ref);
    if (s > bestScore) {
      best = h;
      bestScore = s;
      tie = false;
    } else if (s && s === bestScore) tie = true;
  }
  return tie ? null : best;
}

type ItemRow = Pick<LibraryItem, 'id' | 'type_id' | 'name' | 'fields' | 'deleted'>;

function hostsOf<T extends ItemRow>(items: readonly T[], type: Pick<TaskType, 'id'>): T[] {
  return items.filter((it) => !it.deleted && it.type_id === type.id && isSeasonHost(type, it));
}

/** 选中的豆瓣在线结果是哪部剧的哪一季（库里没有那部剧、或认不准 → null）。 */
export function seasonHostOfResult(items: readonly ItemRow[], type: Pick<TaskType, 'id'> | null | undefined, r: Pick<LookupResult, 'source' | 'sourceId' | 'name' | 'subtitle' | 'year' | 'fields'>): { id: string; season: number } | null {
  if (!isMovieType(type)) return null;
  const ref = doubanSeasonOfResult(r);
  if (!ref) return null;
  const hosts = hostsOf(items, type!);
  // 已经记在某部剧上的：就是它
  const known = hosts.find((h) => doubanSeasonIds(h.fields).has(ref.doubanId));
  if (known) return { id: known.id, season: ref.season };
  const h = pickHost(hosts, ref);
  return h ? { id: h.id, season: ref.season } : null;
}

/** 库里的豆瓣单季条目该并进哪部剧（不是单季、认不准 → null）。 */
export function seasonHostOfItem(items: readonly ItemRow[], type: Pick<TaskType, 'id'> | null | undefined, item: ItemRow): { id: string; season: number; doubanId: string } | null {
  if (item.deleted || !isMovieType(type) || item.type_id !== type!.id) return null;
  const ref = doubanSeasonOfItem(type, item);
  if (!ref) return null;
  const hosts = hostsOf(items, type!).filter((h) => h.id !== item.id);
  const known = hosts.find((h) => doubanSeasonIds(h.fields).has(ref.doubanId));
  const h = known ?? pickHost(hosts, ref);
  return h ? { id: h.id, season: ref.season, doubanId: ref.doubanId } : null;
}

/** 库里哪些豆瓣单季条目属于这部剧（选了 TMDB 剧集后要并进来的）。 */
export function seasonItemsOf(items: readonly ItemRow[], type: Pick<TaskType, 'id'> | null | undefined, hostId: string): Array<{ id: string; season: number; doubanId: string }> {
  const out: Array<{ id: string; season: number; doubanId: string }> = [];
  for (const it of items) {
    const h = seasonHostOfItem(items, type, it);
    if (h?.id === hostId) out.push({ id: it.id, season: h.season, doubanId: h.doubanId });
  }
  return out;
}

/** 合并时：source 是不是要当成 target 的一季并进去（target 是整部剧、source 是豆瓣单季）。用户亲手挑的合并不再比名字和年份。 */
export function seasonMergeOf(type: Pick<TaskType, 'id'> | null | undefined, target: Pick<LibraryItem, 'name' | 'fields'>, source: Pick<LibraryItem, 'name' | 'fields'>): DoubanSeasonRef | null {
  if (!isMovieType(type) || !isShowItem(type, target) || doubanSeasonOfItem(type, target)) return null;
  return doubanSeasonOfItem(type, source);
}

// ───────────── 每季的链接 ─────────────

export interface SeasonLinks {
  douban?: string;
  imdb?: string;
}

/** 一季的豆瓣、IMDb 链接：豆瓣用记着的编号；IMDb 没有季级编号，用剧集编号的分季列表。特别篇（第 0 季）不给。 */
export function seasonLinks(item: Pick<LibraryItem, 'fields'>, s: Pick<SeasonInfo, 'number'>): SeasonLinks {
  if (s.number < 1) return {};
  const out: SeasonLinks = {};
  const id = readDoubanSeasons(item.fields).ids[String(s.number)];
  if (id) out.douban = `https://movie.douban.com/subject/${id}/`;
  const imdb = siteIdOf('imdb', item.fields.imdb);
  if (imdb) out.imdb = `https://www.imdb.com/title/${imdb}/episodes/?season=${s.number}`;
  return out;
}

// ───────────── 自动搜各季的豆瓣条目 ─────────────

const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']; // i18n-ignore 中文数字（豆瓣季名，搜索用）
/** 1 → 一，12 → 十二，20 → 二十，35 → 三十五（豆瓣的季名用中文数字）。 */
export function chineseNumber(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n);
  if (n < 10) return CN_DIGITS[n]!;
  const t = Math.floor(n / 10);
  const u = n % 10;
  return `${t === 1 ? '' : CN_DIGITS[t]}十${u ? CN_DIGITS[u] : ''}`; // i18n-ignore 中文数字
}

/** 按季搜的字：「星期三 第二季」。 */
export const doubanSeasonQuery = (name: string, season: number) => `${name.trim()} 第${chineseNumber(season)}季`; // i18n-ignore 豆瓣的季名写法（搜索用）

/** 要自动搜的季：有首播年份、还没有豆瓣编号；30 天内搜过的不再搜（新冒出来的季照搜）。不用搜 → 空数组。 */
export function doubanSeasonsToSearch(type: Pick<TaskType, 'id'> | null | undefined, item: Pick<LibraryItem, 'name' | 'fields'>, now: number = Date.now()): number[] {
  if (!isSeasonHost(type, item)) return [];
  const d = readDoubanSeasons(item.fields);
  const at = d.at ? Date.parse(d.at) : NaN;
  const fresh = Number.isFinite(at) && now - at <= DOUBAN_SEASONS_MAX_AGE_MS && at - now <= 24 * 3600 * 1000;
  const tried = new Set(fresh ? d.tried : []);
  return seasonsOf(type, item)
    .filter((s) => s.number > 0 && !!s.year && !d.ids[String(s.number)] && !tried.has(s.number))
    .map((s) => s.number);
}

/**
 * 从豆瓣搜索结果里给各季配编号：结果名去掉季标记后要和剧名（或原名）一样，季号对得上，
 * 年份和 TMDB 那一季的首播年份差不超过一年；同一季配上两个不同的编号就都不要。已经用掉的编号不再配。
 * 名字里不写季、但这部剧只有一季、年份完全一样的，算第 1 季。
 */
export function matchDoubanSeasons(item: Pick<LibraryItem, 'name' | 'fields'>, seasons: readonly Pick<SeasonInfo, 'number' | 'year'>[], want: readonly number[], results: readonly Pick<LookupResult, 'source' | 'sourceId' | 'name' | 'subtitle' | 'year' | 'fields'>[]): Record<number, string> {
  const used = doubanSeasonIds(item.fields);
  const wanted = new Set(want);
  const real = seasons.filter((s) => s.number > 0);
  const found = new Map<number, Set<string>>();
  for (const r of results) {
    if (r.source !== 'douban' || used.has(r.sourceId)) continue;
    let ref = doubanSeasonOfResult(r);
    if (!ref && real.length === 1 && r.fields.kind === '剧集' && DOUBAN_ID.test(r.sourceId)) // i18n-ignore 选项值（数据）
      ref = { doubanId: r.sourceId, season: 1, base: r.name.trim(), ...(r.subtitle ? { alt: r.subtitle.trim() } : {}), ...(r.year ? { year: r.year } : {}), implicit: true };
    if (!ref || !wanted.has(ref.season)) continue;
    const s = real.find((x) => x.number === ref!.season);
    // 这里一定要有年份：搜出来的东西只有名字对上不够
    if (!s?.year || !ref.year) continue;
    if (seasonHostScore(item, ref) === 0) continue;
    found.set(ref.season, (found.get(ref.season) ?? new Set()).add(ref.doubanId));
  }
  const out: Record<number, string> = {};
  const taken = new Set<string>();
  for (const [season, ids] of found) {
    if (ids.size !== 1) continue;
    const id = [...ids][0]!;
    if (taken.has(id)) continue;
    taken.add(id);
    out[season] = id;
  }
  return out;
}

/** 自动搜完记下来：配上的编号写进 ids，搜过的季记进 tried，时间是这次。30 天前的 tried 先清掉。 */
export function recordDoubanSearch(fields: Record<string, FieldValue>, searched: readonly number[], matched: Record<number, string>, now: Date = new Date()): Record<string, FieldValue> {
  const d = readDoubanSeasons(fields);
  const at = d.at ? Date.parse(d.at) : NaN;
  const keepTried = Number.isFinite(at) && now.getTime() - at <= DOUBAN_SEASONS_MAX_AGE_MS;
  const used = new Set(Object.values(d.ids));
  for (const [k, id] of Object.entries(matched)) if (!d.ids[k] && !used.has(id)) d.ids[k] = id;
  d.tried = [...new Set([...(keepTried ? d.tried : []), ...searched])];
  d.at = now.toISOString();
  return putStored(fields, d);
}

/** 合并后各季豆瓣编号：target 的优先，其次各 source 自己记着的，最后是并进来的单季。 */
export function mergedDoubanSeasons(target: Pick<LibraryItem, 'fields'>, others: readonly Pick<LibraryItem, 'fields'>[], absorbed: readonly DoubanSeasonRef[]): string | null {
  const d = readDoubanSeasons(target.fields);
  const used = new Set(Object.values(d.ids));
  const add = (season: string, id: string) => {
    if (d.ids[season] || used.has(id)) return;
    d.ids[season] = id;
    used.add(id);
  };
  for (const o of others) for (const [k, id] of Object.entries(readDoubanSeasons(o.fields).ids)) add(k, id);
  for (const a of absorbed) add(String(a.season), a.doubanId);
  return encodeDoubanSeasons(d);
}
