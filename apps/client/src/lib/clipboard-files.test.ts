/**
 * 剪贴板按钮的判断（Rei 2026-10-29）：哪一端能看、网页只在已授权时读且只认图片、桌面先文件后图片、加过的不再出。
 */
import { describe, expect, it } from 'vitest';
import { baseName, clipEnv, desktopPlan, extOfMime, isSeen, markSeen, mimeOfName, peekWeb, seenList, webImageType, type NavLike } from './clipboard-files';

const memKV = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

const blob = (type: string, text = 'x') => new Blob([text], { type });
const nav = (state: string | Error, items: Array<Record<string, Blob>>, reads = { n: 0 }): NavLike => ({
  permissions: {
    query: async () => {
      if (state instanceof Error) throw state;
      return { state };
    },
  },
  clipboard: {
    read: async () => {
      reads.n++;
      return items.map((it) => ({ types: Object.keys(it), getType: async (t: string) => it[t]! }));
    },
  },
});
const hash = async (b: Blob) => `${b.type}:${b.size}`;

describe('clipEnv', () => {
  it('桌面 App 用 Rust；手机 App 不做；网页要有 clipboard.read 和 permissions', () => {
    expect(clipEnv({ tauri: true, mobileOs: false, clipboardRead: true, permissions: true })).toBe('desktop');
    expect(clipEnv({ tauri: true, mobileOs: true, clipboardRead: true, permissions: true })).toBe('none');
    expect(clipEnv({ tauri: false, mobileOs: false, clipboardRead: true, permissions: true })).toBe('web');
    expect(clipEnv({ tauri: false, mobileOs: false, clipboardRead: false, permissions: true })).toBe('none');
    expect(clipEnv({ tauri: false, mobileOs: false, clipboardRead: true, permissions: false })).toBe('none');
  });
});

describe('网页：只在已授权时读，只认图片，不弹框', () => {
  it('granted + 有图片：出按钮，签名按内容算', async () => {
    const f = await peekWeb(nav('granted', [{ 'text/plain': blob('text/plain'), 'image/png': blob('image/png', 'abc') }]), hash);
    expect(f).toMatchObject({ kind: 'image', count: 1, sig: 'web:image/png:3' });
    const [file] = await f!.load();
    expect(file!.type).toBe('image/png');
    expect(file!.name).toMatch(/^clipboard-\d{8}-\d{6}\.png$/);
  });
  it('prompt / denied：不读剪贴板（读了 Chrome 会弹框）', async () => {
    for (const st of ['prompt', 'denied']) {
      const reads = { n: 0 };
      expect(await peekWeb(nav(st, [{ 'image/png': blob('image/png') }], reads), hash)).toBeNull();
      expect(reads.n).toBe(0);
    }
  });
  it('Firefox / Safari：不认 clipboard-read（query 抛错）或没有 read：当没有', async () => {
    const reads = { n: 0 };
    expect(await peekWeb(nav(new TypeError('bad name'), [{ 'image/png': blob('image/png') }], reads), hash)).toBeNull();
    expect(reads.n).toBe(0);
    expect(await peekWeb({ permissions: { query: async () => ({ state: 'granted' }) } }, hash)).toBeNull();
    expect(await peekWeb({}, hash)).toBeNull();
  });
  it('只有文字：没有按钮', async () => {
    expect(await peekWeb(nav('granted', [{ 'text/plain': blob('text/plain') }]), hash)).toBeNull();
  });
  it('webImageType / extOfMime', () => {
    expect(webImageType(['text/html', 'image/jpeg', 'image/png'])).toBe('image/jpeg');
    expect(webImageType(['text/plain'])).toBeNull();
    expect(extOfMime('image/jpeg')).toBe('jpg');
    expect(extOfMime('image/svg+xml')).toBe('svg');
    expect(extOfMime('image/x-weird')).toBe('png');
  });
});

describe('桌面：先文件后图片', () => {
  it('有文件就用文件（签名 = 路径）', () => {
    expect(desktopPlan({ files: ['/a/报告.pdf', '/a/图.png'], hasImage: true, imageSig: '1x1:aa' }, false)).toEqual({ kind: 'files', paths: ['/a/报告.pdf', '/a/图.png'], sig: 'files:/a/报告.pdf\n/a/图.png' });
  });
  it('只要图片（日记）：只留图片文件；全是别的文件就不出', () => {
    expect(desktopPlan({ files: ['/a/报告.pdf', 'C:\\x\\图.JPG'], hasImage: false, imageSig: null }, true)).toMatchObject({ kind: 'files', paths: ['C:\\x\\图.JPG'] });
    expect(desktopPlan({ files: ['/a/报告.pdf'], hasImage: true, imageSig: '1x1:aa' }, true)).toBeNull();
  });
  it('没文件有图片：图片（签名 = 宽高 + 像素哈希）；都没有：不出', () => {
    expect(desktopPlan({ files: [], hasImage: true, imageSig: '10x20:ff' }, true)).toEqual({ kind: 'image', sig: 'image:10x20:ff' });
    expect(desktopPlan({ files: [], hasImage: false, imageSig: null }, false)).toBeNull();
  });
  it('baseName / mimeOfName', () => {
    expect(baseName('/Users/rei/Desktop/a b.pdf')).toBe('a b.pdf');
    expect(baseName('C:\\Users\\rei\\图.png')).toBe('图.png');
    expect(mimeOfName('x.PNG')).toBe('image/png');
    expect(mimeOfName('x.docx')).toMatch(/wordprocessingml/);
    expect(mimeOfName('x.unknown')).toBe('');
  });
});

describe('加过的不再出', () => {
  it('记下签名；最多 20 条，新的在前；坏数据当空', () => {
    const kv = memKV();
    expect(isSeen(kv, 'a')).toBe(false);
    markSeen(kv, 'a');
    expect(isSeen(kv, 'a')).toBe(true);
    for (let i = 0; i < 25; i++) markSeen(kv, `s${i}`);
    expect(seenList(kv)).toHaveLength(20);
    expect(seenList(kv)[0]).toBe('s24');
    expect(isSeen(kv, 'a')).toBe(false);
    kv.setItem('mindough:clipboard_seen', '{bad');
    expect(seenList(kv)).toEqual([]);
    expect(isSeen(null, 'a')).toBe(false);
  });
});
