/**
 * 剪贴板里有图片 / 文件时，任务详情顶栏、日记工具栏出一个按钮，点了走附件（Rei 2026-10-29）。这里是「看剪贴板」的逻辑。
 *
 * - 网页：只在 clipboard-read 权限已经是 granted 时才读（navigator.clipboard.read），只认图片（image/*）。
 *   从不弹授权框：没授权、问不了（Firefox、Safari 不认这个权限名）就当没有，按钮不出。
 * - 桌面 App（Tauri）：图片和文件都认。文件列表和图片签名问 Rust 的 clipboard_peek（src-tauri/src/clipboard.rs），
 *   文件内容用 clipboard_read_file 读，图片用 clipboard-manager 插件的 readImage 读出像素、在这边编成 PNG。
 * - 手机 App：不做，按钮不出。
 * - 什么时候看：挂上时、窗口拿到焦点、页面切回来（visibilitychange）。不轮询。
 * - 加过的内容记下签名（本机 localStorage），同一份内容按钮不再出。
 * 判断逻辑写成纯函数（clipEnv / webImageType / desktopPlan / seen 列表），测试在 clipboard-files.test.ts。
 */
import { useCallback, useEffect, useState } from 'react';
import { isTauri } from '../store/sqlite-tauri';
import { sha256Hex } from './content-hash';

export type ClipEnv = 'web' | 'desktop' | 'none';

/** 这一端能不能看剪贴板、怎么看。 */
export function clipEnv(o: { tauri: boolean; mobileOs: boolean; clipboardRead: boolean; permissions: boolean }): ClipEnv {
  if (o.tauri) return o.mobileOs ? 'none' : 'desktop';
  return o.clipboardRead && o.permissions ? 'web' : 'none';
}

/** 一个剪贴板项里的图片类型（第一个 image/*）。 */
export function webImageType(types: readonly string[]): string | null {
  return types.find((t) => t.startsWith('image/')) ?? null;
}

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'bmp', 'avif', 'svg', 'tif', 'tiff']);
const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/** 路径里的文件名（/ 和 \ 都认）。 */
export function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

const extOf = (name: string) => (/\.([^.]+)$/.exec(name)?.[1] ?? '').toLowerCase();

/** 按扩展名猜 MIME；认不出给空（附件按扩展名认类型）。 */
export function mimeOfName(name: string): string {
  return MIME[extOf(name)] ?? '';
}

/** 图片 MIME 对应的扩展名（剪贴板里的图片没有名字，自己起一个）。 */
export function extOfMime(mime: string): string {
  const sub = mime.split('/')[1]?.split('+')[0]?.toLowerCase() ?? '';
  if (sub === 'jpeg') return 'jpg';
  return IMAGE_EXT.has(sub) ? sub : 'png';
}

export const isImageName = (name: string) => IMAGE_EXT.has(extOf(name));

/** Rust clipboard_peek 的回答。 */
export interface ClipPeek {
  files: string[];
  hasImage: boolean;
  imageSig: string | null;
}

export type DesktopPlan = { kind: 'files'; paths: string[]; sig: string } | { kind: 'image'; sig: string } | null;

/** 桌面：剪贴板里有什么能加。有文件先用文件；只要图片时（日记）只留图片文件。 */
export function desktopPlan(peek: ClipPeek, imagesOnly: boolean): DesktopPlan {
  const paths = imagesOnly ? peek.files.filter((p) => isImageName(baseName(p))) : peek.files;
  if (paths.length) return { kind: 'files', paths, sig: `files:${paths.join('\n')}` };
  if (peek.files.length && imagesOnly) return null; // 复制的是别的文件（顺带的图标图片不算）
  if (peek.hasImage && peek.imageSig) return { kind: 'image', sig: `image:${peek.imageSig}` };
  return null;
}

// ───────── 加过的内容 ─────────

const SEEN_KEY = 'mindough:clipboard_seen';
const SEEN_MAX = 20;

type KV = Pick<Storage, 'getItem' | 'setItem'>;

