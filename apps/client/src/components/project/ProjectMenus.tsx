/**
 * 项目页右上角的两个图标按钮（Rei 2026-10-26「视图和排序放在右上角图标按钮，点击dropdown」）：
 * 视图（图标跟着当前视图变）和排序（字段一组 + 正序 / 倒序一组），都是 React Aria 菜单、单选打勾。
 */
import type { ReactNode } from 'react';
import { Header, Menu, MenuItem, MenuSection, MenuTrigger, Popover, Button as RacButton, Separator } from 'react-aria-components';
import { ArrowDownWideNarrow, ArrowUpDown, ArrowUpNarrowWide, Check, GanttChart, Kanban, LayoutList, Rows3, Workflow, type LucideIcon } from 'lucide-react';
import type { SectionBy } from '../../lib/sections';
import { DEFAULT_PREFS, SORT_FIELDS, type ProjectView, type SortDir, type SortField } from '../../lib/project-view';
import { Tip } from '../../ui/primitives';

import { tr, trc } from '../../lib/i18n';

export const VIEW_ICON: Record<ProjectView, LucideIcon> = { list: LayoutList, board: Kanban, timeline: GanttChart, chain: Workflow };

export const VIEW_LABEL: Record<ProjectView, () => string> = {
  list: () => tr('列表'),
  board: () => tr('看板'),
  timeline: () => tr('时间轴'),
  chain: () => tr('任务链'),
};

const SORT_LABEL: Record<SortField, () => string> = {
  created: () => tr('创建时间'),
  updated: () => tr('修改时间'),
  start: () => tr('开始时间'),
  due: () => tr('到期时间'),
  mood: () => tr('心情'),
};

/** 分区方式的名字（Rei 2026-11-08）。 */
export const SECTION_LABEL: Record<SectionBy, () => string> = {
  none: () => tr('不分区'),
  mood: () => tr('按心情'),
  project: () => tr('按项目'),
  // 和打卡页「排列：按类型」同字，英文按分区菜单大写（By Category），所以带语境
  type: () => trc('列表分区', '按类型'),
  milestone: () => tr('按里程碑'),
  due: () => tr('按目标日期'),
};

/**
 * 分区菜单（Rei 2026-11-08）：右上角一个图标按钮，单选打勾。选了「不分区」以外的，图标是强调色。
 * options：这一页能选的（我的一天：不分区 / 按心情 / 按项目 / 按类型；项目：不分区 / 按心情 / 按类型 / 按目标日期）。积压、已完成固定按日期分段，没有这个菜单。
 */
