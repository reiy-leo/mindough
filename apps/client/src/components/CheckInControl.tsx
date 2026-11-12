import { Check, Pause, Play, Square } from 'lucide-react';
import { logicalToday, CheckInMetError, checkInMode, formatAmount, formatDuration, type Store, type Task } from '@mindough/core';
import { CountQuickButtons, useCountAdd } from './CountControls';
import { HoverTip } from '../ui/HoverTip';
import { Button, ProgressRing } from '../ui/primitives';
import { useUiStable } from '../lib/ui';
import { announceComplete, toggleCheckIn } from '../lib/actions';
import { Checkbox } from 'react-aria-components';
import { useNow } from '../store/StoreProvider';

import { tr } from '../lib/i18n';
import { trx } from '../lib/trx';
/** 打卡操作：点一下 / 开始·暂停·结束 / +1 / 倒数日，进度由事件折叠得出。 */
export function CheckInControl({ store, task, compact }: { store: Store; task: Task; compact?: boolean }) {
  const ui = useUiStable();
  const running = store.progress(task.id)?.running ?? false;
  const now = useNow(running ? 1000 : 30_000);
  const today = logicalToday(now);
  const p = store.progress(task.id, today);
  if (!p) return null;

  const record = (kind: Parameters<Store['checkIn']>[1], amount = 0) => {
    const prev = task.status;
    let r: ReturnType<Store['checkIn']>;
    try {
      r = store.checkIn(task.id, kind, amount, today);
    } catch (e) {
      // 达标了不能再加（Rei 2026-11-09）：按钮本来灰掉，别的设备同步过来刚好达标时兜底
      if (e instanceof CheckInMetError) return ui.toast({ message: e.message }, 2500);
      throw e;
    }
    if (r.completed) announceComplete(store, ui, r.completed, prev);
    else if (r.progress.met && task.recurrence && (kind === 'add' || kind === 'stop')) ui.toast({ tone: 'success', message: tr('今天的打卡完成了 🎉') }, 2500);
  };

  // 目标 1 的计数打卡当勾选完成（core checkInMode，Rei 2026-11-09）
  switch (checkInMode(task)) {
    case 'once':
      // 勾选圆圈（Rei 2026-11-09 01:30「打卡中"完成方式"可以选"勾选完成"」）：勾上 = 今天打卡，再点撤销
      return (
        <Checkbox className="check ci-tick" isSelected={p.met} onChange={() => toggleCheckIn(store, ui, task.id, today)} aria-label={p.met ? tr('撤销今天的打卡') : tr('打卡')}>
          <span className="check-box" aria-hidden>
            <Check size={13} strokeWidth={3} />
          </span>
        </Checkbox>
      );
    case 'count':
      return <CountCheckIn store={store} task={task} today={today} compact={compact} ratio={p.ratio} value={p.value} target={p.target ?? 1} met={p.met} />;
    case 'timer': {
      // 只放进度环，不写时长（Rei 2026-11-09 01:29「打卡进度只显示circle」）；时长在悬停提示和读屏里
      const tip = p.target
        ? tr('已计时 {value}，目标 {target}', { value: formatDuration(p.value), target: formatDuration(p.target) })
        : tr('已计时 {value}', { value: formatDuration(p.value) });
      return (
        <div className="ci-group">
          <HoverTip className={`ci-ring${p.running ? ' is-running' : ''}`} tip={tip}>
            <ProgressRing value={p.ratio} size={compact ? 26 : 30} />
          </HoverTip>
          {p.running ? (
            <>
              <Button variant="secondary" className="ci-btn" onPress={() => record('pause')} aria-label={tr('暂停')}>
                <Pause size={16} />
              </Button>
              <Button variant="primary" className="ci-btn" onPress={() => record('stop')} aria-label={tr('结束')}>
                <Square size={14} />
                {!compact && tr('结束')}
              </Button>
            </>
          ) : p.paused ? (
            <Button variant="primary" className="ci-btn" onPress={() => record('resume')} aria-label={tr('继续')}>
              <Play size={16} />
              {!compact && tr('继续')}
            </Button>
          ) : (
            <Button variant={p.met ? 'tonal' : 'primary'} className="ci-btn" onPress={() => record('start')} aria-label={tr('开始')} isDisabled={p.met}>
              {p.met ? <Check size={16} /> : <Play size={16} />}
              {!compact && (p.met ? tr('已达标') : tr('开始'))}
            </Button>
          )}
        </div>
      );
    }
    case 'countdown': {
      const n = p.value;
      return (
        <div className="ci-group">
          <span className="ci-countdown">
            {n > 0 ? (
              <>
                {trx('还有 {n} 天', { n: <b>{n}</b> }, { count: n })}
              </>
            ) : n === 0 ? (
              <b>{tr('就是今天')}</b>
            ) : (
              <>
                {trx('已过 {n} 天', { n: <b>{-n}</b> }, { count: -n })}
              </>
            )}
          </span>
          {task.status !== '完成' && !compact && (
            <Button variant="secondary" className="ci-btn" onPress={() => record('stop')}>
              <Check size={16} />
              {tr('完成')}</Button>
          )}
        </div>
      );
    }
  }
}

/** 计数：只放进度环（Rei 2026-11-09 01:29「打卡进度只显示circle，不显示"0/1"这种数值」，数字在悬停提示和读屏里）和快捷加量。手输改总数在详情里。 */
function CountCheckIn({ store, task, today, compact, ratio, value, target, met }: { store: Store; task: Task; today: string; compact?: boolean; ratio: number; value: number; target: number; met: boolean }) {
  const add = useCountAdd(store, task, today);
  return (
    <div className="ci-group">
      <HoverTip className="ci-ring" tip={countTip(value, target, task.unit)}>
        <ProgressRing value={ratio} size={compact ? 26 : 30} />
      </HoverTip>
      {/* 达标了 +1 灰掉，改成「已达标」的勾（Rei 2026-11-09 01:05「完成4/4 居然还能继续加」）；详情里能撤销、改数字 */}
      {met ? (
        <Button variant="tonal" className="ci-btn ci-met" isDisabled aria-label={tr('今天已达标')}>
          <Check size={16} />
        </Button>
      ) : (
        <CountQuickButtons task={task} add={add} compact={compact} />
      )}
    </div>
  );
}

/** 「已打 2 次，目标 4 次」「已打 500 mL，目标 2000 mL」。 */
export function countTip(value: number, target: number, unit: string | null): string {
  return unit
    ? tr('已打 {value} {unit}，目标 {target} {unit}', { value: formatAmount(value), target: formatAmount(target), unit })
    : tr('已打 {value} 次，目标 {target} 次', { value: formatAmount(value), target: formatAmount(target) });
}
