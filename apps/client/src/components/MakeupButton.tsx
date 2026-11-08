/**
 * 补打卡按钮（Rei 2026-11-09 01:52「打卡任务中，下一次节点前，显示补打卡图标按钮。每天重复的打卡不显示。」）。
 * 只在能补的时候出现（core makeupNode：不是每天打、上一个节点没达标、还没到下一个节点）；严格模式下不出现。
 * 点了放进今天的我的一天（lib/actions startMakeup）；已经在里面了按钮是按下的样子。
 */
import { History } from 'lucide-react';
import { formatDate, toDateKey, type Store, type Task } from '@mindough/core';
import { useNow } from '../store/StoreProvider';
import { useUi } from '../lib/ui';
import { useSettings } from '../lib/settings';
import { startMakeup } from '../lib/actions';
import { TipButton } from '../ui/primitives';
import { tr } from '../lib/i18n';

export function MakeupButton({ store, task, className }: { store: Store; task: Task; className?: string }) {
  const ui = useUi();
  const now = useNow();
  const { settings } = useSettings();
  if (settings.strictMode) return null;
  const node = store.makeupNode(task.id, toDateKey(now));
  if (!node) return null;
  const inDay = store.isInMyDay(task.id);
  const when = formatDate(node, { weekday: true });
  return (
    <TipButton
      tip={inDay ? tr('补 {when} 的打卡 · 已在我的一天', { when }) : tr('补打卡：补 {when} 的', { when })}
      isPressed={inDay}
      className={`btn btn-quiet icon-btn makeup-btn${inDay ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
      onPress={() => startMakeup(store, ui, task.id)}
    >
      <History size={16} aria-hidden />
    </TipButton>
  );
}
