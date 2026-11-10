/**
 * 侧边栏 / 「更多」页里一串置顶项的拖动排序范围（Rei 2026-11-10，手势和动画见 lib/nav-reorder）。
 * 只是个 context，不出 DOM：置顶的项目 / 资料库链接用 usePinnedReorder(id) 拿到要铺在 <a> 上的属性。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { useStore } from '../store/StoreProvider';
import { useNavReorder, type NavReorder } from '../lib/nav-reorder';

export type PinnedKind = 'group' | 'library';

type Ctx = {
  reorder: NavReorder;
  /** 长按拿起又原地松开时开哪个菜单（侧栏项注册自己的右键菜单）。 */
  register: (id: string, open: ((at: { x: number; y: number }) => void) | null) => void;
};

const ReorderCtx = createContext<Ctx | null>(null);

export function NavReorderScope({ kind, ids, children }: { kind: PinnedKind; ids: readonly string[]; children: ReactNode }) {
  const store = useStore();
  const openers = useRef(new Map<string, (at: { x: number; y: number }) => void>());
  const onCommit = useCallback(
    (next: string[]) => (kind === 'group' ? store.reorderSidebarGroups(next) : store.reorderSidebarLibraries(next)),
    [store, kind],
  );
  const reorder = useNavReorder({
    group: kind,
    ids,
    onCommit,
    onLiftRelease: (id, at) => openers.current.get(id)?.(at),
  });
  const register = useCallback<Ctx['register']>((id, open) => {
    if (open) openers.current.set(id, open);
    else openers.current.delete(id);
  }, []);
  const value = useMemo(() => ({ reorder, register }), [reorder, register]);
  return <ReorderCtx.Provider value={value}>{children}</ReorderCtx.Provider>;
}

/**
 * 给一个置顶项：在拖动范围里时返回铺在 <a> 上的属性（含合进去的右键菜单），不在范围里返回 {}。
 * openMenu：手指长按没挪就松开时开的菜单；没有就不开。
 */
export function usePinnedReorder(
  id: string | undefined,
  opts: { onContextMenu?: (e: ReactMouseEvent<HTMLElement>) => void; openMenu?: (at: { x: number; y: number }) => void } = {},
) {
  const ctx = useContext(ReorderCtx);
  const { openMenu } = opts;
  useEffect(() => {
    if (!ctx || !id || !openMenu) return;
    ctx.register(id, openMenu);
    return () => ctx.register(id, null);
  }, [ctx, id, openMenu]);
  if (!ctx || !id) return { active: false as const, props: {} };
  return { active: true as const, props: ctx.reorder.itemProps(id, opts.onContextMenu ? { onContextMenu: opts.onContextMenu } : undefined) };
}
