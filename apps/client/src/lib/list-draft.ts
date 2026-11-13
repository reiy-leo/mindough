/**
 * 列表输入框的草稿（Rei 2026-11-14 06:28「每个列表的输入框输入内容后，切换后也不丢失。包括我的一天、等待安排、项目页、日记」）。
 *
 * - 打了字没提交，切到别的页、别的项目再回来，字还在；刷新、重启 App 也在。
 * - 存在这台设备的 localStorage，键是 `mindough:draft:<页面>[:<项目 id>]`，每个项目各存各的。不进同步表，不跨设备。
 * - 提交成功、或者删光了（只剩空白），就把这条草稿删掉。
 * - 输入法还在选字时不存，选完字再存（免得存进半截拼音）。
 * - 日记只存还没发的那条（正文 Markdown + 选的心情）；待发的图片不存。已经发出去的日记不受影响。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { imeComposing } from './live-save';

export const DRAFT_PREFIX = 'mindough:draft:';

export interface ListDraft {
  text: string;
  mood?: string | null;
}

/** 草稿的键：页面名，项目页再带上项目 id。 */
export function draftKey(page: string, id?: string | null): string {
  return DRAFT_PREFIX + (id ? `${page}:${id}` : page);
}

function kv(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 算不算空：正文只有空白、也没选心情。 */
export function isEmptyDraft(d: ListDraft): boolean {
  return !d.text.trim() && !d.mood;
}

export function readDraft(key: string): ListDraft | null {
  const s = kv();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<ListDraft> | null;
    if (!v || typeof v.text !== 'string') return null;
    return { text: v.text, ...(typeof v.mood === 'string' ? { mood: v.mood } : {}) };
  } catch {
    return null;
  }
}

/** 写草稿；空的就删掉。 */
export function writeDraft(key: string, d: ListDraft): void {
  const s = kv();
  if (!s) return;
  try {
    if (isEmptyDraft(d)) s.removeItem(key);
    else s.setItem(key, JSON.stringify(d.mood ? { text: d.text, mood: d.mood } : { text: d.text }));
  } catch {
    // 存满了、隐私模式：草稿只是锦上添花，不报错
  }
}

export function clearDraft(key: string): void {
  try {
    kv()?.removeItem(key);
  } catch {
    // 同上
  }
}

/**
 * 把一个输入框的内容跟草稿绑在一起。
 * 返回 [当前草稿, 改草稿, 清掉草稿]。改草稿时：输入法选字中先不写，选完字（compositionend）再写最新的一份。
 * key 变了（切到另一个项目）就换成那个键下的草稿。
 */
export function useListDraft(key: string): [ListDraft, (d: ListDraft) => void, () => void] {
  const [state, setState] = useState<{ key: string; d: ListDraft }>(() => ({ key, d: readDraft(key) ?? { text: '' } }));
  // 同一个组件换了项目：先把旧键下的存好（上面 set 时已经存过），再读新键
  let cur = state;
  if (state.key !== key) {
    cur = { key, d: readDraft(key) ?? { text: '' } };
    setState(cur);
  }
  const latest = useRef(cur);
  latest.current = cur;
  /** 选字中没写下去的那份。 */
  const owed = useRef<{ key: string; d: ListDraft } | null>(null);

  useEffect(() => {
    const done = () => {
      // compositionend 之后输入框的 onChange 才带着选好的字来：等一拍再写
      setTimeout(() => {
        const o = owed.current;
        if (!o || imeComposing()) return;
        owed.current = null;
        writeDraft(o.key, latest.current.key === o.key ? latest.current.d : o.d);
      }, 0);
    };
    document.addEventListener('compositionend', done, true);
    window.addEventListener('blur', done);
    return () => {
      document.removeEventListener('compositionend', done, true);
      window.removeEventListener('blur', done);
    };
  }, []);

  const set = useCallback((d: ListDraft) => {
    const k = latest.current.key;
    latest.current = { key: k, d };
    setState({ key: k, d });
    if (imeComposing()) owed.current = { key: k, d };
    else {
      owed.current = null;
      writeDraft(k, d);
    }
  }, []);
  const clear = useCallback(() => {
    const k = latest.current.key;
    owed.current = null;
    latest.current = { key: k, d: { text: '' } };
    setState({ key: k, d: { text: '' } });
    clearDraft(k);
  }, []);
  return [cur.d, set, clear];
}
