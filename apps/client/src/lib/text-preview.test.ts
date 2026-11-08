// @vitest-environment happy-dom
/**
 * 纯文本附件预览的取数和解析（Rei 2026-11-09）：UTF-8 解码、1 MB 截断、二进制不预览、本机优先、csv 拆表。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Attachment } from '@mindough/core';
import { memoryQueue, pendingQueue, setPendingQueue } from './attachments-queue';
import { AttachmentCache, memoryBackend, setAttachmentCache } from './attachment-cache';
import { decodeText, loadAttachmentText, parseDelimited, readUpTo } from './text-preview';

const enc = (s: string) => new TextEncoder().encode(s);
const stream = (chunks: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const x of chunks) c.enqueue(x);
      c.close();
    },
  });
const att = (over: Partial<Attachment> = {}) => ({ id: 'a1', file_name: 'a.txt', mime: 'text/plain', size: 5, r2_key: 'k/f/x', thumb_key: null, ...over }) as Attachment;

beforeEach(() => {
  setPendingQueue(memoryQueue());
  setAttachmentCache(new AttachmentCache({ backend: memoryBackend(), kv: { getItem: () => null, setItem: () => {} }, now: () => 0 }));
});

describe('decodeText', () => {
  it('UTF-8，去掉 BOM', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...enc('你好')]), false)).toEqual({ ok: true, text: '你好' });
  });
  it('截断时最后半个字丢掉，不出乱码', () => {
    const b = enc('你好');
    const r = decodeText(b.subarray(0, 4), true);
    expect(r).toEqual({ ok: true, text: '你' });
  });
  it('有 NUL 字节当二进制', () => {
    expect(decodeText(new Uint8Array([0x50, 0x4b, 0, 0]), false).ok).toBe(false);
  });
});

describe('readUpTo', () => {
  it('不够上限：全读，不截断', async () => {
    const r = await readUpTo(stream([enc('ab'), enc('cd')]), 10);
    expect(new TextDecoder().decode(r.bytes)).toBe('abcd');
    expect(r.truncated).toBe(false);
  });
  it('超过上限：读到上限为止、取消流', async () => {
    const r = await readUpTo(stream([enc('abc'), enc('defg'), enc('hij')]), 5);
    expect(new TextDecoder().decode(r.bytes)).toBe('abcde');
    expect(r.truncated).toBe(true);
  });
  it('正好读满：后面没了不算截断，还有就算', async () => {
    expect((await readUpTo(stream([enc('abc'), enc('de')]), 5)).truncated).toBe(false);
    expect((await readUpTo(stream([enc('abcde'), enc('f')]), 5)).truncated).toBe(true);
  });
});

describe('loadAttachmentText', () => {
  it('从接口取（带鉴权的同一个文件地址），超过上限只读前面', async () => {
    const fetcher = vi.fn(async () => new Response(stream([enc('hello world')])));
    const r = await loadAttachmentText(att({ size: 11 }), 5, fetcher as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, text: 'hello', truncated: true, size: 11 });
    expect(String((fetcher.mock.calls[0] as unknown[])[0])).toContain('/api/files/k/f/x');
  });
  it('本机队列里有（还没传完）：用本机的，不走网络', async () => {
    await pendingQueue().put({ id: 'a1', file: new Blob(['本机']), thumb: null, added_at: 0 });
    const fetcher = vi.fn();
    const r = await loadAttachmentText(att({ r2_key: null }), 1024, fetcher as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: true, text: '本机', truncated: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('没传上来 / 404 / 出错 / 二进制', async () => {
    expect(await loadAttachmentText(att({ r2_key: null }))).toEqual({ ok: false, reason: 'missing' });
    expect(await loadAttachmentText(att(), 10, (async () => new Response('x', { status: 404 })) as unknown as typeof fetch)).toEqual({ ok: false, reason: 'missing' });
    expect(await loadAttachmentText(att(), 10, (async () => new Response('x', { status: 500 })) as unknown as typeof fetch)).toEqual({ ok: false, reason: 'failed' });
    expect(await loadAttachmentText(att(), 10, (async () => { throw new Error('net'); }) as unknown as typeof fetch)).toEqual({ ok: false, reason: 'failed' });
    expect(await loadAttachmentText(att(), 10, (async () => new Response(new Uint8Array([1, 0, 2]))) as unknown as typeof fetch)).toEqual({ ok: false, reason: 'binary' });
  });
});

describe('parseDelimited', () => {
  it('引号里的逗号、换行、双引号', () => {
    expect(parseDelimited('名字,备注\n"张,三","说 ""你好""\n第二行"\r\n李四,\n\n', ',')).toEqual([
      ['名字', '备注'],
      ['张,三', '说 "你好"\n第二行'],
      ['李四', ''],
    ]);
  });
  it('tsv', () => {
    expect(parseDelimited('a\tb\n1\t2', '\t')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
  it('行列太多、引号没配上：null（显示原文）', () => {
    expect(parseDelimited('a\nb\nc\nd', ',', 3)).toBeNull();
    expect(parseDelimited('a,b,c,d', ',', 10, 3)).toBeNull();
    expect(parseDelimited('"a,b', ',')).toBeNull();
  });
});
