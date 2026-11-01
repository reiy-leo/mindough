/**
 * 发一条日记，带上图片（Rei 2026-10-29「日记的工具栏保留图标，限制只能是图片」）。
 * 图片走附件：先建 journal_post，再把图片挂到 post.id 上（addAttachments，进本机队列慢慢传）。
 * 附件要等条目建好才有 owner，所以输入框里的图片先放在「待发」里，发送时才交给这里。
 */
import { tooLarge, type JournalPost, type MoodId, type Store } from '@mindough/core';
import { addAttachments, type AddResult } from './attachments';

/** 选进来 / 粘进来的文件里，哪些能当日记图片：只要图片，太大的不要。 */
export function pickImages(files: readonly File[]): { images: File[]; notImage: string[]; tooBig: string[] } {
  const images: File[] = [];
  const notImage: string[] = [];
  const tooBig: string[] = [];
  for (const f of files) {
    if (!f.type.startsWith('image/')) notImage.push(f.name);
    else if (tooLarge(f.size)) tooBig.push(f.name);
    else images.push(f);
  }
  return { images, notImage, tooBig };
}

type Add = (store: Store, owner: { type: 'journal'; id: string; date: string }, files: readonly File[]) => Promise<Pick<AddResult, 'tooBig'>>;

/**
 * 发送：正文、心情、图片三样都没有就不发（返回 null）。有图片就挂到新条目上。
 * 返回新条目和没加上的（太大的）文件名。
 */
export async function sendJournalPost(store: Store, input: { body: string; mood: MoodId | null; images: readonly File[] }, add: Add = addAttachments): Promise<{ post: JournalPost; tooBig: string[] } | null> {
  const post = store.addJournalPost({ body_md: input.body, mood: input.mood, images: input.images.length });
  if (!post) return null;
  if (!input.images.length) return { post, tooBig: [] };
  const r = await add(store, { type: 'journal', id: post.id, date: post.day }, input.images);
  return { post, tooBig: r.tooBig };
}
