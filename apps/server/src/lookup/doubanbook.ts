/**
 * 豆瓣读书（书，尽力而为，Rei 2026-11-09）：没有公开 API，不用登录。
 * - 搜索：网页里的建议接口 book.douban.com/j/subject_suggest?q=…（书名、作者、年份、小封面、编号，最多 5 条左右）。
 * - 详情：先解析 book.douban.com/subject/<id>/ 页面的 #info（作者、译者、出版社、副标题、原作名、出版年、页数、ISBN）和封面；
 *   页面被跳去验证页时，改用手机版 JSON m.douban.com/rexxar/api/v2/book/<id>（同样的字段，但没有 ISBN）。
 * - 按 ISBN：book.douban.com/isbn/<isbn>/ 会 301 到 /subject/<id>/，跟过去再解析。
 * 2026-11-09 沙箱实测：建议接口、subject 页面、ISBN 跳转、手机版 JSON 都是 200；封面在 img*.doubanio.com，
 * 不带 Referer 返回 418（被拒），带 Referer 能拿到（拉进 R2 时带上，同影视海报）。
 * 被跳去 sec.douban.com 验证页、403、418 都算「blocked」：搜索里静静降级，不影响 Open Library。
 * 编号空间和豆瓣电影不同，所以单独一个来源 doubanbook，资料来源记成「doubanbook:<id>」。
 */
import { LookupError, decodeEntities, upstream, yearOf, type LookupResult } from './types';

const LABEL = '豆瓣读书';
const BASE = 'https://book.douban.com';
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  referer: `${BASE}/`,
  'accept-language': 'zh-CN,zh;q=0.9',
};

const blocked = () => new LookupError(502, '502 错误网关：豆瓣读书拒绝了这次请求（要验证），先用别的来源', 'blocked');

async function get(url: string): Promise<Response> {
  const res = await upstream(LABEL, url, { headers: HEADERS, redirect: 'manual' });
  if ((res.status >= 300 && res.status < 400) || res.status === 403 || res.status === 418) throw blocked();
  if (res.status === 404) throw new LookupError(404, '404 未找到：豆瓣读书上没有这一本');
  if (!res.ok) throw new LookupError(502, `502 错误网关：豆瓣读书返回 ${res.status}`);
  return res;
}

