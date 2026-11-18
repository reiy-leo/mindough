import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { SqlAdapter, Store, WebStorageAdapter, migrateStorage, seedDemo, type StorageAdapter } from '@mindough/core';
import { bindSync } from '../lib/sync';
import { installCalViewMigration } from '../lib/calendar-view';
import { installViewPrefsMigration } from '../lib/view-prefs';
import { installUploader } from '../lib/attachments';
import { installAttachmentCache } from '../lib/attachment-cache';
import { installWindowSync, isAuxWindow } from '../lib/windows';
import { installWidgetSnapshot } from '../lib/widget-snapshot';
import { closeWebSqlite, migrateFromTurso, openWebSqlite, terminateWebSqlite, webSqliteSupported, WEB_DB_FILE } from './sqlite-web';
import { DEMO_DB_FILE, DEMO_LS_PREFIX, DEMO_MODE_CHECKED_META, installDemoModeRelay, isDemoMode, readDemoFlag, setActiveDemo, writeDemoFlag } from '../lib/demo-mode';
import { acquireTabLock, type TabLock } from './tab-lock';
import { isTauri, openTauriSqlite } from './sqlite-tauri';

import { appName, tr } from '../lib/i18n';
const Ctx = createContext<Store | null>(null);

/** 记在 localStorage 里：这台设备已经用上 SQLite。之后 SQLite 打不开就报错，而不是悄悄退回 localStorage（会分叉数据）。 */
const ENGINE_KEY = 'mindough:engine';

export interface StorageInfo {
  engine: 'sqlite' | 'localStorage';
  detail: string;
  /** 退回 localStorage 的原因。 */
  fallbackReason?: string;
  /** 本次启动从 localStorage 迁过来的行数。 */
  migratedRows?: number;
  /** 开的是演示库（演示模式）。 */
  demo?: boolean;
}

export let storageInfo: StorageInfo = { engine: 'localStorage', detail: 'localStorage' };

/**
 * 选存储：Tauri → 原生 SQLite；浏览器 → sqlite-wasm（OPFS）；都不行 → localStorage。
 * 浏览器第一次用上新引擎时，把以前 Turso wasm 库里的数据搬过来；再往前用 localStorage 的，把 localStorage 搬过来
 * （都只搬一次，旧数据保留作备份；只搬进生产库）。
 * which = 'demo' 打开演示库（演示模式，lib/demo-mode.ts）：另一个文件 / 另一套 localStorage 键。
 */
type Which = 'prod' | 'demo';
const tauriAdapters = new Map<Which, Promise<StorageAdapter>>();

async function openAdapter(which: Which): Promise<StorageAdapter> {
  // Tauri 下同一个窗口只开一次（StrictMode 会让 effect 跑两遍，两份迁移会在同一条原生连接上嵌套 BEGIN）
  if (isTauri()) {
    let p = tauriAdapters.get(which);
    if (!p) {
      p = openAdapterOnce(which).catch((e) => (tauriAdapters.delete(which), Promise.reject(e)));
      tauriAdapters.set(which, p);
    }
    return p;
  }
  return openAdapterOnce(which);
}

async function openAdapterOnce(which: Which): Promise<StorageAdapter> {
  const legacy = () => new WebStorageAdapter(window.localStorage);
  const fallback = () => (which === 'demo' ? new WebStorageAdapter(window.localStorage, DEMO_LS_PREFIX) : legacy());
  const demo = which === 'demo';
  let reason: string | undefined;
  try {
    const driver = isTauri() ? await openTauriSqlite(demo ? DEMO_DB_FILE : undefined) : await openWebSqlite(demo ? `/${DEMO_DB_FILE}` : WEB_DB_FILE);
    if (driver) {
      const sql = new SqlAdapter(driver);
      await sql.schemaVersion();
      let rows = 0;
      if (!demo) {
        if (!isTauri()) rows += await migrateFromTurso(sql);
        rows += (await migrateStorage(legacy(), sql)).rows;
      }
      localStorage.setItem(ENGINE_KEY, 'sqlite');
      storageInfo = { engine: 'sqlite', detail: sql.kind, migratedRows: rows, demo };
      return sql;
    }
    reason = webSqliteSupported().reason;
  } catch (e) {
    if (localStorage.getItem(ENGINE_KEY) === 'sqlite') {
      throw new Error(tr('本地数据库打不开：{String}', { String: String(e) }));
    }
    reason = tr('SQLite 启动失败：{String}', { String: String(e) });
    console.warn(reason);
  }
  storageInfo = { engine: 'localStorage', detail: 'localStorage', demo, ...(reason ? { fallbackReason: reason } : {}) };
  return fallback();
}

/**
 * 打开这一页要用的库（Rei 2026-11-18 演示模式）：
 * - 本机标记是生产（'0'）：只开生产库。生产库不再生成演示数据。
 * - 标记是演示（'1'）：开演示库；演示库还没生成过就生成一份。
 * - 没有标记（新装，或从没有演示模式的版本升上来）：先看生产库。空的（没任务、也没生成过演示数据）就是新装，
 *   进演示模式；有数据或生成过演示数据就是老设备，留在生产库。生产库记一笔「判断过了」。
 */
