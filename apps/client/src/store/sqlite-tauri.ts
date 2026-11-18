/**
 * Tauri 原生端 SQLite：走 src-tauri/src/db.rs 的命令层（rusqlite，每个窗口每个库一条连接）。
 * schema 与迁移由 core 的 SqlAdapter 负责，与 Web 端同一份。
 */
import type { SqlDriver, SqlValue } from '@mindough/core';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * 原生端每个窗口每个库只有一条连接，一个窗口里也只能有一个 SqlAdapter 在发 BEGIN / COMMIT。
 * 开发模式下 React StrictMode 会把打开数据库的 effect 跑两遍，两份迁移同时 BEGIN 就报
 * 「cannot start a transaction within a transaction」（Rei 2026-10-26 在 pnpm tauri dev 里遇到）。
 * 所以同一个窗口只建一次驱动，后来的调用拿同一个。
 */
const shared = new Map<string, Promise<SqlDriver>>();

/**
 * file 不给 = 生产库 mindough.db；演示模式给 mindough-demo.db（Rei 2026-11-18，Rust 端 db.rs 只认这两个名字）。
 * 每条命令都带上 file，Rust 那边每个文件一条连接。
 */
export function openTauriSqlite(file?: string): Promise<SqlDriver> {
  const k = file ?? '';
  let p = shared.get(k);
  if (!p) {
    p = (async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const f = file ? { file } : {};
      // 这个窗口的连接上可能还挂着上一页没收尾的事务（重载时正在写），先回滚掉（Rei 2026-11-19 Windows 开演示模式报嵌套事务）
      await invoke<void>('db_open', { ...f }).catch(() => {});
      return {
        kind: 'tauri-rusqlite',
        exec: (sql: string) => invoke<void>('db_exec', { sql, ...f }),
        run: (sql: string, params: readonly SqlValue[] = []) => invoke<void>('db_run', { sql, params, ...f }),
        all: <T,>(sql: string, params: readonly SqlValue[] = []) => invoke<T[]>('db_all', { sql, params, ...f }),
      };
    })();
    shared.set(k, p);
  }
  return p;
}
