import { CircleCheck } from 'lucide-react';
import { doneDayLabel, doneDays } from '@mindough/core';
import { useStore } from '../store/StoreProvider';
import { Empty, Section } from '../ui/primitives';
import { TaskRow } from '../components/TaskRow';
import { tr, trc } from '../lib/i18n';

/**
 * 已完成（侧栏「管理 → 已完成」，#/done；Rei 2026-11-08「侧边栏 管理 添加一个"已完成"入口」）。
 * 列出完成和关闭的任务，按结束时间从新到旧，按结束那天分段（今天 / 昨天 / 具体日期）；规则在 core done-list.ts。
 * 只按日期分段，不能改（Rei 2026-11-12 10:19「默认按照日期分区，不能修改」）：原来右上角的分区按钮（按日期 / 不分区）去掉了，
 * 本机设置里存过的 listViews.done 不再读，也不迁移。
 * 归档项目里的任务不列（用 store.activeTasks()，和积压、待安排一样）。行用 TaskRow：点圆圈重新打开，点行在右列看详情。
 */
export function DonePage() {
  const store = useStore();
  const today = store.today();
  const days = doneDays(store.activeTasks());
  return (
    <div className="page done-page">
      {/* 不放页头（Rei 2026-11-12 10:19「已完成页：去掉header」）：电脑上没有大标题和图标，手机顶栏也不放按钮（整行收成状态栏那一截）；
          读屏还是要有页面名。第一段日期标题离顶部 26.6px，和我的一天、打卡页一样（styles/app.css .done-page） */}
      <h1 className="sr-only">{trc('导航', '已完成')}</h1>
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
