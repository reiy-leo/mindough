/**
 * 旧的 data: 图片搬到 R2（Rei 2026-11-21「现在迁移」，docs/PLAN.md「旧 data: 图片搬到 R2」）。
 *
 * 离线或没登录时存的图片是整张塞进行里的 data: 地址。这里只管两件纯数据的事：
 * - 找：所有表、所有没删的行里，哪些字符串里有 data: 图片（整个值就是一张图，或 markdown 正文里夹着的），同一张图只算一次；
 * - 换：把某一张图在所有行里换成 R2 地址（Store.replaceDataImage 用 replaceInValue 逐字段换，别的字一个不动）。
 * 上传、限速、失败重试在客户端（apps/client/src/lib/data-image-migrate.ts）。
 */
import type { BaseRow, TableName } from './types';
import { TABLES } from './types';

/** 服务器收的图片格式（apps/server/src/assets.ts handleAssetUpload），别的传上去也是 415。 */
export const UPLOADABLE_IMAGE_MIME = /^image\/(png|jpeg|gif|webp|avif|svg\+xml|heic|heif)$/;

/** markdown / 文本里夹着的 base64 图片：`![](data:image/png;base64,…)`、`<img src="data:image/…">` 都认。 */
const DATA_IMAGE_IN_TEXT = /data:image\/[a-z0-9.+-]+(?:;[a-z0-9-]+=[^;,()\s"'<>]*)*;base64,[A-Za-z0-9+/]+={0,2}/gi;

/** 整个值就是一张 data: 图片（图片字段、头像、资料封面里直接存的那种）。 */
export const isDataImageValue = (s: unknown): boolean => typeof s === 'string' && /^data:image\//i.test(s);

/** 不看的键：行的身份和时间戳。 */
const SKIP_KEYS = new Set(['id', 'updated_at', 'deleted']);

export interface DataImageRef {
  /** data: 地址原文（替换时按它整段找）。 */
  url: string;
  /** 出现在哪些行（同一行只记一次）。 */
  rows: Array<{ table: TableName; id: string }>;
}

/** 一个字符串里的 data: 图片：整个值是图就是它自己，否则找正文里夹着的。asset.url 是图片行，任何 data: 都算。 */
function imagesInString(s: string, wholeAnyData: boolean): string[] {
  if (!s.includes('data:')) return [];
  if (isDataImageValue(s) || (wholeAnyData && s.startsWith('data:'))) return [s];
  return s.match(DATA_IMAGE_IN_TEXT) ?? [];
}

/** 一行里所有的 data: 图片（按出现顺序，不去重）。 */
export function dataImagesInRow(table: TableName, row: BaseRow): string[] {
  const out: string[] = [];
  const walk = (v: unknown, key: string | null, top: boolean) => {
    if (typeof v === 'string') out.push(...imagesInString(v, top && table === 'asset' && key === 'url'));
    else if (Array.isArray(v)) v.forEach((x) => walk(x, null, false));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k, false);
  };
  for (const [k, v] of Object.entries(row as unknown as Record<string, unknown>)) if (!SKIP_KEYS.has(k)) walk(v, k, true);
  return out;
}

/**
 * 找出库里所有 data: 图片，同一张图（同一段 data: 地址）合并。asset 表的排前面（它们最大、也最可能被云端扣下不推）。
 * 删掉的行（墓碑）、`skip` 说不看的行（草稿任务）不看。
 */
export function collectDataImages(
  rowsOf: (table: TableName) => Iterable<BaseRow>,
  skip: (table: TableName, id: string) => boolean = () => false,
): DataImageRef[] {
  const map = new Map<string, DataImageRef>();
  const order: TableName[] = ['asset', ...TABLES.filter((t) => t !== 'asset')];
  for (const table of order) {
    for (const row of rowsOf(table)) {
      if (row.deleted || skip(table, row.id)) continue;
      for (const url of dataImagesInRow(table, row)) {
        let ref = map.get(url);
        if (!ref) map.set(url, (ref = { url, rows: [] }));
        if (!ref.rows.some((r) => r.table === table && r.id === row.id)) ref.rows.push({ table, id: row.id });
      }
    }
  }
  return [...map.values()];
}

/**
 * 字符串里把 from 换成 to。from 后面紧跟着 base64 字符（或 =）的不算：那是另一张更长的图，只是开头和这张一样
 * （base64 长度正好是 4 的倍数、没有补位时会这样），换了就把那张图弄坏了。
 */
export function replaceDataUrl(s: string, from: string, to: string): string {
  let i = s.indexOf(from);
  if (i < 0) return s;
  let out = '';
  let last = 0;
  while (i >= 0) {
    const next = s.charAt(i + from.length);
    if (!/[A-Za-z0-9+/=]/.test(next)) {
      out += s.slice(last, i) + to;
      last = i + from.length;
    }
    i = s.indexOf(from, i + from.length);
  }
  return last === 0 ? s : out + s.slice(last);
}

/** 把值里所有字符串中的 from 换成 to（对象、数组往里找；边界见 replaceDataUrl）。没变就原样返回同一个引用。 */
export function replaceInValue<T>(v: T, from: string, to: string): T {
  if (typeof v === 'string') return replaceDataUrl(v, from, to) as T;
  if (Array.isArray(v)) {
    let changed = false;
    const next = v.map((x) => {
      const y = replaceInValue(x, from, to);
      if (y !== x) changed = true;
      return y;
    });
    return (changed ? next : v) as T;
  }
  if (v && typeof v === 'object') {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const y = replaceInValue(x, from, to);
      if (y !== x) changed = true;
      next[k] = y;
    }
    return (changed ? next : v) as T;
  }
  return v;
}

/** 看文件头认图片格式（导入时不认识后缀会存成 application/octet-stream）。认不出 null。 */
export function sniffImageMime(b: Uint8Array): string | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (/^(heic|heix|hevc|heim|heis|mif1)$/.test(brand)) return 'image/heic';
  }
  return null;
}

// core 不带 DOM 类型；atob / TextEncoder 浏览器和 Node 18+ 都有
const g = globalThis as unknown as { atob(s: string): string; TextEncoder: new () => { encode(s: string): Uint8Array } };

/** 解 data: 地址（自己写一份，别为它把导入导出那套 yaml / fflate 拉进主包）。 */
function decodeDataUrl(url: string): { mime: string; data: Uint8Array } | null {
  const m = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(url);
  if (!m) return null;
  try {
    if (/;base64/i.test(m[2] ?? '')) {
      const bin = g.atob(m[3]!.replace(/\s+/g, ''));
      const data = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
      return { mime: m[1] || 'text/plain', data };
    }
    return { mime: m[1] || 'text/plain', data: new g.TextEncoder().encode(decodeURIComponent(m[3]!)) };
  } catch {
    return null;
  }
}

/**
 * 把 data: 地址解成图片字节和格式。格式按地址里写的；写的不是图片（application/octet-stream 之类）就看文件头，
 * 再不行用 fallbackMime（asset 行的 mime）。解不开或认不出是图片返回 null。
 */
export function decodeDataImage(url: string, fallbackMime?: string | null): { mime: string; bytes: Uint8Array } | null {
  const d = decodeDataUrl(url);
  if (!d || !d.data.length) return null;
  let mime = d.mime.toLowerCase();
  if (!mime.startsWith('image/')) mime = sniffImageMime(d.data) ?? (fallbackMime?.toLowerCase().startsWith('image/') ? fallbackMime.toLowerCase() : '');
  if (mime === 'image/jpg') mime = 'image/jpeg';
  return mime ? { mime, bytes: d.data } : null;
}
