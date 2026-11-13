/**
 * 分了区的任务清单（Rei 2026-11-08，规则见 lib/sections.ts）：每段一个能点的段标题（箭头、图标、名字、件数），点了折起 / 展开，
 * 样式借我的一天「已完成」那段（habit-archived-toggle）。折叠状态由调用方存（每个视图一份）。
 */
import type { CSSProperties, ReactNode } from 'react';
import { Button as RacButton } from 'react-aria-components';
import { CalendarClock, ChevronRight, Milestone as MilestoneIcon, Shapes, Smile, Tag } from 'lucide-react';
import { categoryIcon, groupColor, type Task } from '@mindough/core';
import { MoodIcon } from './journal/MoodIcon';
import { GroupIcon } from './project/GroupIcon';
import { IconTile } from './IconTile';
import { useColorLevel } from '../lib/color-level';
import { sectionCollapsed, toggleSectionCollapsed, type ListSection } from '../lib/sections';

function SectionIcon({ s }: { s: ListSection<Task> }) {
  if (s.kind === 'mood') return s.key === 'none' ? <Smile size={15} aria-hidden /> : <MoodIcon mood={s.key} size={16} />;
  if (s.kind === 'project') return s.group ? <GroupIcon group={s.group} size={16} /> : <Shapes size={15} aria-hidden />;
  // 按类型（Rei 2026-11-12）：类型自己的小图标块（IconTile，和类型页、侧栏一样）；「没有类型」一个中性的标签图标
  if (s.kind === 'type') return s.category ? <IconTile icon={categoryIcon(s.category)} color={s.category.color} size={16} /> : <Tag size={15} aria-hidden />;
  // 按里程碑（Rei 2026-11-13）：里程碑和「没有里程碑」都用 milestone 图标
  if (s.kind === 'milestone') return <MilestoneIcon size={15} aria-hidden />;
  return <CalendarClock size={15} aria-hidden />;
}

/** 多彩档分区标题的颜色：心情用心情色，项目用项目色，类型用类型色；「没有心情 / 没有项目 / 没有类型」和日期分区不上色。 */
function tint(s: ListSection<Task>): CSSProperties | undefined {
  if (s.kind === 'mood' && s.key !== 'none') return { '--section-tint': `var(--mood-${s.key})` } as CSSProperties;
  if (s.kind === 'project' && s.group) return { '--section-tint': groupColor(s.group) } as CSSProperties;
  if (s.kind === 'type' && s.category?.color) return { '--section-tint': s.category.color } as CSSProperties;
  return undefined;
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
  // 多彩档（色彩设置，Rei 2026-11-09）：心情 / 项目 / 类型分区的标题直接用彩色文字，不放色点（混一点正文色保住对比度，见 color-level.css）
  const vivid = useColorLevel() === 'vivid';
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
              <span className={`section-title${vivid && tint(s) ? ' is-tinted' : ''}`} style={vivid ? tint(s) : undefined}>
                {/* 按心情分区：标题前一个心情色的小圆点，「没有心情」用中性灰（Rei 2026-11-08 23:49）；多彩档换成彩色文字 */}
                {s.kind === 'mood' && !(vivid && tint(s)) && <span className={`section-dot mood-dot${s.key === 'none' ? ' is-none' : ` mood-${s.key}`}`} aria-hidden />}
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
