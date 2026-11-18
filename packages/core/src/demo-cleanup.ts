/**
 * 清除旧演示数据（Rei 2026-11-18 演示模式，docs/DEMO-MODE.md）。
 *
 * 有演示模式以前，新设备第一次打开会把演示数据直接写进生产库。现在演示数据另放演示库，
 * 老设备的生产库里还混着那一份，设置 → 数据 给一个「清除旧演示数据」。
 *
 * Rei 2026-11-19 01:00 定：旧演示数据全删，改过的也不留（替代原来「只删没动过的」代定）。
 *
 * 哪些行算旧演示数据——看它当初是不是演示那一批写进来的，不看最后一次改动：
 * - 演示那一批：这台设备写的（HLC 里的设备 id 是本机）、时间在 demo_stamp（DEMO_STAMP_META，生成演示数据时最后一笔）
 *   之前或正好那一笔、离 demo_stamp 不超过 10 分钟；
 * - 行现在的 updated_at 落在这一批里（没动过），或者 outbox 里还留着它当初那一笔（改过，但还没同步上去，outbox 没清）。
 *   登录同步过的设备 outbox 已经清了，改过的演示行认不出来，只能删没动过的；
 * - 不是内置的固定行（时间戳全 0）、没删过；
 * - 类型（category / checkin_category）不删（类型按设计不能删）：演示建的类型改成「不显示」（归档）。
 *
 * 引用怎么算：
 * - 「实体」行（任务、项目、人物、资料、日记……）是自己的，又引用了演示行：被引用的演示行留着（比如自己的任务放在演示项目里）。
 * - 「挂件」行（打卡记录、关系、任务和人物 / 类型的关联、我的一天……）只挂在演示行上：跟着一起删（比如在演示任务上打的卡）。
 *   挂件同时连着自己的实体和演示行（自己的任务挂了演示人物）：演示行留着。
 * - 从演示行派生出来的行（id 里带着演示行的 id，比如打卡达标后存档出来的已完成任务）：算演示的一部分，一起删。
 * - 偏好行（排序、视图设置）不算引用，也不删。
 */
import { parseHlc } from './hlc';
import type { OutboxEntry } from './storage/adapter';
import type { Store } from './store';
import { isSeedRow } from './sync/engine';
import { TABLES, type BaseRow, type TableName } from './types';

/** 类型不能删（CategoryDeleteError），清除时跳过，演示建的改成不显示。 */
const KEEP_TABLES: readonly TableName[] = ['category', 'checkin_category'];
/** 挂件表：只挂在演示行上就跟着删。不在这里的都算实体。 */
const CHILD_TABLES: readonly TableName[] = [
  'dependency',
  'task_person',
  'task_category',
  'task_item',
  'my_day',
  'check_in',
  'task_link',
  'attachment',
  'group_library',
  'library_link',
  'milestone',
];
/** 偏好（排序、视图设置）不管：它常常一行里列着一堆 id，既不保住演示行，也不跟着删。 */
const SKIP_TABLES: readonly TableName[] = ['pref'];
/** 演示数据一批写完；离 demo_stamp 太远的行不算。 */
const WINDOW_MS = 10 * 60 * 1000;

export interface DemoRowRef {
  table: TableName;
  id: string;
}

const keyOf = (table: string, id: string) => `${table}/${id}`;

/** 这一笔是不是演示那一批写的。 */
function inBatch(updatedAt: string, stamp: string, stampMs: number, deviceId: string): boolean {
  if (updatedAt > stamp) return false;
  const h = parseHlc(updatedAt);
  return h.deviceId === deviceId && Number.isFinite(h.ms) && h.ms >= stampMs - WINDOW_MS;
}

/** outbox 里演示那一批写的行（`表/id`）。读不到就是空。 */
export async function demoBatchWrites(store: Store, stamp: string | null | undefined): Promise<Set<string>> {
  const out = new Set<string>();
  if (!stamp) return out;
  const stampMs = parseHlc(stamp).ms;
  if (!Number.isFinite(stampMs)) return out;
  let entries: OutboxEntry[] = [];
  try {
    entries = await store.adapter.pendingOutbox(10_000_000);
  } catch {
    return out;
  }
  for (const e of entries) if (inBatch(e.updated_at, stamp, stampMs, store.deviceId)) out.add(keyOf(e.table, e.id));
  return out;
}

interface Plan {
  rows: DemoRowRef[];
  /** 演示建的类型（不删，改成不显示）。 */
  categories: string[];
}

