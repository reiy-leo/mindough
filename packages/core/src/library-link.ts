/**
 * 资料之间的关联（Rei 2026-11-14 影人库，docs/FILM-PEOPLE.md）：library_link 表一行一对「资料 → 资料」，带一句角色。
 * 现在只用在影人 ↔ 影片（from_item = 影人，to_item = 影片）。Rei 定的：影人手动加，和影片的关联也手动连，
 * 不按 TMDB 演职员表自动匹配，也不列 TMDB 上的「其它作品」。
 *
 * - 行 id 由这一对算出（同 task-refs 的 pairId），两台设备各自连同一对得到同一行，按 LWW 合并；
 *   断开 = 墓碑，再连上 = 同一行翻回来（角色换成这次填的）。
 * - 角色是随手写的一句：「导演」「主演·饰某某」「编剧」，可空；首尾空白去掉、连续空白并成一个，最多 80 个字。
 * - 资料合并过：读的时候两端都顺着 merged_into 找到留下的那条（Store.libraryLinks），同一对只留最新那行。
 * 这里只放纯函数，读写在 Store（libraryLinks / linksFromItem / linksToItem / linkLibraryItems …）。
 */
import { pairId } from './task-refs';
import type { FieldValue, LibraryItem, LibraryLink } from './types';

/** 一对资料的关联行 id（有方向：from → to）。 */
export const libraryLinkId = (fromItem: string, toItem: string) => pairId('library_link', fromItem, toItem);

export const ROLE_MAX = 80;

/** 角色整理：首尾空白去掉、换行和连续空白并成一个空格，最多 80 个字。 */
export function cleanRole(role: string | null | undefined): string {
  return [...(role ?? '').replace(/\s+/g, ' ').trim()].slice(0, ROLE_MAX).join('').trim();
}

/** 影片的年份（影视资料的「年份」字段）；没填、不是数字 = null。 */
export function itemYear(item: Pick<LibraryItem, 'fields'> | null | undefined): number | null {
  const v: FieldValue | undefined = item?.fields?.year;
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{4}$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isFinite(n) ? n : null;
}

const byCreated = (a: Pick<LibraryLink, 'created_at' | 'id'>, b: Pick<LibraryLink, 'created_at' | 'id'>) =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * 影人的「作品」：按影片年份排，新的在前（我定的，同豆瓣、IMDb 的作品表）；没填年份的排最后，
 * 同一年的按片名，再按连上的先后。
 */
export function sortFilmography<T extends { link: Pick<LibraryLink, 'created_at' | 'id'>; item: Pick<LibraryItem, 'fields' | 'name'> }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const ya = itemYear(a.item);
    const yb = itemYear(b.item);
    if (ya !== yb) return ya === null ? 1 : yb === null ? -1 : yb - ya;
    const n = a.item.name.localeCompare(b.item.name, 'zh');
    return n || byCreated(a.link, b.link);
  });
}

/** 影片的「主创」：按 sort（连上的先后），一样时按连上的时间。 */
export function sortCredits<T extends { link: Pick<LibraryLink, 'sort' | 'created_at' | 'id'> }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.link.sort - b.link.sort || byCreated(a.link, b.link));
}
