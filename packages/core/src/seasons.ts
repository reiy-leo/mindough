/**
 * 剧集的季（Rei 2026-11-11「影视库里的剧集显示 seasons」）：影视库里的剧集在资料页列出各季
 * （海报小图、第 N 季 / 特别篇、首播年份、集数），数据来自 TMDB（Worker GET /api/lookup/seasons）。
 * - 存在资料的保留键 `_seasons`（JSON 文字），跟着资料同步，不加列；打开资料页不每次都拉：
 *   没有、来源换了、或者超过 30 天才补拉一次。
 * - 只认 TMDB 剧集编号（来源「tmdb:tv/1399」）或 IMDb 编号；只有豆瓣编号的剧集不显示季。
 * - 电影不显示；只显示，不记每季看到哪（看到哪还是任务上的 episode 字段）。
 */
import { BUILTIN_TYPE_IDS } from './seed/builtin-types';
import { sourceOfFields } from './lookup';
import { tr } from './i18n';
import type { FieldValue, LibraryItem, TaskType } from './types';

export const SEASONS_KEY = '_seasons';
/** 存下来的季多久算旧（播出中的剧会加季）。 */
export const SEASONS_MAX_AGE_MS = 30 * 24 * 3600 * 1000;

/** Worker 返回的一季。number 0 是特别篇。 */
export interface SeasonInfo {
  number: number;
  name?: string;
  year?: number;
  episodes: number;
  /** TMDB 图片路径（/abc.jpg）。 */
  poster?: string;
}

export interface SeasonsResponse {
  tv: string | null;
  seasons: SeasonInfo[];
}

/** 存在 `_seasons` 里的样子。ref：按什么编号拉的（来源变了就重拉）；at：拉的时间（ISO）。 */
export interface StoredSeasons {
  v: 1;
  ref: string;
  tv: string | null;
  at: string;
  seasons: SeasonInfo[];
}

/** 这条资料是不是剧集：影视库里「电影/剧集」填了剧集，或者没填但来源是 TMDB 的剧集。 */
export function isShowItem(type: Pick<TaskType, 'id'> | null | undefined, item: Pick<LibraryItem, 'fields'>): boolean {
  if (!type || type.id !== BUILTIN_TYPE_IDS.movie) return false;
  const kind = item.fields.kind;
  if (kind === '剧集') return true;
  if (kind === '电影') return false;
  const src = sourceOfFields(item.fields);
  return src?.source === 'tmdb' && src.sourceId.startsWith('tv/');
}

/** 拉季要用的编号：TMDB 剧集编号优先，其次 IMDb 编号；都没有 → null（不显示季）。 */
export function seasonsRef(type: Pick<TaskType, 'id'> | null | undefined, item: Pick<LibraryItem, 'fields'>): string | null {
  if (!isShowItem(type, item)) return null;
  const src = sourceOfFields(item.fields);
  if (src?.source === 'tmdb' && /^tv\/\d+$/.test(src.sourceId)) return src.sourceId;
  const imdb = item.fields.imdb;
  if (typeof imdb === 'string' && /^tt\d{7,10}$/i.test(imdb.trim())) return imdb.trim().toLowerCase();
  return null;
}

function cleanSeason(x: unknown): SeasonInfo | null {
  if (!x || typeof x !== 'object') return null;
  const s = x as Record<string, unknown>;
  if (typeof s.number !== 'number' || !Number.isInteger(s.number) || s.number < 0) return null;
  const out: SeasonInfo = { number: s.number, episodes: typeof s.episodes === 'number' && s.episodes > 0 ? Math.floor(s.episodes) : 0 };
  if (typeof s.name === 'string' && s.name.trim()) out.name = s.name.trim().slice(0, 120);
  if (typeof s.year === 'number' && s.year > 1800 && s.year < 3000) out.year = s.year;
  if (typeof s.poster === 'string' && /^\/[\w-]+\.(jpg|jpeg|png|webp)$/i.test(s.poster)) out.poster = s.poster;
  return out;
}