function plan(store: Store, stamp: string | null | undefined, batch: ReadonlySet<string>): Plan {
  if (!stamp) return { rows: [], categories: [] };
  const stampMs = parseHlc(stamp).ms;
  if (!Number.isFinite(stampMs)) return { rows: [], categories: [] };
  const isDemoRow = (table: TableName, r: BaseRow) =>
    !isSeedRow(r) && (inBatch(r.updated_at, stamp, stampMs, store.deviceId) || batch.has(keyOf(table, r.id)));

  type Row = { table: TableName; row: BaseRow; text: string; child: boolean; seed: boolean };
  const cand = new Map<string, Row>(); // 要删的
  const rest: Row[] = []; // 留下的（类型除外）
  const demoCats: string[] = [];
  for (const table of TABLES) {
    for (const r of store.listAll(table) as BaseRow[]) {
      if (r.deleted) continue;
      if (SKIP_TABLES.includes(table)) continue;
      if (KEEP_TABLES.includes(table)) {
        if (table === 'category' && isDemoRow(table, r)) demoCats.push(r.id);
        continue;
      }
      const row: Row = { table, row: r, text: JSON.stringify(r), child: CHILD_TABLES.includes(table), seed: isSeedRow(r) };
      if (isDemoRow(table, r)) cand.set(r.id, row);
      else rest.push(row);
    }
  }

  // 一直算到不再变：自己的实体保住它引用的演示行；连着自己实体的挂件也保住；只挂在演示行上的挂件跟着删
  const refs = (text: string, ids: Iterable<string>) => {
    const hit: string[] = [];
    for (const id of ids) if (text.includes(id)) hit.push(id);
    return hit;
  };
  const pinned = new Set<string>(); // 保下来的演示行，之后不再挪回去（免得来回挪不停）
  const move = (x: Row) => {
    cand.set(x.row.id, x);
    rest.splice(rest.indexOf(x), 1);
  };
  for (let changed = true; changed; ) {
    changed = false;
    // 1. 从演示行派生出来的（id 里带着演示行的 id，比如打卡存档出来的任务、确定 id 的关联）：算演示的一部分
    const derived = rest.filter((x) => !x.seed && !pinned.has(x.row.id) && refs(x.row.id, cand.keys()).length > 0);
    if (derived.length) {
      derived.forEach(move);
      changed = true;
      continue;
    }
    // 2. 自己的实体保住它引用的演示行；连着自己实体的挂件也保住
    const mine = rest.filter((x) => !x.child && !x.seed).map((x) => x.row.id);
    const keep = new Set<string>();
    const drop: Row[] = [];
    for (const x of rest) {
      const demoRefs = refs(x.text, cand.keys());
      if (!demoRefs.length) continue;
      if (pinned.has(x.row.id) && x.child) continue;
      if (!x.child || refs(x.text, mine).some((id) => id !== x.row.id)) demoRefs.forEach((id) => keep.add(id));
      else drop.push(x);
    }
    if (keep.size) {
      for (const id of keep) {
        const x = cand.get(id)!;
        cand.delete(id);
        pinned.add(id);
        rest.push(x);
      }
      changed = true;
      continue; // 先把要保的保完，再删挂件
    }
    // 3. 只挂在演示行上的挂件跟着删
    if (drop.length) {
      drop.forEach(move);
      changed = true;
    }
  }

  // 演示建的类型：留下的行还在用就不动，没人用了就不显示
  const restText = rest.map((x) => x.text).join('\n');
  const categories = demoCats.filter((id) => !restText.includes(id) && store.categoryState(id) !== 'hidden');
  return { rows: [...cand.values()].map((x) => ({ table: x.table, id: x.row.id })), categories };
}

/**
 * 能清掉的旧演示行。stamp 是生产库 meta 里的 demo_stamp，空就是没有旧演示数据。
 * batch 是 outbox 里演示那一批写的行（demoBatchWrites），用来认出改过的演示行；不给就只认没动过的。
 */
export function oldDemoRows(store: Store, stamp: string | null | undefined, batch: ReadonlySet<string> = new Set()): DemoRowRef[] {
  return plan(store, stamp, batch).rows;
}

/** 清掉旧演示行：一批打墓碑（照常进 outbox，登录了就同步删除），演示建的类型改成不显示。返回删了几行。 */
export function clearOldDemoRows(store: Store, stamp: string | null | undefined, batch: ReadonlySet<string> = new Set()): number {
  const p = plan(store, stamp, batch);
  if (!p.rows.length && !p.categories.length) return 0;
  store.batch(() => {
    for (const r of p.rows) store.remove(r.table, r.id);
    for (const id of p.categories) store.setCategoryState(id, 'hidden');
  });
  return p.rows.length;
}