/** 封面小图 /view/subject/s/ → 中图 m、大图 l。 */
const cover = (u: string, size: 'm' | 'l') => u.replace(/\/view\/subject\/[sml]\//, `/view/subject/${size}/`).replace(/^http:/, 'https:');
const url = (id: string) => `${BASE}/subject/${id}/`;
/** 豆瓣的默认封面（没有封面的书）：不算封面。 */
const realCover = (u: string | undefined) => (u && /doubanio\.com\//.test(u) && !/book-default/.test(u) ? u : undefined);

interface Suggest {
  id?: string;
  title?: string;
  author_name?: string;
  year?: string;
  pic?: string;
  type?: string;
}

export async function searchDoubanBook(q: string): Promise<LookupResult[]> {
  const res = await get(`${BASE}/j/subject_suggest?q=${encodeURIComponent(q)}`);
  let list: Suggest[];
  try {
    list = (await res.json()) as Suggest[];
  } catch {
    throw new LookupError(502, '502 错误网关：豆瓣读书返回的不是 JSON', 'blocked');
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter((x) => x.id && /^\d+$/.test(x.id) && x.title && (x.type ?? 'b') === 'b')
    .slice(0, 6)
    .map((x) => {
      const year = yearOf(x.year);
      const author = decodeEntities(x.author_name?.trim() ?? '');
      const fields: LookupResult['fields'] = {};
      if (author) fields.author = author;
      if (year) fields.year = year;
      const pic = realCover(x.pic);
      return {
        source: 'doubanbook' as const,
        sourceId: x.id!,
        name: decodeEntities(x.title!.trim()),
        ...(year ? { year } : {}),
        ...(pic ? { thumb: cover(pic, 'm'), image: cover(pic, 'l') } : {}),
        ...(author ? { subtitle: author } : {}),
        fields,
        url: url(x.id!),
      };
    });
}

export interface BookInfo {
  title: string;
  subtitle?: string;
  original?: string;
  authors: string[];
  translators: string[];
  publisher?: string;
  year?: number;
  pages?: number;
  isbn?: string;
  pic?: string;
}

/** 作者 / 译者一栏：「[美] 斯科特·菲茨杰拉德 / 邓若虚」→ 拆成几个人。 */
const people = (s: string) =>
  s
    .split(/\s+\/\s+|\s*、\s*/)
    .map((x) => x.trim())
    .filter(Boolean);

const pagesOf = (s: string | undefined) => {
  const n = Number(/\d+/.exec(s ?? '')?.[0]);
  return n > 0 && n < 100000 ? n : undefined;
};

/** 统一成结果：书名只放正题名；候选下面那一行写「副标题 · 原作名 · 作者，译者 译 · 出版社」（书籍类型没有译者、原作名字段，只放这一行）。 */
export function bookResult(id: string, b: BookInfo): LookupResult {
  const fields: LookupResult['fields'] = {};
  const author = b.authors.join(' / ');
  if (author) fields.author = author;
  if (b.publisher) fields.publisher = b.publisher;
  if (b.year) fields.year = b.year;
  if (b.isbn) fields.isbn = b.isbn;
  if (b.pages) fields.total_pages = b.pages;
  const by = [author, b.translators.length ? `${b.translators.join(' / ')} 译` : ''].filter(Boolean).join('，');
  const sub = [b.subtitle ?? '', b.original && b.original !== b.title ? b.original : '', by, b.publisher ?? ''].filter(Boolean).join(' · ');
  const pic = realCover(b.pic);
  return {
    source: 'doubanbook',
    sourceId: id,
    name: b.title,
    ...(b.year ? { year: b.year } : {}),
    ...(pic ? { image: cover(pic, 'l'), thumb: cover(pic, 'm') } : {}),
    ...(sub ? { subtitle: sub } : {}),
    fields,
    url: url(id),
  };
}

const text = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** 解析 subject 页面（导出给测试用 fixture 测）。 */
export function parseDoubanBookSubject(id: string, html: string): LookupResult {
  const title = /property="v:itemreviewed"[^>]*>([^<]+)</.exec(html)?.[1] ?? /<title>\s*([\s\S]*?)\s*\(豆瓣\)\s*<\/title>/.exec(html)?.[1];
  const infoAt = html.indexOf('id="info"');
  if (!title || infoAt < 0) throw new LookupError(502, '502 错误网关：豆瓣读书页面读不懂（可能是验证页）', 'blocked');
  const infoEnd = html.indexOf('</div>', infoAt);
  const info = html.slice(html.indexOf('>', infoAt) + 1, infoEnd < 0 ? undefined : infoEnd);
  // 每一项是「<span class="pl">标签:</span> 值<br>」，作者 / 译者外面还包一层 <span>
  const row: Record<string, string> = {};
  for (const seg of info.split(/<br\s*\/?>/i)) {
    const t = text(seg);
    const m = /^([^:：]{1,8})\s*[:：]\s*(.*)$/.exec(t);
    if (m && !row[m[1]!.trim()]) row[m[1]!.trim()] = m[2]!.trim();
  }
  const isbn = (row.ISBN ?? '').replace(/[\s-]/g, '').toUpperCase();
  const pic = /<div id="mainpic"[\s\S]*?<img[^>]+src="([^"]+)"/.exec(html)?.[1];
  return bookResult(id, {
    title: decodeEntities(title.trim()),
    ...(row['副标题'] ? { subtitle: row['副标题'] } : {}),
    ...(row['原作名'] ? { original: row['原作名'] } : {}),
    authors: people(row['作者'] ?? ''),
    translators: people(row['译者'] ?? ''),
    ...(row['出版社'] ? { publisher: row['出版社'] } : {}),
    ...(yearOf(row['出版年']) ? { year: yearOf(row['出版年'])! } : {}),
    ...(pagesOf(row['页数']) ? { pages: pagesOf(row['页数'])! } : {}),
    ...(/^(\d{9}[\dX]|\d{13})$/.test(isbn) ? { isbn } : {}),
    ...(pic ? { pic } : {}),
  });
}

interface Rexxar {
  title?: string;
  subtitle?: string[];
  book_subtitle?: string;
  author?: string[];
  translator?: string[];
  press?: string[];
  pubdate?: string[];
  pages?: string[];
  pic?: { large?: string; normal?: string };
  cover_url?: string;
}

/** 解析手机版 JSON（没有 ISBN、原作名；导出给测试用）。 */
export function parseDoubanBookRexxar(id: string, d: Rexxar): LookupResult {
  if (!d.title) throw new LookupError(502, '502 错误网关：豆瓣读书返回的内容读不懂', 'blocked');
  const subtitle = d.book_subtitle?.trim() || d.subtitle?.[0]?.trim();
  const year = yearOf(d.pubdate?.[0]);
  const pages = pagesOf(d.pages?.[0]);
  const pic = d.pic?.large ?? d.cover_url ?? d.pic?.normal;
  return bookResult(id, {
    title: d.title,
    ...(subtitle ? { subtitle } : {}),
    authors: (d.author ?? []).map((x) => x.trim()).filter(Boolean),
    translators: (d.translator ?? []).map((x) => x.trim()).filter(Boolean),
    ...(d.press?.[0]?.trim() ? { publisher: d.press[0].trim() } : {}),
    ...(year ? { year } : {}),
    ...(pages ? { pages } : {}),
    ...(pic ? { pic } : {}),
  });
}

async function rexxar(id: string): Promise<LookupResult> {
  const res = await upstream(LABEL, `https://m.douban.com/rexxar/api/v2/book/${id}`, { headers: { ...HEADERS, referer: 'https://m.douban.com/book/' }, redirect: 'manual' });
  if (res.status === 404) throw new LookupError(404, '404 未找到：豆瓣读书上没有这一本');
  if (!res.ok) throw blocked();
  let d: Rexxar;
  try {
    d = (await res.json()) as Rexxar;
  } catch {
    throw new LookupError(502, '502 错误网关：豆瓣读书返回的不是 JSON', 'blocked');
  }
  return parseDoubanBookRexxar(id, d);
}

export async function doubanBookItem(id: string): Promise<LookupResult> {
  if (!/^\d{4,12}$/.test(id)) throw new LookupError(400, '400 请求有误：豆瓣读书编号是一串数字');
  try {
    const res = await get(url(id));
    return parseDoubanBookSubject(id, await res.text());
  } catch (e) {
    if (e instanceof LookupError && e.status === 404) throw e;
    return rexxar(id);
  }
}

/** 按 ISBN（已去掉连字符、校验过）：/isbn/<isbn>/ 301 到 /subject/<id>/。 */
export async function doubanBookByIsbn(isbn: string): Promise<LookupResult> {
  const res = await upstream(LABEL, `${BASE}/isbn/${isbn}/`, { headers: HEADERS, redirect: 'manual' });
  if (res.status === 404) throw new LookupError(404, '404 未找到：豆瓣读书上没有这个 ISBN');
  const id = /^https:\/\/book\.douban\.com\/subject\/(\d{4,12})\/?$/.exec(res.headers.get('location') ?? '')?.[1];
  if (res.status >= 300 && res.status < 400 && id) {
    const r = await doubanBookItem(id);
    return r.fields.isbn ? r : { ...r, fields: { ...r.fields, isbn } };
  }
  if (res.ok) {
    // 少数情况直接给页面：从页面里找编号
    const html = await res.text();
    const pid = /book\.douban\.com\/subject\/(\d{4,12})\//.exec(html)?.[1];
    if (pid) return parseDoubanBookSubject(pid, html);
  }
  throw blocked();
}
