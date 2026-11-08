/**
 * 分了区的任务清单（Rei 2026-11-08，规则见 lib/sections.ts）：每段一个能点的段标题（箭头、图标、名字、件数），点了折起 / 展开，
 * 样式借我的一天「已完成」那段（habit-archived-toggle）。折叠状态由调用方存（每个视图一份）。
 */
import type { ReactNode } from 'react';
import { Button as RacButton } from 'react-aria-components';
import { CalendarClock, ChevronRight, Shapes, Smile } from 'lucide-react';
import type { Task } from '@mindough/core';
import { MoodIcon } from './journal/MoodIcon';
import { GroupIcon } from './project/GroupIcon';
import { sectionCollapsed, toggleSectionCollapsed, type ListSection } from '../lib/sections';

function SectionIcon({ s }: { s: ListSection<Task> }) {
  if (s.kind === 'mood') return s.key === 'none' ? <Smile size={15} aria-hidden /> : <MoodIcon mood={s.key} size={16} />;
  if (s.kind === 'project') return s.group ? <GroupIcon group={s.group} size={16} /> : <Shapes size={15} aria-hidden />;
  return <CalendarClock size={15} aria-hidden />;
}

export function SectionedList<T extends Task>({
  sections,
  collapsed,
  onCollapsedChange,
  idPrefix,
  renderList,
}: {
  sections: ListSection<T>[];
  collapsed: readonly string[];
  onCollapsedChange: (next: string[]) => void;
  /** 段的 DOM id 前缀（aria-controls 用），一页里唯一 */
  idPrefix: string;
  renderList: (tasks: T[], s: ListSection<T>) => ReactNode;
}) {
  return (
    <>
      {sections.map((s) => {
        const closed = sectionCollapsed(collapsed, s);
        const id = `${idPrefix}-${s.kind}-${s.key}`;
        return (
          <section key={`${s.kind}:${s.key}`} className={`section list-section is-${s.kind}${closed ? '' : ' is-open'}`} data-section={`${s.kind}:${s.key}`}>
            <RacButton className="habit-archived-toggle list-section-toggle" aria-expanded={!closed} aria-controls={id} onPress={() => onCollapsedChange(toggleSectionCollapsed(collapsed, s))}>
              <ChevronRight size={15} className="habit-archived-chevron" aria-hidden />
              <SectionIcon s={s as ListSection<Task>} />
              <span className="section-title">
                {s.label} <span className="count">{s.tasks.length}</span>
              </span>
            </RacButton>
            {!closed && <div id={id}>{renderList(s.tasks, s)}</div>}
          </section>
        );
      })}
    </>
  );
}