export function seenList(kv: KV | null): string[] {
  try {
    const v = JSON.parse(kv?.getItem(SEEN_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function isSeen(kv: KV | null, sig: string): boolean {
  return seenList(kv).includes(sig);
}

/** 记下这份内容加过了（最多记 20 条，新的在前）。 */
export function markSeen(kv: KV | null, sig: string): void {
  try {
    const next = [sig, ...seenList(kv).filter((s) => s !== sig)].slice(0, SEEN_MAX);
    kv?.setItem(SEEN_KEY, JSON.stringify(next));
  } catch {
    /* 存不了（隐私模式）：只是按钮会再出 */
  }
}

// ───────── 读剪贴板 ─────────

export interface ClipFound {
  sig: string;
  kind: 'image' | 'files';
  /** 有几样（几张图 / 几个文件） */
  count: number;
  /** 真正读出文件（点按钮时才读，桌面的文件可能很大）。 */
  load: () => Promise<File[]>;
}

interface PermissionsLike {
  query(d: { name: string }): Promise<{ state: string }>;
}
interface ClipboardItemLike {
  types: readonly string[];
  getType(type: string): Promise<Blob>;
}
export interface NavLike {
  permissions?: PermissionsLike;
  clipboard?: { read?: () => Promise<readonly ClipboardItemLike[]> };
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');

/** 网页：权限已经给了才读；只认图片。没给、问不了、读不出都是 null（不弹框）。 */
export async function peekWeb(nav: NavLike, hash: (b: Blob) => Promise<string> = sha256Hex): Promise<ClipFound | null> {
  if (!nav.permissions?.query || !nav.clipboard?.read) return null;
  try {
    const st = await nav.permissions.query({ name: 'clipboard-read' });
    if (st.state !== 'granted') return null;
    const items = await nav.clipboard.read();
    const blobs: Blob[] = [];
    for (const it of items) {
      const t = webImageType(it.types);
      if (t) blobs.push(await it.getType(t));
    }
    if (!blobs.length) return null;
    const sig = `web:${(await Promise.all(blobs.map(hash))).join(',')}`;
    const s = stamp();
    const files = blobs.map((b, i) => new File([b], `clipboard-${s}${blobs.length > 1 ? `-${i + 1}` : ''}.${extOfMime(b.type)}`, { type: b.type }));
    return { sig, kind: 'image', count: files.length, load: async () => files };
  } catch {
    return null;
  }
}

/** RGBA 像素编成 PNG 文件（桌面 readImage 读出来的是像素）。 */
async function rgbaToPng(rgba: Uint8Array, width: number, height: number, name: string): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer as ArrayBuffer, rgba.byteOffset, rgba.byteLength), width, height), 0, 0);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');
  return new File([blob], name, { type: 'image/png' });
}

/** 桌面 App：问 Rust 剪贴板里有什么。 */
export async function peekDesktop(imagesOnly: boolean): Promise<ClipFound | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const plan = desktopPlan(await invoke<ClipPeek>('clipboard_peek'), imagesOnly);
    if (!plan) return null;
    if (plan.kind === 'files') {
      const paths = plan.paths;
      return {
        sig: plan.sig,
        kind: 'files',
        count: paths.length,
        load: () =>
          Promise.all(
            paths.map(async (path) => {
              const buf = await invoke<ArrayBuffer>('clipboard_read_file', { path });
              const name = baseName(path);
              return new File([buf], name, { type: mimeOfName(name) });
            }),
          ),
      };
    }
    return {
      sig: plan.sig,
      kind: 'image',
      count: 1,
      load: async () => {
        const { readImage } = await import('@tauri-apps/plugin-clipboard-manager');
        const img = await readImage();
        const [rgba, size] = await Promise.all([img.rgba(), img.size()]);
        return [await rgbaToPng(rgba, size.width, size.height, `clipboard-${stamp()}.png`)];
      },
    };
  } catch (err) {
    console.error('看剪贴板失败', err);
    return null;
  }
}

const mobileOs = () => typeof navigator !== 'undefined' && /android|iphone|ipad|ipod/i.test(navigator.userAgent);

export function currentClipEnv(): ClipEnv {
  if (typeof navigator === 'undefined') return 'none';
  const nav = navigator as unknown as NavLike;
  return clipEnv({ tauri: isTauri(), mobileOs: mobileOs(), clipboardRead: typeof nav.clipboard?.read === 'function', permissions: typeof nav.permissions?.query === 'function' });
}

const local = (): KV | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const CHANGED = 'mindough:clipboard-seen';

/**
 * 剪贴板里有没有能加的东西（加过的不算）。挂上、窗口拿到焦点、页面切回来时看一眼。
 * imagesOnly：只要图片（日记）。网页端本来就只认图片。
 * take()：读出文件、记下签名、按钮收起。
 */
export function useClipboardFiles(imagesOnly: boolean): { found: ClipFound | null; take: () => Promise<File[]> } {
  const [found, setFound] = useState<ClipFound | null>(null);
  useEffect(() => {
    const env = currentClipEnv();
    if (env === 'none') return;
    let alive = true;
    let seq = 0;
    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      const my = ++seq;
      const f = env === 'desktop' ? await peekDesktop(imagesOnly) : await peekWeb(navigator as unknown as NavLike);
      if (!alive || my !== seq) return;
      setFound(f && !isSeen(local(), f.sig) ? f : null);
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') void check();
    };
    void check();
    window.addEventListener('focus', check);
    window.addEventListener(CHANGED, check);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      window.removeEventListener('focus', check);
      window.removeEventListener(CHANGED, check);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [imagesOnly]);
  const take = useCallback(async () => {
    const f = found;
    if (!f) return [];
    const files = await f.load();
    markSeen(local(), f.sig);
    setFound(null);
    // 别的按钮（另一个窗口区域）也跟着收起
    window.dispatchEvent(new Event(CHANGED));
    return files;
  }, [found]);
  return { found, take };
}
