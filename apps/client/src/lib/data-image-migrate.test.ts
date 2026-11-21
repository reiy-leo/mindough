// @vitest-environment happy-dom
/** 旧 data: 图片悄悄搬到 R2（Rei 2026-11-21「现在迁移」，lib/data-image-migrate.ts）。 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryAdapter, Store } from '@mindough/core';
import { DataImageMigrator, MAX_UPLOAD_BYTES, defaultDeps, scheduleMigration, type MigrateDeps } from './data-image-migrate';
import { setAccount, type AccountState } from './account';
import { setActiveDemo } from './demo-mode';
import type { UploadedAsset } from './upload';
import './i18n';

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG_BYTES = Buffer.from(PNG_B64, 'base64');
/** 第 i 张不一样的图（PNG 后面多 i 个字节）。 */
const png = (i: number) => `data:image/png;base64,${Buffer.concat([PNG_BYTES, Buffer.alloc(i, 7)]).toString('base64')}`;
/** 比 10 MB 还大的一张。 */
const bigPng = () => `data:image/png;base64,${Buffer.concat([PNG_BYTES, Buffer.alloc(MAX_UPLOAD_BYTES + 16, 1)]).toString('base64')}`;
const IN: AccountState = { status: 'in', user: { email: 'a@b.c' } as never };

let store: Store;
let now: number;
let uploads: Blob[];
let ok: boolean;
let online: boolean;

const r2 = (n: number): UploadedAsset => ({ url: `https://app.mindough.rei8t.dev/api/assets/u/s${n}`, r2_key: `u/s${n}`, sha256: `s${n}`, mime: 'image/png' });

function deps(patch: Partial<MigrateDeps> = {}): MigrateDeps {
  return {
    canRun: () => online,
    upload: async (b) => {
      uploads.push(b);
      return ok ? r2(uploads.length) : null;
    },
    now: () => now,
    ...patch,
  };
}

beforeEach(async () => {
  store = await Store.open(new MemoryAdapter(), { deviceId: 'dev1' });
  now = 1_000_000;
  uploads = [];
  ok = true;
  online = true;
});
afterEach(() => {
  setActiveDemo(false);
  setAccount({ status: 'loading' });
});

