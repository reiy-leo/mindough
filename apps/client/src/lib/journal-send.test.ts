// @vitest-environment happy-dom
/** 日记带图片发送（Rei 2026-10-29）：先建条目，再把图片挂到 post.id 上；只要图片。 */
import { describe, expect, it } from 'vitest';
import { MemoryAdapter, Store } from '@mindough/core';
import { pickImages, sendJournalPost } from './journal-send';
import { memoryQueue, setPendingQueue } from './attachments-queue';
import './i18n';

const file = (name: string, type: string, size = 3) => new File([new Uint8Array(size)], name, { type });

describe('pickImages', () => {
  it('只留图片；别的文件、太大的分开报', () => {
    const big = file('大.png', 'image/png');
    Object.defineProperty(big, 'size', { value: 60 * 1024 * 1024 });
    const r = pickImages([file('a.png', 'image/png'), file('b.pdf', 'application/pdf'), big, file('c.jpg', 'image/jpeg')]);
    expect(r.images.map((f) => f.name)).toEqual(['a.png', 'c.jpg']);
    expect(r.notImage).toEqual(['b.pdf']);
    expect(r.tooBig).toEqual(['大.png']);
  });
});

describe('sendJournalPost', () => {
  const open = () => Store.open(new MemoryAdapter(), { deviceId: 'dev1', now: () => new Date(2026, 9, 29, 10) });

  it('有图片：建条目后挂到 post.id（日子是条目的那天）', async () => {
    const s = await open();
    const calls: Array<{ owner: unknown; n: number }> = [];
    const r = await sendJournalPost(s, { body: '午饭', mood: 'happy', images: [file('a.png', 'image/png'), file('b.png', 'image/png')] }, async (_s, owner, files) => {
      calls.push({ owner, n: files.length });
      return { tooBig: [] };
    });
    expect(r?.post).toMatchObject({ body_md: '午饭', mood: 'happy', day: '2026-10-29' });
    expect(calls).toEqual([{ owner: { type: 'journal', id: r!.post.id, date: '2026-10-29' }, n: 2 }]);
  });

  it('只有图片也能发；什么都没有不发、不挂附件', async () => {
    const s = await open();
    let called = 0;
    const add = async () => (called++, { tooBig: [] });
    expect(await sendJournalPost(s, { body: '', mood: null, images: [file('a.png', 'image/png')] }, add)).toMatchObject({ post: { body_md: '', mood: null } });
    expect(called).toBe(1);
    expect(await sendJournalPost(s, { body: '  ', mood: null, images: [] }, add)).toBeNull();
    expect(called).toBe(1);
  });

  it('没图片：不调 addAttachments', async () => {
    const s = await open();
    let called = 0;
    const r = await sendJournalPost(s, { body: '早', mood: null, images: [] }, async () => (called++, { tooBig: [] }));
    expect(r?.tooBig).toEqual([]);
    expect(called).toBe(0);
  });

  it('用真的 addAttachments：附件挂在条目上，不给那天补旧日记', async () => {
    setPendingQueue(memoryQueue());
    const s = await open();
    const r = await sendJournalPost(s, { body: '', mood: null, images: [file('a.png', 'image/png')] });
    expect(s.attachmentsOfPost(r!.post).map((a) => a.file_name)).toEqual(['a.png']);
    expect(s.postAttachmentOwnerId(r!.post)).toBe(r!.post.id);
    expect(s.list('journal_entry')).toEqual([]);
  });
});