/** 读 `_seasons`；坏了、旧格式都当没有。 */
export function readSeasons(fields: Record<string, FieldValue> | null | undefined): StoredSeasons | null {
  const raw = fields?.[SEASONS_KEY];
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<StoredSeasons>;
    if (d?.v !== 1 || typeof d.ref !== 'string' || typeof d.at !== 'string' || !Array.isArray(d.seasons)) return null;
    const seasons = d.seasons.map(cleanSeason).filter((s): s is SeasonInfo => !!s);
    return { v: 1, ref: d.ref, tv: typeof d.tv === 'string' ? d.tv : null, at: d.at, seasons };
  } catch {
    return null;
  }
}

/** 写成 `_seasons` 的值。 */
export function encodeSeasons(ref: string, res: SeasonsResponse, at: Date = new Date()): string {
  const seasons = (res.seasons ?? []).map(cleanSeason).filter((s): s is SeasonInfo => !!s);
  const data: StoredSeasons = { v: 1, ref, tv: res.tv ?? null, at: at.toISOString(), seasons };
  return JSON.stringify(data);
}

/** 要不要（补）拉：是剧集、有编号，而且没存过、编号换了、或存了超过 30 天。 */
export function needsSeasonsFetch(type: Pick<TaskType, 'id'> | null | undefined, item: Pick<LibraryItem, 'fields'>, now: number = Date.now()): string | null {
  const ref = seasonsRef(type, item);
  if (!ref) return null;
  const cur = readSeasons(item.fields);
  if (!cur || cur.ref !== ref) return ref;
  const at = Date.parse(cur.at);
  if (!Number.isFinite(at) || now - at > SEASONS_MAX_AGE_MS || at - now > 24 * 3600 * 1000) return ref;
  return null;
}

/** 显示顺序：第 1 季、第 2 季……特别篇（第 0 季）放最后。 */
export function sortSeasons(list: readonly SeasonInfo[]): SeasonInfo[] {
  return [...list].sort((a, b) => (a.number === 0 ? 1 : 0) - (b.number === 0 ? 1 : 0) || a.number - b.number);
}

/** 资料页要显示的季：编号对得上才算（来源换了、还没重拉的不显示旧的）。 */
export function seasonsOf(type: Pick<TaskType, 'id'> | null | undefined, item: Pick<LibraryItem, 'fields'>): SeasonInfo[] {
  const ref = seasonsRef(type, item);
  if (!ref) return [];
  const cur = readSeasons(item.fields);
  if (!cur || cur.ref !== ref) return [];
  return sortSeasons(cur.seasons);
}

/** TMDB 默认的季名（「第 1 季」「Season 1」「Specials」「特别篇」…）不另外显示。 */
const GENERIC_NAME = /^(第\s*[\d一二三四五六七八九十百]+\s*季|season\s*\d+|specials?|特别篇|特別篇|staffel\s*\d+|saison\s*\d+|temporada\s*\d+|シーズン\s*\d+|сезон\s*\d+|musim\s*\d+)$/i;

/** 季的标题：「第 2 季」，第 0 季叫「特别篇」。 */
export function seasonTitle(s: Pick<SeasonInfo, 'number'>): string {
  return s.number === 0 ? tr('特别篇') : tr('第 {s} 季', { s: s.number });
}

/** TMDB 给这一季起的名字（如「龙之母」），默认的季名不算。 */
export function seasonSubtitle(s: Pick<SeasonInfo, 'number' | 'name'>): string | null {
  const name = s.name?.trim();
  if (!name || GENERIC_NAME.test(name)) return null;
  return name;
}

/** 第二行小字：「2011 · 10 集」；没年份只写集数，集数是 0 不写。 */
export function seasonMeta(s: Pick<SeasonInfo, 'year' | 'episodes'>): string {
  const parts: string[] = [];
  if (s.year) parts.push(String(s.year));
  if (s.episodes > 0) parts.push(tr('{n} 集', { n: s.episodes }));
  return parts.join(' · ');
}

/** 海报小图地址（TMDB w154）。 */
export const seasonPosterUrl = (poster: string | undefined, size: 'w92' | 'w154' | 'w185' = 'w154'): string | null => (poster ? `https://image.tmdb.org/t/p/${size}${poster}` : null);
