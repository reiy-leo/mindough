import type { KeyboardEvent } from 'react';
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
 * 在正文或输入框里按 Esc 只让它们失焦（编辑器自己存），再按一次才关浮层。
 */
export function DetailModal() {
  const ui = useUi();
  const store = useStore();
  const task = useSelectedTask();
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || e.nativeEvent.isComposing || !isTyping(e.target)) return;
    e.stopPropagation();
    (e.target as HTMLElement).blur?.();
  };
  return (
    <ModalOverlay isOpen={!!task} onOpenChange={(open) => !open && ui.openEditor(null)} isDismissable className="overlay overlay-detail">
      <Modal className="modal modal-center modal-detail">
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
