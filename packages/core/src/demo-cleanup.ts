/**
 * 清除旧演示数据（Rei 2026-11-18 演示模式，docs/DEMO-MODE.md）。
 *
 * 有演示模式以前，新设备第一次打开会把演示数据直接写进生产库。现在演示数据另放演示库，
 * 老设备的生产库里还混着那一份，设置 → 数据 给一个「清除旧演示数据」。
 *
 * 哪些行算「没动过的旧演示数据」：
 * - 生成演示数据时记下的最后一笔时间 demo_stamp（DEMO_STAMP_META）之前或正好那一笔；
 * - 是这台设备写的（HLC 里的设备 id 是本机）——从云端拉下来的、别的设备的数据，时间再早也不动；
 * - 离 demo_stamp 不超过 10 分钟（演示数据是一批写进去的，几秒内写完）；
 * - 不是内置的固定行（时间戳全 0）、没删过；
 * - 类型（category / checkin_category）不删：类型按设计不能删，留着不碍事；
 * - 还被留下来的行引用着（整行 JSON 里出现它的 id）的也不删，比如自己新建的任务挂着演示里的人物、项目。
 * 改过的演示行（updated_at 晚于 demo_stamp）都留着。
 *
 * 【代定】Rei 还没最终确认是只删没动过的，还是全删（2026-11-18 19:20 方案第 6 条）。现在按只删没动过的做。
 */
import { parseHlc } from './hlc';
import type { Store } from './store';
import { isSeedRow } from './sync/engine';
import { TABLES, type BaseRow, type TableName } from './types';

/** 类型不能删（CategoryDeleteError），清除时跳过。 */
const KEEP_TABLES: readonly TableName[] = ['category', 'checkin_category'];
/** 演示数据一批写完；离 demo_stamp 太远的行不算。 */
const WINDOW_MS = 10 * 60 * 1000;

export interface DemoRowRef {
  table: TableName;
  id: string;
}

/** 能清掉的旧演示行。stamp 是生产库 meta 里的 demo_stamp，空就是没有旧演示数据。 */
export function oldDemoRows(store: Store, stamp: string | null | undefined): DemoRowRef[] {
  if (!stamp) return [];
  const stampMs = parseHlc(stamp).ms;
  if (!Number.isFinite(stampMs)) return [];
  const cand = new Map<string, DemoRowRef>();
  const kept: string[] = [];
  for (const table of TABLES) {
    for (const r of store.listAll(table) as BaseRow[]) {
      if (r.deleted) continue;
      const h = parseHlc(r.updated_at);
      const isDemo =
        !KEEP_TABLES.includes(table) &&
        !isSeedRow(r) &&
        r.updated_at <= stamp &&
        h.deviceId === store.deviceId &&
        h.ms >= stampMs - WINDOW_MS;
      if (isDemo) cand.set(`${table}/${r.id}`, { table, id: r.id });
      else kept.push(JSON.stringify(r));
    }
  }
  // 留下来的行引用着的不删；新留下的也可能引用别的，一直查到不再变
  let text = kept.join('\n');
  for (let changed = true; changed && cand.size; ) {
    changed = false;
    for (const [k, ref] of cand) {
      if (!text.includes(ref.id)) continue;
      cand.delete(k);
      const row = store.raw(ref.table, ref.id);
      if (row) text += '\n' + JSON.stringify(row);
      changed = true;
    }
  }
  return [...cand.values()];
}

/** 清掉旧演示行：一批打墓碑（照常进 outbox，登录了就同步删除）。返回删了几行。 */
export function clearOldDemoRows(store: Store, stamp: string | null | undefined): number {
  const rows = oldDemoRows(store, stamp);
  if (!rows.length) return 0;
  store.batch(() => {
    for (const r of rows) store.remove(r.table, r.id);
  });
  return rows.length;
}
