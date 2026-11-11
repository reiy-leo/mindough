import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { NewTaskInput } from '@mindough/core';
import { onLayerEntry } from './back-layers';
import { hashWithTask, taskInHash } from './router';
import { useSettings } from './settings';

import { tr } from './i18n';
export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface Toast {
  id: number;
  message: ReactNode;
  tone?: 'info' | 'success' | 'error';
  actions?: ToastAction[];
}

export interface UiCtx {
  toasts: Toast[];
  toast: (t: Omit<Toast, 'id'>, ms?: number) => void;
  dismiss: (id: number) => void;
  /**
   * 选中的任务（三列布局右列 / 手机推入的详情页）。主窗口里它就是 hash 上的 ?task=<id>：
   * 刷新还在，换页面就取消。
   */
  editingId: string | null;
  /** 选中一件任务（null = 取消选中）。手机上从没选中到选中会进一条浏览记录，系统返回键就回到列表。 */
  openEditor: (taskId: string | null) => void;
  /** 手机详情页的「返回」、右滑：选中时进过浏览记录就退回去，否则直接取消选中。 */
  closeDetail: () => void;
  /** 新建任务面板：defaults 是预填值；after 表示“接在某个任务之后”（建好后连上前后关系）；related 预先勾上的相关任务。 */
  quickCreate: ComposerRequest | null;
  openQuickCreate: (defaults?: NewTaskInput, opts?: { after?: string; related?: string[]; myDay?: boolean; people?: string[] }) => void;
  closeQuickCreate: () => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  /** 从滴答清单导入的窗口（菜单栏 文件 → 导入 → 滴答清单、设置 → 数据、⌘K）。 */
  didaImportOpen: boolean;
  setDidaImportOpen: (open: boolean) => void;
}

export interface ComposerRequest {
  defaults: NewTaskInput;
  after?: string;
  /** 从「我的一天」新建：建好放进今天（别处新建默认进待安排）。 */
  myDay?: boolean;
  related?: string[];
  /** 预先关联的人物（从人物页「新建相关任务」）。 */
  people?: string[];
}

const Ctx = createContext<UiCtx | null>(null);

/**
 * 不跟着变的 UiCtx（2026-11-12 看板卡顿）：每个字段读的都是最新值，但对象本身永远是同一个，用它的组件不会因为
 * 选中的任务、提示条、新建面板这些 UI 状态一变就重渲染。列表里每一行（TaskRow）只在点按时用 ui 的方法，用这个；
 * 要「跟着选中重渲染」的地方用 useIsEditing(id)，只有选中 / 取消选中的那一两行会重渲染。
 * 以前每行都 useUi()：点一张卡片开详情，整列表几百行全部重渲染（240 件的项目点一下要 0.5–1 秒）。
 */
const StableCtx = createContext<UiCtx | null>(null);
interface EditingSource {
  get: () => string | null;
  subscribe: (fn: () => void) => () => void;
}
const EditingCtx = createContext<EditingSource | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [editingId, setEditingId] = useState<string | null>(() => taskInHash(location.hash));
  const { layout } = useSettings();
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  useEffect(() => {
    const on = () => setEditingId(taskInHash(location.hash));
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => {
      window.removeEventListener('hashchange', on);
      window.removeEventListener('popstate', on);
    };
  }, []);
  const openEditor = useCallback(
    (id: string | null) => {
      const cur = taskInHash(location.hash);
      if (cur !== id) {
        const url = `${location.pathname}${location.search}${hashWithTask(location.hash, id)}`;
        // 手机：列表 → 详情是「推进去」，进一条记录；换一件 / 桌面上只替换，不攒记录
        // 从弹层里打开（搜索里点了任务）：记录顶上是弹层那条，换成详情这条（lib/back-layers）
        if (id && !cur && layoutRef.current === 'mobile') {
          if (onLayerEntry()) history.replaceState({ mdDetail: true }, '', url);
          else history.pushState({ mdDetail: true }, '', url);
        }
        else history.replaceState(id ? history.state : null, '', url);
      }
      setEditingId(id);
    },
    [],
  );
  const closeDetail = useCallback(() => {
    if (taskInHash(location.hash) && (history.state as { mdDetail?: boolean } | null)?.mdDetail) history.back();
    else openEditor(null);
  }, [openEditor]);
  const [quickCreate, setQuickCreate] = useState<ComposerRequest | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [didaImportOpen, setDidaImportOpen] = useState(false);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const toast = useCallback(
    (t: Omit<Toast, 'id'>, ms = 5000) => {
      const id = ++seq.current;
      setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  const value = useMemo<UiCtx>(
    () => ({
      toasts,
      toast,
      dismiss,
      editingId,
      openEditor,
      closeDetail,
      quickCreate,
      openQuickCreate: (d = {}, opts = {}) => setQuickCreate({ defaults: d, ...(opts.after ? { after: opts.after } : {}), ...(opts.related?.length ? { related: opts.related } : {}), ...(opts.myDay ? { myDay: true } : {}), ...(opts.people?.length ? { people: opts.people } : {}) }),
      closeQuickCreate: () => setQuickCreate(null),
      paletteOpen,
      setPaletteOpen,
      didaImportOpen,
      setDidaImportOpen,
    }),
    [toasts, toast, dismiss, editingId, openEditor, closeDetail, quickCreate, paletteOpen, didaImportOpen],
  );
  const latest = useRef(value);
  latest.current = value;
  const [stable] = useState<UiCtx>(() => {
    const o = {} as UiCtx;
    for (const k of Object.keys(value) as (keyof UiCtx)[]) Object.defineProperty(o, k, { get: () => latest.current[k], enumerable: true });
    return o;
  });
  // 选中的任务：渲染时记下，提交后通知订阅的行（useIsEditing）
  const editingRef = useRef(editingId);
  const listeners = useRef(new Set<() => void>());
  const [editing] = useState<EditingSource>(() => ({
    get: () => editingRef.current,
    subscribe: (fn) => {
      listeners.current.add(fn);
      return () => listeners.current.delete(fn);
    },
  }));
  useLayoutEffect(() => {
    if (editingRef.current === editingId) return;
    editingRef.current = editingId;
    for (const fn of [...listeners.current]) fn();
  }, [editingId]);
  return (
    <StableCtx.Provider value={stable}>
      <EditingCtx.Provider value={editing}>
        <Ctx.Provider value={value}>{children}</Ctx.Provider>
      </EditingCtx.Provider>
    </StableCtx.Provider>
  );
}

/** 不随 UI 状态重渲染的 ui（方法照常用、字段读到的是最新值）；见 StableCtx。 */
export function useUiStable(): UiCtx {
  const v = useContext(StableCtx);
  if (!v) throw new Error(tr('UiProvider 缺失'));
  return v;
}

const noopSub = () => () => {};
/** 这件任务是不是选中的（右列 / 浮层正在显示它）；只在它自己选中、取消选中时重渲染。 */
export function useIsEditing(id: string): boolean {
  const src = useContext(EditingCtx);
  return useSyncExternalStore(src ? src.subscribe : noopSub, () => (src ? src.get() === id : false));
}

/** 不在 UiProvider 里时是 null（编辑器单独用的时候不报错）。 */
export function useUiOptional(): UiCtx | null {
  return useContext(Ctx);
}

export function useUi(): UiCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error(tr('UiProvider 缺失'));
  return v;
}
