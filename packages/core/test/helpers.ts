import type { CheckIn, CheckInKind, Task } from '../src/types';
import { MemoryAdapter } from '../src/storage/memory';
import { FORMER_BUILTIN_CATEGORIES } from '../src/seed/builtin-checkin-categories';

/**
 * 老用户的库：本机已经有原来内置的 27 个类型（2026-11-12 以前每台设备打开时都预置，内置时间戳）。
 * 2026-11-12 起新库不再预置它们，要测「已经有这几个类型」的情形就从这里开库。
 */
export async function withFormerCategories(adapter = new MemoryAdapter()): Promise<MemoryAdapter> {
  await adapter.applyRemoteChanges(FORMER_BUILTIN_CATEGORIES.map((c) => ({ table: 'category' as const, row: { ...c } })));
  return adapter;
}

let n = 0;
export function ci(task_id: string, period_key: string, kind: CheckInKind, at: string | Date, amount = 0): CheckIn {
  n++;
  return {
    id: `ci-${String(n).padStart(6, '0')}`,
    updated_at: '',
    deleted: false,
    task_id,
    period_key,
    kind,
    amount,
    at: typeof at === 'string' ? at : at.toISOString(),
  };
}

export function mkTask(id: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    updated_at: '',
    deleted: false,
    body_md: id,
    status: '待办',
    group_id: null,
    scheduled_date: null,
    end_date: null,
    type_id: null,
    type_data: {},
    completion_mode: 'once',
    target_value: null,
    unit: null,
    target_date: null,
    recurrence: null,
    category_id: null,
    checkin_category_id: null,
    library_item_id: null,
    refs_mirror: null,
    remind_time: null,
    time_zone: null,
    count_config: {},
    done_at: null,
    archived_at: null,
    card_color: null,
    pinned_at: null,
    mood: null,
    checkin_note: null,
    milestone_id: null,
    lib_via: null,
    sort: 0,
    created_at: new Date(2026, 0, 1, 8).toISOString(),
    ...patch,
  };
}

/** 本地时间。 */
export const local = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