describe('旧 data: 图片搬到 R2', () => {
  it('只搬 data: 图：正文里那一段换成 R2 地址，别的字和网络图不动', async () => {
    const body = `第一行\n\n![a](${png(0)})\n\n![网](https://x.com/a.png)\n\n- [ ] 清单`;
    const t = store.createTask({ body_md: body }, { joinMyDay: false });
    const r = await new DataImageMigrator(store, deps()).runBatch();
    expect(r).toEqual({ migrated: 1, failed: 0, remaining: 0 });
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.type).toBe('image/png');
    expect(store.get('task', t.id)!.body_md).toBe(body.replace(png(0), r2(1).url));
  });

  it('同一张图在几处只传一次，全换掉', async () => {
    const a = store.insert('asset', { sha256: '', mime: 'image/png', width: 1, height: 1, r2_key: null, url: png(0) });
    const t = store.createTask({ body_md: `![](${png(0)})` }, { joinMyDay: false });
    await new DataImageMigrator(store, deps()).runBatch();
    expect(uploads).toHaveLength(1);
    expect(store.get('asset', a.id)).toMatchObject({ url: r2(1).url, r2_key: 'u/s1', sha256: 's1' });
    expect(store.get('task', t.id)!.body_md).toBe(`![](${r2(1).url})`);
  });

  it('限速：一批最多 3 张，剩下的下一批', async () => {
    for (let i = 0; i < 5; i++) store.createTask({ body_md: `![](${png(i)})` }, { joinMyDay: false });
    const m = new DataImageMigrator(store, deps());
    expect(await m.runBatch()).toEqual({ migrated: 3, failed: 0, remaining: 2 });
    expect(await m.runBatch()).toEqual({ migrated: 2, failed: 0, remaining: 0 });
    expect(await m.runBatch()).toEqual({ migrated: 0, failed: 0, remaining: 0 });
    expect(uploads).toHaveLength(5);
    expect(store.dataImages()).toEqual([]);
  });

  it('传失败的原样留着；退避时间到了再试，成功就换', async () => {
    const t = store.createTask({ body_md: `![](${png(0)})` }, { joinMyDay: false });
    ok = false;
    const m = new DataImageMigrator(store, deps());
    expect(await m.runBatch()).toEqual({ migrated: 0, failed: 1, remaining: 1 });
    expect(store.get('task', t.id)!.body_md).toBe(`![](${png(0)})`);
    // 退避中：不再试
    expect((await m.runBatch()).failed).toBe(0);
    expect(uploads).toHaveLength(1);
    now += 61_000;
    ok = true;
    expect(await m.runBatch()).toEqual({ migrated: 1, failed: 0, remaining: 0 });
    expect(store.get('task', t.id)!.body_md).toBe(`![](${r2(2).url})`);
  });

  it('幂等：搬完再跑什么都不传、不写', async () => {
    const t = store.createTask({ body_md: `![](${png(0)})` }, { joinMyDay: false });
    const m = new DataImageMigrator(store, deps());
    await m.runBatch();
    const stamp = store.get('task', t.id)!.updated_at;
    expect(await m.runBatch()).toEqual({ migrated: 0, failed: 0, remaining: 0 });
    expect(uploads).toHaveLength(1);
    expect(store.get('task', t.id)!.updated_at).toBe(stamp);
  });

  it('上传期间用户改了正文：按最新内容换，改的字留着', async () => {
    const t = store.createTask({ body_md: `旧 ![](${png(0)})` }, { joinMyDay: false });
    const m = new DataImageMigrator(
      store,
      deps({
        upload: async (b) => {
          uploads.push(b);
          store.updateTask(t.id, { body_md: `用户刚写的 ![](${png(0)}) 还有这句` });
          return r2(1);
        },
      }),
    );
    await m.runBatch();
    expect(store.get('task', t.id)!.body_md).toBe(`用户刚写的 ![](${r2(1).url}) 还有这句`);
  });

  it('离线 / 没登录：什么都不动', async () => {
    store.createTask({ body_md: `![](${png(0)})` }, { joinMyDay: false });
    online = false;
    expect(await new DataImageMigrator(store, deps()).runBatch()).toEqual({ migrated: 0, failed: 0, remaining: 0 });
    expect(uploads).toHaveLength(0);
  });

  it('演示模式跳过：默认条件下登录在线也不搬', async () => {
    setAccount(IN);
    expect(defaultDeps().canRun()).toBe(true);
    setActiveDemo(true);
    expect(defaultDeps().canRun()).toBe(false);
    setActiveDemo(false);
    setAccount({ status: 'out' });
    expect(defaultDeps().canRun()).toBe(false);
  });

  it('服务器不收的格式、超过 10 MB 缩不下来的：留着不传，这次打开里不再试', async () => {
    const bmp = 'data:image/bmp;base64,Qk0=';
    const t = store.createTask({ body_md: `![](${bmp})` }, { joinMyDay: false });
    const big = bigPng();
    const t2 = store.createTask({ body_md: `![](${big})` }, { joinMyDay: false });
    const m = new DataImageMigrator(store, deps({ shrink: async (b) => b }));
    expect(await m.runBatch()).toMatchObject({ migrated: 0, failed: 2 });
    expect(await m.runBatch()).toMatchObject({ migrated: 0, failed: 0 });
    expect(uploads).toHaveLength(0);
    expect(store.get('task', t.id)!.body_md).toContain(bmp);
    expect(store.get('task', t2.id)!.body_md).toContain(big);
  });

  it('太大的图先缩，缩下来就传', async () => {
    const big = bigPng();
    const t = store.createTask({ body_md: `![](${big})` }, { joinMyDay: false });
    const m = new DataImageMigrator(store, deps({ shrink: async () => new Blob([new Uint8Array(10)], { type: 'image/webp' }) }));
    expect(await m.runBatch()).toMatchObject({ migrated: 1 });
    expect(uploads[0]!.size).toBe(10);
    expect(store.get('task', t.id)!.body_md).toBe(`![](${r2(1).url})`);
  });

  it('scheduleMigration：搬成了才再同步一次，没搬成不同步', async () => {
    store.createTask({ body_md: `![](${png(0)})` }, { joinMyDay: false });
    const m = new DataImageMigrator(store, deps());
    let syncs = 0;
    const flush = () => new Promise((r) => setTimeout(r, 0));
    scheduleMigration(m, () => syncs++, (fn) => fn());
    await flush();
    expect(syncs).toBe(1);
    scheduleMigration(m, () => syncs++, (fn) => fn());
    await flush();
    expect(syncs).toBe(1);
  });
});
