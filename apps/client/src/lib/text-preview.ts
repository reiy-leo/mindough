/**
 * 纯文本附件预览的取数和解析（Rei 2026-11-09「附件是.txt文件，点击可以和图片一样预览」「加上.md、.csv吧」）。
 * - 取内容：本机队列里的（刚加、还没传完）→ 本机缓存 → R2 接口。接口那条路边读边数，读够 TEXT_PREVIEW_LIMIT 就停（不把 50 MB 全拉下来）。
 *   Web 同源带 cookie，Tauri 带 Bearer（authInit），和图片原图同一个接口，Worker 不用改。
 * - 解码一律按 UTF-8（去掉 BOM）；前 8 KB 里有 NUL 字节当二进制，不预览，给下载。
 * - csv / tsv 拆成表格：带引号的字段、字段里的换行和逗号都认；行列太多就退回原文。
 */
import type { Attachment } from '@mindough/core';
import { authInit } from './account';
import { attachmentCache } from './attachment-cache';
import { pendingQueue } from './attachments-queue';
import { fileUrl, isOnline } from './attachments';

/** 最多读 1 MB；更大的只显示前 1 MB，提示下载看全部。 */
export const TEXT_PREVIEW_LIMIT = 1024 * 1024;

export type TextLoadResult =
  | { ok: true; text: string; truncated: boolean; size: number }
  | { ok: false; reason: 'missing' | 'offline' | 'binary' | 'failed' };

/** 字节 → 文字。truncated：只拿到了前面一截（最后半个字丢掉，不出乱码）。 */
export function decodeText(bytes: Uint8Array, truncated: boolean): { ok: true; text: string } | { ok: false } {
  const head = bytes.subarray(0, 8192);
  for (let i = 0; i < head.length; i++) if (head[i] === 0) return { ok: false };
  let text = new TextDecoder('utf-8').decode(bytes, { stream: truncated });
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { ok: true, text };
}

/** 读一个流，最多 limit 字节；读够了就把流取消掉。 */
export async function readUpTo(body: ReadableStream<Uint8Array>, limit: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (n + value.length > limit) {
      parts.push(value.subarray(0, limit - n));
      n = limit;
      truncated = true;
      void reader.cancel().catch(() => {});
      break;
    }
    parts.push(value);
    n += value.length;
    if (n === limit) {
      // 正好读满：后面还有就是截断了
      const next = await reader.read();
      if (!next.done && next.value?.length) {
        truncated = true;
        void reader.cancel().catch(() => {});
      }
      break;
    }
  }
  const bytes = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    bytes.set(p, o);
    o += p.length;
  }
  return { bytes, truncated };
}

async function fromBlob(b: Blob, limit: number): Promise<TextLoadResult> {
  const truncated = b.size > limit;
  const bytes = new Uint8Array(await (truncated ? b.slice(0, limit) : b).arrayBuffer());
  const d = decodeText(bytes, truncated);
  return d.ok ? { ok: true, text: d.text, truncated, size: b.size } : { ok: false, reason: 'binary' };
}

/** 取附件的文字内容（最多 limit 字节）。 */
export async function loadAttachmentText(a: Attachment, limit = TEXT_PREVIEW_LIMIT, fetcher: typeof fetch = fetch): Promise<TextLoadResult> {
  try {
    const p = await pendingQueue().get(a.id);
    if (p) return fromBlob(p.file, limit);
    const cached = await attachmentCache().get(a);
    if (cached) return fromBlob(cached, limit);
  } catch {
    // 本机库打不开：走网络
  }
  if (!a.r2_key) return { ok: false, reason: 'missing' };
  if (!isOnline()) return { ok: false, reason: 'offline' };
  try {
    const r = await fetcher(fileUrl(a.r2_key), authInit());
    if (!r.ok) return { ok: false, reason: r.status === 404 ? 'missing' : 'failed' };
    if (!r.body) return fromBlob(await r.blob(), limit);
    const { bytes, truncated } = await readUpTo(r.body, limit);
    const d = decodeText(bytes, truncated);
    if (!d.ok) return { ok: false, reason: 'binary' };
    return { ok: true, text: d.text, truncated, size: Math.max(a.size || 0, bytes.length) };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** 表格最多显示这么多行、列；超过就退回原文（几千行的表在浮层里也没法看）。 */
export const CSV_MAX_ROWS = 2000;
export const CSV_MAX_COLS = 60;

/**
 * 拆 csv / tsv（RFC 4180 的引号规则：""" 是一个引号，引号里可以有分隔符和换行）。
 * 行数或列数超上限、引号没配上，返回 null（显示原文）。末尾的空行不算。
 */
export function parseDelimited(text: string, sep: ',' | '\t', maxRows = CSV_MAX_ROWS, maxCols = CSV_MAX_COLS): string[][] | null {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const endRow = () => {
    row.push(field);
    field = '';
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else field += c;
      i++;
      continue;
    }
    if (c === '"' && field === '') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = '';
      if (row.length > maxCols) return null;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
      if (rows.length > maxRows) return null;
    } else field += c;
    i++;
  }
  if (quoted) return null;
  if (field !== '' || row.length) endRow();
  while (rows.length && rows[rows.length - 1]!.every((f) => f === '')) rows.pop();
  if (rows.length > maxRows || rows.some((r) => r.length > maxCols)) return null;
  return rows;
}
