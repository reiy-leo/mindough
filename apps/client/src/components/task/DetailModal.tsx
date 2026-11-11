import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { ErrorBoundary } from '../ErrorBoundary';
import { useUi } from '../../lib/ui';
import { useStore } from '../../store/StoreProvider';
import { titleOf } from '../../lib/view';
import { TaskDetail, useSelectedTask } from './TaskDetail';
import { tr } from '../../lib/i18n';

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

/**
 * 看板视图的任务详情浮层（Rei 2026-11-09 00:25「项目 看板 不显示详情第三列，点击不显示详情」、00:28「切换到看板视图后，不要显示侧边的详情column」）。
 * 桌面布局下项目页切到看板时，App 不放右列（DetailPane），换成这个：点卡片弹出详情，Esc、点外面、右上角关闭都收起（取消选中）。
 * 外框用通用的 .modal.modal-center，各皮肤按自己的惯例画（skin/skins.css）：Apple 是居中的 sheet（圆角卡片、淡入上浮），
 * WinUI 是 ContentDialog 式的居中对话框（暗底、浅灰底栏），Material 是大的基本对话框（28px 圆角、surface-2 底，宽屏不用全屏对话框）。
 * 里面就是右列那份详情（TaskDetail mode="modal"）：严格模式只读、完成后留着显示「重新打开」都和右列一样。
 * 在正文或输入框里按 Esc 只让它们失焦（编辑器自己存），焦点回到浮层本身，再按一次才关浮层。
 * 正文编辑器自己接 Esc 并原生 stopPropagation，到不了这里：它的 onEscape（TaskDetail 的 Body）在浮层里同样把焦点交给浮层。
 */
export function DetailModal() {
  const ui = useUi();
  const store = useStore();
  const task = useSelectedTask();
  const modalRef = useRef<HTMLDivElement>(null);
  useSmoothRecenter(modalRef, !!task);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || e.nativeEvent.isComposing || !isTyping(e.target)) return;
    e.stopPropagation();
    // 焦点交回浮层本身（输入框跟着失焦）；只 blur 的话焦点落到 body，React Aria 的焦点圈会把它拉回输入框，再按 Esc 还是关不了
    const dlg = e.currentTarget.closest<HTMLElement>('[role="dialog"]');
    if (dlg) dlg.focus();
    else (e.target as HTMLElement).blur?.();
  };
  return (
    <ModalOverlay isOpen={!!task} onOpenChange={(open) => !open && ui.openEditor(null)} isDismissable className="overlay overlay-detail">
      <Modal ref={modalRef} className="modal modal-center modal-detail">
        <Dialog className="dialog" aria-label={task ? titleOf(store, task) || tr('任务详情') : tr('任务详情')}>
          <div className="dialog-inner modal-detail-inner" onKeyDown={onKeyDown}>
            <ErrorBoundary resetKey={ui.editingId}>
              <TaskDetail mode="modal" />
            </ErrorBoundary>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/**
 * 高度跟着内容走（Rei 2026-11-12 02:08「高度要自适应…内容少时矮，随输入内容慢慢增高，到现在的高度为最大高度」）：
 * 高度本身是 CSS 的 height: auto + max-height（app.css .modal-detail），内容少就矮，到 min(86vh, 900px) 后正文区自己滚。
 * 浮层是上下居中的，高一行顶边就往上挪半行；直接跳会一顿一顿的。这里看着外框的高度，一变就让它从原来的位置平移过去（FLIP，160ms），
 * 高度当帧就到位（不做高度动画：动画过程中正文比内容矮，会闪出滚动条、光标被拉着滚）。只有换行、加删属性时高度才变，打一个字不动。
 * 刚打开的入场动画（.modal[data-entering] rise）期间不插手；用户开着「减少动态效果」时不平移。
 */
function useSmoothRecenter(ref: RefObject<HTMLDivElement | null>, open: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!open || !el || typeof ResizeObserver === 'undefined') return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const openedAt = performance.now();
    let last = el.getBoundingClientRect().height;
    let anim: Animation | null = null;
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height;
      const delta = h - last;
      last = h;
      if (!delta || reduce || el.hasAttribute('data-entering') || performance.now() - openedAt < 250 || !el.animate) return;
      // 上一段平移还没走完：从它现在的位置接着走
      let from = delta / 2;
      if (anim) {
        const m = new DOMMatrixReadOnly(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform);
        from += m.m42;
        anim.cancel();
      }
      anim = el.animate([{ transform: `translateY(${from}px)` }, { transform: 'translateY(0)' }], { duration: 160, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
      anim.onfinish = () => (anim = null);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      anim?.cancel();
    };
  }, [ref, open]);
}
