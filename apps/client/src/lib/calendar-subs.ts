/**
 * 日历订阅（Rei 2026-11-10，docs/CALENDAR.md 第五节）：用户自己加的只读 ICS。
 * - 订阅列表是同步表 calendar_sub（Store 写）；拉到的事件、同步状态、「这台设备看不看」只存本机 localStorage。
 * - 经 Worker /api/calendar/ics 代拉（同节假日订阅），core parseIcsEvents 解析，只展开今天前 1 年到后 2 年。
 * - 到点自动拉：启动、回到前台、每小时看一眼，6 小时没成功就拉（core calSubDue）；挂在 App 里一次（useCalendarSubScheduler）。
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  addDays,
  calSubDue,
  orderSubs,
  parseIcsEvents,
  toDateKey,
  type CalendarSub,
  type CalSubState,
  type CalSubStatus,
  type DateKey,
  type IcsEvent,
  type Store,
} from '@mindough/core';
import { API_BASE } from './account';

const STATE_KEY = 'mindough:cal-sub-state';
const HIDDEN_KEY = 'mindough:cal-sub-hidden';
const dataKey = (id: string) => `mindough:cal-sub-data:${id}`;

interface Snapshot {
  states: Record<string, CalSubState>;
  events: Record<string, IcsEvent[]>;
  hidden: string[];
  syncing: string[];
}

function readJson<T>(key: string, dflt: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
    return v ?? dflt;
  } catch {
    return dflt;
  }
}

function loadEvents(id: string): IcsEvent[] {
  const v = readJson<IcsEvent[]>(dataKey(id), []);
  return Array.isArray(v) ? v : [];
}

let snap: Snapshot = { states: readJson(STATE_KEY, {}), events: {}, hidden: readJson<string[]>(HIDDEN_KEY, []), syncing: [] };
const listeners = new Set<() => void>();
function emit(next: Partial<Snapshot>) {
  snap = { ...snap, ...next };
  for (const f of listeners) f();
}
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

export function useCalendarSubState(): Snapshot {
  return useSyncExternalStore(subscribe, () => snap);
}

/** 订阅列表（没删的，按顺序）。 */
export function calendarSubs(store: Store): CalendarSub[] {
  return orderSubs(store.list('calendar_sub'));
}

function eventsOf(id: string): IcsEvent[] {
  let e = snap.events[id];
  if (!e) {
    e = loadEvents(id);
    snap = { ...snap, events: { ...snap.events, [id]: e } };
  }
  return e;
}

export function setSubHidden(id: string, hidden: boolean) {
  const next = hidden ? [...new Set([...snap.hidden, id])] : snap.hidden.filter((x) => x !== id);
  localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
  emit({ hidden: next });
}

/** 删订阅时顺手清掉本机数据。 */
export function forgetSubData(id: string) {
  localStorage.removeItem(dataKey(id));
  const { [id]: _s, ...states } = snap.states;
  const { [id]: _e, ...events } = snap.events;
  localStorage.setItem(STATE_KEY, JSON.stringify(states));
  emit({ states, events, hidden: snap.hidden.filter((x) => x !== id) });
}

/** 拉一次。fresh = 「立即刷新」（Worker 不用缓存）。 */
export async function syncCalendarSub(sub: Pick<CalendarSub, 'id' | 'url'>, opts: { fresh?: boolean; fetcher?: typeof fetch; now?: Date } = {}): Promise<{ status: CalSubStatus; name: string | null }> {
  const fetcher = opts.fetcher ?? fetch;
  const nowD = opts.now ?? new Date();
  emit({ syncing: [...snap.syncing, sub.id] });
  const prev = snap.states[sub.id]?.url === sub.url ? snap.states[sub.id]! : null;
  const now = nowD.toISOString();
  let status: CalSubStatus;
  let events: IcsEvent[] | null = null;
  let name: string | null = null;
  try {
    const res = await fetcher(`${API_BASE}/api/calendar/ics?url=${encodeURIComponent(sub.url)}${opts.fresh ? '&fresh=1' : ''}`, { headers: { accept: 'text/calendar' } });
    if (res.ok) {
      const today = toDateKey(nowD);
      const parsed = parseIcsEvents(await res.text(), { from: addDays(today, -366), to: addDays(today, 731) });
      if (!parsed) status = { ok: false, code: null, reason: 'not_ics' };
      else {
        events = parsed.events;
        name = parsed.name;
        status = { ok: true, count: parsed.events.length, truncated: parsed.truncated };
      }
    } else {
      const body = (await res.json().catch(() => null)) as { upstream_status?: number } | null;
      if (res.status === 415) status = { ok: false, code: 415, reason: 'not_ics' };
      else if (body?.upstream_status) status = { ok: false, code: body.upstream_status, reason: 'upstream' };
      else status = { ok: false, code: res.status, reason: 'http' };
    }
  } catch {
    status = { ok: false, code: null, reason: 'offline' };
  }
  const state: CalSubState = { url: sub.url, okAt: status.ok ? now : (prev?.okAt ?? null), triedAt: now, status };
  const states = { ...snap.states, [sub.id]: state };
  localStorage.setItem(STATE_KEY, JSON.stringify(states));
  const syncing = snap.syncing.filter((x) => x !== sub.id);
  if (events) {
    try {
      localStorage.setItem(dataKey(sub.id), JSON.stringify(events));
    } catch {
      /* 存不下就只留在内存里 */
    }
    emit({ states, events: { ...snap.events, [sub.id]: events }, syncing });
  } else {
    // 失败：同一个地址的旧数据照常显示；换了地址的不显示
    if (!prev) {
      localStorage.removeItem(dataKey(sub.id));
      emit({ states, events: { ...snap.events, [sub.id]: [] }, syncing });
    } else emit({ states, syncing });
  }
  return { status, name };
}

/** 到点自动拉。挂在 App 里一次。 */
export function useCalendarSubScheduler(store: Store) {
  const subs = calendarSubs(store);
  const sig = subs.map((s) => `${s.id}=${s.url}`).join('|');
  useEffect(() => {
    if (!subs.length) return;
    const check = () => {
      if (!navigator.onLine) return;
      for (const s of subs) if (!snap.syncing.includes(s.id) && calSubDue(snap.states[s.id] ?? null, s.url, Date.now())) void syncCalendarSub(s);
    };
    check();
    const timer = window.setInterval(check, 3_600_000);
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
}

/** 日历页用的一个事件：带订阅的 id、名字、颜色。 */
export interface CalEvent extends IcsEvent {
  /** 页面里唯一（订阅 id + 事件 key）。 */
  id: string;
  subId: string;
  subName: string;
  color: string;
  start: DateKey;
  end: DateKey;
}

/** 这台设备上看得到的订阅事件（隐藏的不要；地址改了还没拉到的不要）。 */
export function useCalendarEvents(store: Store): CalEvent[] {
  const subs = calendarSubs(store);
  const s = useCalendarSubState();
  const sig = subs.map((x) => `${x.id}=${x.url}=${x.color}=${x.name}`).join('|');
  return useMemo(() => {
    const out: CalEvent[] = [];
    for (const sub of subs) {
      if (s.hidden.includes(sub.id)) continue;
      const st = s.states[sub.id];
      if (!st || st.url !== sub.url) continue;
      for (const e of s.events[sub.id] ?? eventsOf(sub.id)) out.push({ ...e, id: `${sub.id}:${e.key}`, subId: sub.id, subName: sub.name, color: sub.color, start: e.startDate, end: e.endDate });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, s]);
}