export function SectionMenu<K extends string>({ value, options, onChange, plain }: { value: K; options: readonly K[]; onChange: (v: K) => void; /** 哪个算「没改过」（图标不亮），默认 none */ plain?: K }) {
  const label = tr('分区：{name}', { name: SECTION_LABEL[value as SectionBy]?.() ?? value });
  return (
    <MenuTrigger>
      <Tip content={label}>
        <RacButton className={`icon-btn${value !== (plain ?? 'none') ? ' is-active' : ''}`} aria-label={label}>
          <Rows3 size={18} />
        </RacButton>
      </Tip>
      <Popover className="popover menu-popover" placement="bottom end" offset={4}>
        <Menu
          className="menu"
          aria-label={tr('分区')}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[value]}
          onSelectionChange={(keys) => {
            const k = [...keys][0];
            if (k !== undefined) onChange(String(k) as K);
          }}
        >
          {options.map((o) => (
            <Item key={o} id={o}>
              {SECTION_LABEL[o as SectionBy]?.() ?? o}
            </Item>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

/** 我的一天的排序（Rei 2026-11-08）：手动（拖动排的顺序，默认）/ 心情（好到坏，没记的在后）。 */
export function DaySortMenu({ value, onChange }: { value: 'manual' | 'mood'; onChange: (v: 'manual' | 'mood') => void }) {
  const name = value === 'mood' ? tr('心情') : tr('手动');
  const label = tr('排序：{name}', { name });
  return (
    <MenuTrigger>
      <Tip content={label}>
        <RacButton className={`icon-btn${value !== 'manual' ? ' is-active' : ''}`} aria-label={label}>
          <ArrowUpDown size={18} />
        </RacButton>
      </Tip>
      <Popover className="popover menu-popover" placement="bottom end" offset={4}>
        <Menu
          className="menu"
          aria-label={tr('排序')}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[value]}
          onSelectionChange={(keys) => {
            const k = [...keys][0];
            if (k === 'manual' || k === 'mood') onChange(k);
          }}
        >
          <Item id="manual">{tr('手动')}</Item>
          <Item id="mood">{tr('心情')}</Item>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

function Item({ id, icon, children, isDisabled }: { id: string; icon?: ReactNode; children: ReactNode; isDisabled?: boolean }) {
  return (
    <MenuItem id={id} isDisabled={isDisabled} className="menu-item menu-check" textValue={typeof children === 'string' ? children : id}>
      {({ isSelected }) => (
        <>
          {icon}
          <span className="menu-check-text">{children}</span>
          <span className="menu-check-mark" aria-hidden>
            {isSelected && <Check size={15} />}
          </span>
        </>
      )}
    </MenuItem>
  );
}

export function ViewMenu({ view, onChange }: { view: ProjectView; onChange: (v: ProjectView) => void }) {
  const Icon = VIEW_ICON[view];
  const label = tr('视图：{name}', { name: VIEW_LABEL[view]() });
  return (
    <MenuTrigger>
      <Tip content={label}>
        <RacButton className="icon-btn" aria-label={label}>
          <Icon size={18} />
        </RacButton>
      </Tip>
      <Popover className="popover menu-popover" placement="bottom end" offset={4}>
        <Menu
          className="menu"
          aria-label={tr('视图')}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[view]}
          onSelectionChange={(keys) => {
            const k = [...keys][0];
            if (k !== undefined) onChange(String(k) as ProjectView);
          }}
        >
          {(['list', 'board', 'timeline', 'chain'] as const).map((v) => {
            const I = VIEW_ICON[v];
            return (
              <Item key={v} id={v} icon={<I size={16} />}>
                {VIEW_LABEL[v]()}
              </Item>
            );
          })}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

export function SortMenu({ field, dir, onChange }: { field: SortField; dir: SortDir; onChange: (field: SortField, dir: SortDir) => void }) {
  const label = tr('排序：{name}，{dir}', { name: SORT_LABEL[field](), dir: dir === 'asc' ? tr('正序') : tr('倒序') });
  // 没改过（创建时间倒序）时图标是普通色，改过才是强调色
  const changed = field !== DEFAULT_PREFS.sort || dir !== DEFAULT_PREFS.dir;
  return (
    <MenuTrigger>
      <Tip content={label}>
        <RacButton className={`icon-btn${changed ? ' is-active' : ''}`} aria-label={label}>
          <ArrowUpDown size={18} />
        </RacButton>
      </Tip>
      <Popover className="popover menu-popover" placement="bottom end" offset={4}>
        <Menu className="menu" aria-label={tr('排序')}>
          <MenuSection
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[field]}
            onSelectionChange={(keys) => {
              const k = [...keys][0];
              if (k !== undefined) onChange(String(k) as SortField, dir);
            }}
          >
            <Header className="menu-header">{tr('排序依据')}</Header>
            {SORT_FIELDS.map((f) => (
              <Item key={f} id={f}>
                {SORT_LABEL[f]()}
              </Item>
            ))}
          </MenuSection>
          <Separator className="menu-sep" />
          <MenuSection
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[dir]}
            onSelectionChange={(keys) => {
              const k = [...keys][0];
              if (k === 'asc' || k === 'desc') onChange(field, k);
            }}
          >
            <Header className="menu-header">{tr('顺序')}</Header>
            <Item id="asc" icon={<ArrowUpNarrowWide size={16} />}>
              {tr('正序')}
            </Item>
            <Item id="desc" icon={<ArrowDownWideNarrow size={16} />}>
              {tr('倒序')}
            </Item>
          </MenuSection>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
