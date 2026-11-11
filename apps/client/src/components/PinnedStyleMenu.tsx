/**
 * 侧栏里放进来的项目「显示为：列表 / 图标」（Rei 2026-11-11 02:18 定入口）：电脑侧栏「项目」那行、手机「更多」页「项目」那行右边一个小的 ···，
 * 点开单选菜单，当前项打勾。偏好在 lib/pinned-style（本机，不同步）。
 * 放进来的资料库同样（Rei 2026-11-12 00:24）：「资料库」那行右边的 ···（kind="library"），设置和项目的各管各的。
 * 入口单独成一个组件，以后挪地方（比如项目列表页右上角、小节右键菜单）只要换放的位置。
 */
import { Header, Menu, MenuItem, MenuSection, MenuTrigger, Popover, Button as RacButton } from 'react-aria-components';
import { Check, LayoutGrid, List, MoreHorizontal } from 'lucide-react';
import { PINNED_STYLES, usePinnedStyle, type PinnedStyle, type PinnedStyleKind } from '../lib/pinned-style';
import { Tip } from '../ui/primitives';
import { tr, trc } from '../lib/i18n';

const STYLE_LABEL: Record<PinnedStyle, () => string> = {
  list: () => trc('项目显示方式', '列表'),
  icons: () => trc('项目显示方式', '图标'),
};
const STYLE_ICON = { list: List, icons: LayoutGrid } as const;

/**
 * 「显示为：列表 / 图标」单选菜单，按钮是一个小的 ···。侧栏项目（PinnedStyleMenu）和类型页（Rei 2026-11-11 08:33）共用，文案「列表」「图标」也共用。
 * label 是按钮的读屏名 / 悬停提示，也是菜单的名字。
 */
export function DisplayStyleMenu({ label, value, onChange, className }: { label: string; value: PinnedStyle; onChange: (v: PinnedStyle) => void; className?: string }) {
  return (
    <MenuTrigger>
      <Tip content={label}>
        <RacButton className={`icon-btn pinned-style-btn${className ? ` ${className}` : ''}`} aria-label={label}>
          <MoreHorizontal size={16} aria-hidden />
        </RacButton>
      </Tip>
      <Popover className="popover menu-popover" placement="bottom end" offset={4}>
        <Menu className="menu" aria-label={label}>
          <MenuSection
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[value]}
            onSelectionChange={(keys) => {
              const k = [...keys][0];
              if (k === 'list' || k === 'icons') onChange(k);
            }}
          >
            <Header className="menu-header">{tr('显示为')}</Header>
            {PINNED_STYLES.map((s) => {
              const I = STYLE_ICON[s];
              return (
                <MenuItem key={s} id={s} className="menu-item menu-check" textValue={STYLE_LABEL[s]()}>
                  {({ isSelected }) => (
                    <>
                      <I size={16} aria-hidden />
                      <span className="menu-check-text">{STYLE_LABEL[s]()}</span>
                      <span className="menu-check-mark" aria-hidden>
                        {isSelected && <Check size={15} />}
                      </span>
                    </>
                  )}
                </MenuItem>
              );
            })}
          </MenuSection>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

const MENU_LABEL: Record<PinnedStyleKind, () => string> = {
  group: () => tr('项目显示方式'),
  library: () => tr('资料库显示方式'),
};

export function PinnedStyleMenu({ kind = 'group', className }: { kind?: PinnedStyleKind; className?: string }) {
  const [style, setStyle] = usePinnedStyle(kind);
  return <DisplayStyleMenu label={MENU_LABEL[kind]()} value={style} onChange={setStyle} className={className} />;
}
