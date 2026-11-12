import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode, type TouchEvent } from 'react';
import { Button as RacButton, Checkbox, Menu, MenuItem, Popover, Separator } from 'react-aria-components';
import { Ban, Check, CirclePlay, Globe, GripVertical, Link2, Lock, PanelRight, Pin, PinOff, Plug, Repeat, Sun, SunDim, X } from 'lucide-react';
import { HoverTip } from '../ui/HoverTip';
import { categoryIcon, checkInMode, groupColor, describeRecurrence, isCheckInTask, isHabit, isTaskOverdue, parseRecurrence, timeZoneBadge, toDateKey, type Store, type Task } from '@mindough/core';
import { useIsEditing, useUiStable } from '../lib/ui';
import { toggleCheckIn, toggleDone, toggleMyDay, togglePin } from '../lib/actions';
import { STATE_CLASS, viewOf } from '../lib/view';
import { rowMenu } from '../lib/task-menu';
import { useLocked } from '../lib/strict';
import { MoodIcon } from './journal/MoodIcon';
import { isMoodId, moodLabel } from '@mindough/core';
import { isDragPress } from '../lib/drag-guard';
import { installLongPressGuard, longPressNow, longPressStillValid, movedTooFar } from '../lib/long-press';
import { typeIcon } from '../lib/icons';
import { TaskDateText } from './TaskDateText';
import { useLunarUi } from '../lib/lunar';
import { AvatarStack } from './Avatar';
import { CheckInControl } from './CheckInControl';
import { MakeupButton } from './MakeupButton';
import { ItemArt, layoutShape } from './library/Library';

import { dataLabel, tr } from '../lib/i18n';
import { GroupIcon } from './project/GroupIcon';
import { useColorLevel, vividText, vividVar } from '../lib/color-level';
import { useSettings } from '../lib/settings';
export interface TaskRowProps {
  store: Store;
  task: Task;
  showGroup?: boolean;
  showDate?: boolean;
  showMyDay?: boolean;
  /** 我的一天里：重复任务按“今天达标”显示勾。 */
  doneOverride?: boolean;
  trailing?: ReactNode;
  /** 打卡任务是否显示行内打卡按钮。 */
  showCheckIn?: boolean;
}

/**
 * 行首缩略图。挂了资料的任务（hasItem）只显示第一条资料的图，没图就什么都不显示（Rei 2026-11-03「电影B只是显示海报缩略图」）；
 * 没挂资料的照旧：类型的图片字段 / 人物头像，有版式的类型没图时显示类型图标。name 给了就用按名字生成的渐变占位（⌘K 的资料结果）。
 */
export function TaskThumb({ media, layout, isAvatar, color, icon, name, hasItem = false }: { media: string | null; layout: string; isAvatar: boolean; color?: string; icon?: string; name?: string | null; hasItem?: boolean }) {
  const Icon = typeIcon(icon);
  if (media) return <img className={`thumb thumb-${isAvatar ? 'avatar' : layout}`} src={media} alt="" />;
  if (hasItem || layout === 'text') return null;
  if (name) return <ItemArt src={null} name={name} shape={layoutShape(layout)} className={`thumb thumb-${layout}`} />;
  return (
    <span className="thumb thumb-icon" style={{ color }}>
      <Icon size={16} />
    </span>
  );
}

/**
 * 拖动把手那一格。置顶不再放图钉（Rei 2026-11-12 05:00「置顶的任务在任务列表中不显示前面的 pin icon，而是用粗体显示任务标题」，
 * 原来 2026-11-09 01:03 起这格放红色图钉）：置顶的标题加粗（TaskRow 的 .row-title.is-pinned），这格和别的行一样——
 * 能拖（待安排、看板）是把手，读屏多念一句「已置顶」；不能拖（我的一天，置顶的固定在最上）留同宽占位，行和别的对齐。
 */
export const LEAD_GRIP_SIZE = 15;
export function RowLead({ pinned, dragLabel }: { pinned: boolean; dragLabel?: string }) {
  if (!dragLabel) return <span className="drag-handle is-placeholder" aria-hidden />;
  return (
    <RacButton slot="drag" className="drag-handle" aria-label={pinned ? `${tr('已置顶')} · ${dragLabel}` : dragLabel}>
      <GripVertical size={LEAD_GRIP_SIZE} />
    </RacButton>
  );
}

