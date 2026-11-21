/**
 * 旧 data: 图片悄悄搬到 R2（Rei 2026-11-21「现在迁移」，docs/PLAN.md「旧 data: 图片搬到 R2」）。
 *
 * - 什么时候：登录、在线、不是演示模式时，每次同步成功后等浏览器空下来做一小批（一次最多 3 张）；
 *   这批有搬成的就再同步一次（把改好的行推上去），推完又接着下一批，直到搬完。离线、没登录、演示模式一概不动。
 * - 怎么搬：同一张图只传一次（上传前算 SHA-256 问服务器，已经有了就不传，见 upload.ts），传好后
 *   Store.replaceDataImage 把它在所有行里换成 R2 地址（每行按最新内容只换那一段，照常 LWW 同步）。
 * - 传不上的原样留着：这次打开里按 1、2、4…分钟往后推（最多 1 小时）再试，重开 app 从头算；不删、不改。
 *   服务器不收的格式（不在 UPLOADABLE_IMAGE_MIME 里）、超过 10 MB 又缩不下来的，这次打开里不再试。
 * - 不给用户看任何东西，不挡界面：全在后台，出错只记一条 console.warn。
 */
import { UPLOADABLE_IMAGE_MIME, decodeDataImage, type DataImageRef, type Store } from '@mindough/core';
import { getAccount } from './account';
import { isDemoMode } from './demo-mode';
import { normalizeImage } from './image';
import { uploadImage, type UploadedAsset } from './upload';

/** 一批最多搬几张。 */
export const MIGRATE_BATCH = 3;
/** 服务器单张上限（apps/server/src/assets.ts MAX_ASSET_BYTES）。 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const BACKOFF_BASE_MS = 60_000;
const BACKOFF_MAX_MS = 60 * 60_000;

export interface MigrateDeps {
  /** 能不能搬：登录、在线、不是演示模式。 */
  canRun: () => boolean;
  /** 上传一张图，不行返回 null。 */
  upload: (blob: Blob) => Promise<UploadedAsset | null>;
  /** 太大的图缩一下（只限长边）；缩不了原样返回。 */
  shrink?: (blob: Blob) => Promise<Blob>;
  now?: () => number;
}

export interface BatchResult {
  migrated: number;
  failed: number;
  /** 这批之后还剩几张（含正在等重试的）。 */
  remaining: number;
}

/** 认一张图用的短键（data: 地址可能好几 MB，别拿整串当 Map 键）。 */
const keyOf = (url: string) => `${url.length}:${url.slice(0, 80)}:${url.slice(-80)}`;

export const defaultDeps = (): MigrateDeps => ({
  canRun: () => getAccount().status === 'in' && navigator.onLine !== false && !isDemoMode(),
  upload: (blob) => uploadImage(blob),
  shrink: async (blob) => (await normalizeImage(blob, null)).blob,
});

export class DataImageMigrator {
  private running = false;
  /** 传失败的：失败几次、什么时候之前别再试。 */
  private retry = new Map<string, { fails: number; until: number }>();
  /** 这次打开里不再试的（格式不收、太大、解不开）。 */
  private never = new Set<string>();

  constructor(
    private readonly store: Store,
    private readonly deps: MigrateDeps = defaultDeps(),
  ) {}

  private now() {
    return this.deps.now?.() ?? Date.now();
  }

  /** 这张图现在该不该试（不在退避里、不是这次不再试的）。 */
  private due(ref: DataImageRef): boolean {
    const k = keyOf(ref.url);
    if (this.never.has(k)) return false;
    const r = this.retry.get(k);
    return !r || r.until <= this.now();
  }

  private fail(url: string) {
    const k = keyOf(url);
    const fails = (this.retry.get(k)?.fails ?? 0) + 1;
    this.retry.set(k, { fails, until: this.now() + Math.min(BACKOFF_BASE_MS * 2 ** (fails - 1), BACKOFF_MAX_MS) });
  }

  /** 这张图的 asset 行写的格式（导入时不认识后缀的图，地址里写的是 application/octet-stream）。 */
  private fallbackMime(ref: DataImageRef): string | null {
    for (const r of ref.rows) if (r.table === 'asset') return this.store.get('asset', r.id)?.mime ?? null;
    return null;
  }

  /** 搬一张：解出来 → （太大就缩）→ 上传 → 换地址。成功 true；传不上 false（留着重试）；不收的格式记进 never。 */
  private async one(ref: DataImageRef): Promise<boolean> {
    const d = decodeDataImage(ref.url, this.fallbackMime(ref));
    if (!d || !UPLOADABLE_IMAGE_MIME.test(d.mime)) {
      this.never.add(keyOf(ref.url));
      return false;
    }
    let blob = new Blob([d.bytes as BlobPart], { type: d.mime });
    if (blob.size > MAX_UPLOAD_BYTES && this.deps.shrink) blob = await this.deps.shrink(blob).catch(() => blob);
    if (blob.size > MAX_UPLOAD_BYTES) {
      this.never.add(keyOf(ref.url));
      return false;
    }
    const up = await this.deps.upload(blob).catch(() => null);
    if (!up?.url || !up.r2_key) {
      this.fail(ref.url);
      return false;
    }
    // 上传那几秒里用户可能改了正文：replaceDataImage 按现在最新的内容换，那段地址已经没了就什么都不改
    this.store.replaceDataImage(ref.url, { url: up.url, r2_key: up.r2_key, sha256: up.sha256, mime: up.mime || d.mime });
    this.retry.delete(keyOf(ref.url));
    return true;
  }

  /** 做一批（最多 limit 张）。已经有一批在跑、或者现在不能搬，直接返回 0。 */
  async runBatch(limit = MIGRATE_BATCH): Promise<BatchResult> {
    if (this.running || !this.deps.canRun()) return { migrated: 0, failed: 0, remaining: 0 };
    this.running = true;
    let migrated = 0;
    let failed = 0;
    try {
      const refs = this.store.dataImages();
      for (const ref of refs.filter((r) => this.due(r)).slice(0, limit)) {
        if (!this.deps.canRun()) break;
        try {
          if (await this.one(ref)) migrated++;
          else failed++;
        } catch (e) {
          failed++;
          this.fail(ref.url);
          console.warn('旧图片搬到 R2 出错', e);
        }
      }
      return { migrated, failed, remaining: Math.max(0, refs.length - migrated) };
    } finally {
      this.running = false;
    }
  }
}

// ───── 接到同步上（lib/sync.ts 调） ─────

type Idle = (fn: () => void) => void;
const idle: Idle = (fn) => {
  const w = globalThis as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(fn, { timeout: 10_000 });
  else setTimeout(fn, 2_000);
};

/**
 * 同步成功后调：空下来时做一批，有搬成的就 syncAgain() 把改好的行推上去（推完又会回到这里，接着下一批）。
 * 一批都没搬成就等下一次同步（每 60 秒、回到前台、本机写入后）再说。
 */
export function scheduleMigration(migrator: DataImageMigrator, syncAgain: () => void, schedule: Idle = idle): void {
  schedule(() => {
    void migrator
      .runBatch()
      .then((r) => {
        if (r.migrated > 0) syncAgain();
      })
      .catch((e) => console.warn('旧图片搬到 R2 出错', e));
  });
}