export async function openWebStore(): Promise<Store> {
  const flag = readDemoFlag();
  const open = (a: StorageAdapter) => Store.open(a, { onError: (e) => console.error('写入本地存储失败', e) });
  if (flag !== '1') {
    const adapter = await openAdapter('prod');
    const store = await open(adapter);
    if (flag === '0') return (setActiveDemo(false), store);
    const fresh = !(await adapter.getMeta('demo_seeded')) && store.tasks().length === 0;
    await adapter.setMeta(DEMO_MODE_CHECKED_META, new Date().toISOString());
    if (!fresh) {
      writeDemoFlag(false);
      setActiveDemo(false);
      return store;
    }
    writeDemoFlag(true);
    await store.flush();
    // 网页：同一时刻只能有一个线程拿着 OPFS 句柄，先关掉生产库再开演示库
    if (!isTauri() && storageInfo.engine === 'sqlite') await closeWebSqlite();
  }
  setActiveDemo(true);
  const adapter = await openAdapter('demo');
  const store = await open(adapter);
  if (!(await adapter.getMeta('demo_seeded'))) {
    seedDemo(store);
    await adapter.setMeta('demo_seeded', new Date().toISOString());
    await store.flush();
  }
  return store;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 另一个标签页正开着（拿着标签页锁）：这一页只显示提示。 */
  const [blocked, setBlocked] = useState<null | 'other' | 'taken'>(null);
  const [attempt, setAttempt] = useState<{ steal: boolean } | null>({ steal: false });
  useEffect(() => {
    if (!attempt) return;
    let alive = true;
    let opened: Store | null = null;
    (async () => {
      // 标签页锁只管浏览器；Tauri 的窗口之间另有办法
      const lock: TabLock | null = isTauri() ? { lost: new Promise<void>(() => {}) } : await acquireTabLock(attempt.steal);
      if (!alive) return;
      if (!lock) return setBlocked('other');
      setBlocked(null);
      const s = await openWebStore();
      if (!alive) return;
      opened = s;
      setStore(s);
      lock.lost.then(async () => {
        // 被别的标签页「在这里用」抢走：先把手上的改动写下去，再停掉数据库，换成提示
        await Promise.race([s.flush().catch(() => {}), new Promise((r) => setTimeout(r, 800))]);
        terminateWebSqlite();
        if (!alive) return;
        setStore(null);
        setBlocked('taken');
      });
    })().catch((e: unknown) => alive && setError(String(e)));
    return () => {
      alive = false;
      void opened;
    };
  }, [attempt]);
  // 登录后多设备同步；退出登录就停（本机数据不动）
  // 同步只在主窗口跑（设置窗口的写入经窗口事件交给主窗口，主窗口照常推）
  // 演示模式完全不同步（Rei 2026-11-18）：不绑同步、不传附件、不清附件缓存，下面几项都跳过
  const live = !!store && !isAuxWindow() && !isDemoMode();
  useEffect(() => (store && live ? bindSync(store) : undefined), [store, live]);
  // 日历视图改成同步偏好（Rei 2026-11-13）：登录后第一次同步完，账户里还没有就把本机老设置写上去
  useEffect(() => (store && live ? installCalViewMigration(store) : undefined), [store, live]);
  // 我的一天 / 等待安排 / 项目页的视图、分区、排序改成同步偏好（Rei 2026-11-16 17:01）：同上，账户里没有才把本机老设置写上去（lib/view-prefs）
  useEffect(() => (store && live ? installViewPrefsMigration(store) : undefined), [store, live]);
  useEffect(() => (store ? installWindowSync(store) : undefined), [store]);
  useEffect(() => (store ? installWidgetSnapshot(store) : undefined), [store]);
  // 附件上传队列：只在主窗口跑（和同步一样）
  useEffect(() => (store && live ? installUploader(store) : undefined), [store, live]);
  // 附件本机缓存：启动、回到前台、每小时清掉到期（24 小时）的本机副本
  useEffect(() => (store && live ? installAttachmentCache(store) : undefined), [store, live]);
  // 别的窗口开 / 关了演示模式：存好手上的改动，跟着重载
  useEffect(() => (store ? installDemoModeRelay(store) : undefined), [store]);
  if (error) return <div className="boot-error">{tr('打不开本地数据：{error}', { error })}</div>;
  if (blocked)
    return (
      <div className="tab-blocked" role="alert">
        <div className="tab-blocked-card">
          <div className="tab-blocked-title">{tr('念头团已在另一个标签页打开')}</div>
          <p className="tab-blocked-text">
            {blocked === 'taken' ? tr('你在另一个标签页里点了「在这里用」，这一页先停下了。') : tr('同一时间只能在一个标签页里用，免得两边的改动打架。')}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setBlocked(null);
              setAttempt({ steal: true });
            }}
          >
            {tr('在这里用')}
          </button>
        </div>
      </div>
    );
  if (!store) return <div className="boot">{appName()}</div>;
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

/** 取 Store，并在任何数据变化时重渲染。 */
export function useStore(): Store {
  const store = useContext(Ctx);
  if (!store) throw new Error(tr('StoreProvider 缺失'));
  useSyncExternalStore(
    (fn) => store.subscribe(fn),
    () => store.version,
  );
  return store;
}

/** 当前时间：计时器用 1 秒刷新，其他用 30 秒（顺便跨过零点换天）。 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