export function TaskRow({ store, task, showGroup = true, showDate = false, showMyDay = true, doneOverride, trailing, showCheckIn = true }: TaskRowProps) {
  // 不订阅整个 UI 状态（2026-11-12 看板卡顿）：选中只看自己这件，别的行选中 / 取消时不重渲染
  const ui = useUiStable();
  const v = viewOf(store, task);
  const today = toDateKey(store.now());
  const lunarUi = useLunarUi();
  const tzBadge = timeZoneBadge(task, task.scheduled_date);
  const checkIn = isCheckInTask(task);
  // 严格模式下完成 / 关闭的任务（Rei 2026-11-08）：不能加入 / 移出我的一天、置顶
  const locked = useLocked(task);
  const closed = task.status === '关闭';
  // 勾选完成的打卡（Rei 2026-11-09 01:30）：行首是勾选圆圈，勾上 = 今天打卡，再点撤销
  const tick = isHabit(task) && checkInMode(task) === 'once' && !closed && task.status !== '完成';
  const done = !closed && (doneOverride ?? (tick ? !!store.progress(task.id, today)?.met : task.status === '完成'));
  // 置顶的每天都在我的一天里（Rei 2026-11-08）
  const pinned = store.isPinned(task);
  const inDay = pinned || store.isInMyDay(task.id, today);
  const state = v.derived?.state;
  const rec = parseRecurrence(task.recurrence);
  // 打卡（重复的倒数日不算，Rei 2026-11-12）：行首重复图标、补打卡按钮只给打卡
  const habit = isHabit(task);
  const TypeIcon = typeIcon(v.type?.icon);
  // 内置的标记类型不写进第二行：置顶行里有红色图钉，收藏 / 紧急 / 重要让标题变色（Rei 2026-11-12）
  const cats = store.categoriesOfTaskNoPin(task);
  const mark = store.titleMark(task);
  const items = store.itemsOfTask(task);
  const CategoryIcon = typeIcon(cats[0] ? categoryIcon(cats[0]) : undefined);
  // 资料不写进第二行（Rei 2026-11-03：资料只显示缩略图，没图就不显示）。第一条资料不算进 +N，其余的才算，悬停看全部
  const more = Math.max(0, cats.length - 1) + Math.max(0, items.length - 1);
  const allRefs = [...cats.map((c) => dataLabel(c.name)), ...items.map((i) => i.name)].join(tr('、'));
  const isCheckInRow = checkIn && !tick && (task.completion_mode !== 'once' || !!rec);
  const relatedCount = store.relatedTasks(task.id).length;
  // 三列布局：右列正在显示这件
  const selected = useIsEditing(task.id);
  // 色彩设置（Rei 2026-11-09）：多彩档第二行的项目名、类型名用各自颜色（调到能读），打卡进度环用打卡类型的颜色
  const colorLevel = useColorLevel();
  const { theme } = useSettings();
  const typeTint = (c: string | null | undefined) => vividText(colorLevel, c, theme) ?? c ?? undefined;

  // 行的长按菜单（手机）：查看详情 ｜ 加入 / 移出我的一天、置顶。
  // 右键不再开菜单（Rei 2026-11-08 23:39「任务列表都删掉右键菜单」）：onContextMenu 只 preventDefault，也不落回浏览器 / 系统菜单。
  // 菜单里的事详情都能做：顶栏太阳、「…」里的我的一天和置顶；点行本身就是查看详情。
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  const longPressed = useRef(false);
  const onContextMenu = (e: MouseEvent) => e.preventDefault();
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };
  const onPointerDown = (e: PointerEvent) => {
    longPressed.current = false;
    if (e.pointerType !== 'touch') return;
    installLongPressGuard();
    const { clientX: x, clientY: y } = e;
    cancelPress();
    const pressedAt = longPressNow();
    press.current = {
      x,
      y,
      timer: window.setTimeout(() => {
        press.current = null;
        // 按下以后列表滚过、或刚滚完：是在滑，不是长按
        if (!longPressStillValid(pressedAt)) return;
        longPressed.current = true;
        setMenuAt({ x, y });
      }, 500),
    };
  };
  const onPointerMove = (e: PointerEvent) => {
    const p = press.current;
    if (p && movedTooFar(p, { x: e.clientX, y: e.clientY })) cancelPress();
  };
  // 浏览器接手滚动后 pointermove 不来了，touchmove 还来
  const onTouchMove = (e: TouchEvent) => {
    const p = press.current;
    const t = e.touches[0];
    if (p && t && movedTooFar(p, { x: t.clientX, y: t.clientY })) cancelPress();
  };

  return (
    <div
      ref={rowRef}
      className={`task-row ${STATE_CLASS[state ?? ''] ? `row-${STATE_CLASS[state!]}` : ''}${done ? ' is-done' : ''}${closed ? ' is-closed' : ''}${selected ? ' is-selected' : ''}`}
      data-task-id={task.id}
      style={isCheckInRow ? vividVar(colorLevel, cats[0]?.color ?? v.type?.color, '--ci-color') : undefined}
      onContextMenu={onContextMenu}
      // 捕获阶段：行里的按钮（React Aria usePress）会拦住冒泡的 pointerdown
      onPointerDownCapture={onPointerDown}
      onPointerMoveCapture={onPointerMove}
      onTouchMoveCapture={onTouchMove}
      onPointerUpCapture={cancelPress}
      onPointerCancelCapture={cancelPress}
    >
      {isCheckInRow ? (
        <span className="row-lead" aria-hidden>
          {habit ? <Repeat size={17} /> : <TypeIcon size={18} style={{ color: v.type?.color }} />}
        </span>
      ) : (
        <Checkbox
          className={`check${closed ? ' is-closed' : ''}`}
          isSelected={done || closed}
          onChange={() => (tick ? toggleCheckIn(store, ui, task.id, today) : toggleDone(store, ui, task.id))}
          aria-label={tick ? (done ? tr('撤销今天的打卡') : tr('打卡')) : closed ? tr('已关闭，轻点可重新打开') : done ? tr('标为未完成') : tr('标为完成')}
        >
          <span className="check-box" aria-hidden>
            {closed ? <X size={13} strokeWidth={3} /> : <Check size={13} strokeWidth={3} />}
          </span>
        </Checkbox>
      )}
      <TaskThumb media={v.media} layout={v.thumbLayout} isAvatar={v.mediaIsAvatar} color={v.type?.color} icon={v.type?.icon} hasItem={v.hasItem} />
      <RacButton className="row-main" aria-current={selected ? 'true' : undefined} onPress={() => {
          // 长按出菜单后松手不算点开
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          // 拖动排序的尾巴不算点开：不选中、不打开详情（lib/drag-guard）
          if (isDragPress()) return;
          ui.openEditor(task.id);
        }}
      >
        {/* 第一行是任务标题 = 正文第一行，挂了资料也一样（Rei 2026-11-03）；资料只在行首显示缩略图 */}
        {/* 挂了收藏 / 紧急 / 重要：标题变暗黄 / 暗红 / 暗蓝（Rei 2026-11-12 04:41；紧急 > 重要 > 收藏，颜色见 styles/app.css .row-title.is-mark-*） */}
        {/* 置顶：标题加粗，不放图钉（Rei 2026-11-12 05:00）；做完 / 关闭的不加粗（styles/app.css .row-title.is-pinned） */}
        <span className={`row-title${mark ? ` is-mark-${mark}` : ''}${pinned ? ' is-pinned' : ''}`}>
          {v.title}
        </span>
        {pinned && <span className="sr-only">{tr('已置顶')}</span>}
        <span className="row-meta">
          {/* 类型（Rei 2026-10-28 能挂多个）：克制地写「游戏 +2」——第一个类型，其余类型和资料合成 +N，悬停看全部 */}
          {cats.length > 0 && (
            <span className="meta-type meta-refs" style={{ color: typeTint(cats[0]?.color ?? v.type?.color) }}>
              <CategoryIcon size={12} />
              {dataLabel(cats[0]!.name)}
              {more > 0 && (
                <HoverTip className="meta-more" tip={allRefs}>
                  {' '}+{more}
                </HoverTip>
              )}
            </span>
          )}
          {!cats.length && v.type && v.type.layout !== 'text' && (
            <span className="meta-type" style={{ color: typeTint(v.type.color) }}>
              <TypeIcon size={12} />
              {dataLabel(v.type.name)}
              {more > 0 && (
                <HoverTip className="meta-more" tip={allRefs}>
                  {' '}+{more}
                </HoverTip>
              )}
            </span>
          )}
          {showGroup && v.group && (
            <span className="meta-group" style={colorLevel === 'vivid' ? { color: vividText(colorLevel, groupColor(v.group), theme) } : undefined}>
              <GroupIcon group={v.group} size={14} /> {v.group.name}
            </span>
          )}
          {showDate && task.scheduled_date && (
            <span className={`meta-date${isTaskOverdue(task, store.now(), today) && !done && !closed ? ' is-overdue' : ''}`}>
              <TaskDateText task={task} today={today} relative />
            </span>
          )}
          {/* 按天分组的列表不写日期，但任务时区和设备不同时照样标出偏移（Rei 2026-10-25 任务时区） */}
          {!showDate && tzBadge && (
            <HoverTip className="meta-tz" tip={tr('时区：{zone}', { zone: task.time_zone ?? '' })}>
              <Globe size={11} aria-hidden />
              {tzBadge}
            </HoverTip>
          )}
          {rec && (
            <span className="meta-rec">
              <Repeat size={11} />
              {describeRecurrence(rec, { lunar: lunarUi, today })}
            </span>
          )}
          {/* 心情（Rei 2026-11-08）：小图标，悬停看名字 */}
          {isMoodId(task.mood) && (
            <HoverTip className="meta-mood" tip={tr('心情：{label}', { label: moodLabel(task.mood) })}>
              <MoodIcon mood={task.mood} size={14} />
            </HoverTip>
          )}
          {relatedCount > 0 && (
            <HoverTip className="meta-related" tip={tr('{relatedCount} 件相关任务', { relatedCount })}>
              <Link2 size={11} aria-hidden />
              {relatedCount}
            </HoverTip>
          )}
          {/* 状态只用图标标在标题下，悬停看文字；不给整行上色；排在属性后面（Rei 2026-10-27） */}
          {state === '被阻塞' && (
            <HoverTip className="meta-state state-blocked" tip={tr('还在等 {length} 件事', { length: v.derived!.missing.length })}>
              <Lock size={12} aria-hidden />
              {v.derived!.missing.length}
            </HoverTip>
          )}
          {state === '可开始' && store.edges().some((e) => e.succ_id === task.id) && (
            <HoverTip className="meta-state state-ready" tip={tr('可开始')}>
              {/* 插头、绿色（Rei 2026-11-09 01:03「可开始的icon用plug，颜色用绿色」） */}
              <Plug size={12} aria-hidden />
            </HoverTip>
          )}
          {task.status === '进行中' && (
            <HoverTip className="meta-state state-doing" tip={tr('进行中')}>
              <CirclePlay size={12} aria-hidden />
            </HoverTip>
          )}
          {closed && (
            <HoverTip className="meta-state state-closed" tip={tr('已关闭')}>
              <Ban size={12} aria-hidden />
            </HoverTip>
          )}
        </span>
      </RacButton>
      <AvatarStack store={store} people={v.people.filter((p) => !(v.mediaIsAvatar && v.data.person === p.id))} />
      {/* 补打卡（Rei 2026-11-09 01:52）：能补的时候在打卡控件前面出一个按钮（勾选完成的重复打卡也出），在我的一天里是按下的样子。
          两个包在一起（Rei 2026-11-09 03:43「打卡进度和补打卡图标都放在右侧。如果宽度窄，则上下结构」）；05:19 起始终并排（「始终左右结构」），补打卡在左、进度在右 */}
      {showCheckIn && (habit || isCheckInRow) && (
        <span className="row-checkin">
          {habit && <MakeupButton store={store} task={task} />}
          {isCheckInRow && <CheckInControl store={store} task={task} compact />}
        </span>
      )}
      {trailing}
      {showMyDay && (
        <RacButton
          className={`icon-btn myday-btn${inDay ? ' is-on' : ''}`}
          aria-label={inDay ? tr('移出我的一天') : tr('加入我的一天')}
          isDisabled={locked}
          onPress={() => toggleMyDay(store, ui, task.id)}
        >
          {inDay ? <Sun size={17} /> : <SunDim size={17} />}
        </RacButton>
      )}
      {menuAt && (
        <>
          <span ref={anchorRef} className="row-menu-anchor" style={{ left: menuAt.x, top: menuAt.y }} aria-hidden />
          <Popover
            triggerRef={anchorRef}
            isOpen
            onOpenChange={(open) => !open && setMenuAt(null)}
            className="popover menu-popover"
            placement="bottom start"
            offset={2}
          >
            <Menu
              className="menu"
              aria-label={tr('任务操作')}
              autoFocus="first"
              onAction={(k) => {
                setMenuAt(null);
                if (k === 'open') ui.openEditor(task.id);
                else if (k === 'myday') toggleMyDay(store, ui, task.id);
                else if (k === 'pin' || k === 'unpin') togglePin(store, ui, task.id);
              }}
            >
              {rowMenu(inDay, pinned, store.pinEnabled()).filter((i) => !locked || i.id === 'open').flatMap((i, n) => [
                ...(i.separator && n > 0 ? [<Separator key={`sep-${i.id}`} className="menu-sep" />] : []),
                <MenuItem key={i.id} id={i.id} className="menu-item" textValue={i.label}>
                  {i.id === 'open' ? <PanelRight size={16} /> : i.id === 'pin' ? <Pin size={16} /> : i.id === 'unpin' ? <PinOff size={16} /> : inDay ? <Sun size={16} /> : <SunDim size={16} />}
                  <span>{i.label}</span>
                </MenuItem>,
              ])}
            </Menu>
          </Popover>
        </>
      )}
    </div>
  );
}
