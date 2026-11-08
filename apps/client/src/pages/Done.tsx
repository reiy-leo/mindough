import { CircleCheck } from 'lucide-react';
import { doneDayLabel, doneDays, toDateKey } from '@mindough/core';
import { useStore } from '../store/StoreProvider';
import { Empty, Section } from '../ui/primitives';
import { TaskRow } from '../components/TaskRow';
import { PageHeader } from '../components/PageHeader';
import { tr, trc } from '../lib/i18n';

/**
 * 已完成（侧栏「管理 → 已完成」，#/done；Rei 2026-11-08「侧边栏 管理 添加一个"已完成"入口」）。
 * 列出完成和关闭的任务，按结束时间从新到旧，按结束那天分段（今天 / 昨天 / 具体日期）；规则在 core done-list.ts。
 * 归档项目里的任务不列（用 store.activeTasks()，和积压、待安排一样）。行用 TaskRow：点圆圈重新打开，点行在右列看详情。
 */
export function DonePage() {
  const store = useStore();
  const today = toDateKey(store.now());
  const days = doneDays(store.activeTasks());
  return (
    <div className="page">
      <PageHeader title={trc('导航', '已完成')} icon={<CircleCheck size={22} />} />
      {days.length === 0 ? (
        <Empty icon={<CircleCheck size={28} />} title={tr('还没有做完的任务')} hint={tr('做完或关闭的任务会按时间排在这里。')} />
      ) : (
        days.map((d) => (
          <Section key={d.date ?? 'none'} title={doneDayLabel(d.date, today)} extra={<span className="muted small">{tr('{length} 项', { length: d.tasks.length })}</span>}>
            <div className="task-list plain">
              {d.tasks.map((t) => (
                <TaskRow key={t.id} store={store} task={t} showMyDay={false} showCheckIn={false} />
              ))}
            </div>
          </Section>
        ))
      )}
    </div>
  );
}
