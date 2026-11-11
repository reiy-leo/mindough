/**
 * 「列表 / 图标」下拉（Rei 2026-11-12：类型页的显示方式从 ··· 菜单改成下拉）：按钮写当前那项 + 向下箭头，
 * 菜单两项、当前那项打勾。样子同打卡页「排列方式」下拉（pages/CheckIns.tsx ArrangeMenu，样式 .view-dropdown-btn 和 .checkin-arrange-btn 一样）。
 * 文案「列表」「图标」和侧栏的「显示为」菜单共用（trc('项目显示方式', …)）。
 */
import { Menu, MenuItem, MenuTrigger, Popover, Button as RacButton } from 'react-aria-components';
import { Check, ChevronDown } from 'lucide-react';
import { PINNED_STYLES, type PinnedStyle } from '../lib/pinned-style';
import { tr, trc } from '../lib/i18n';

const LABEL: Record<PinnedStyle, () => string> = {
  list: () => trc('项目显示方式', '列表'),
  icons: () => trc('项目显示方式', '图标'),
};

/** label：菜单的名字（读屏）；按钮读屏名是「显示为：{当前项}」。 */
export function ViewStyleDropdown({ label, value, onChange, className }: { label: string; value: PinnedStyle; onChange: (v: PinnedStyle) => void; className?: string }) {
  const name = LABEL[value]();
  return (
    <MenuTrigger>
      <RacButton className={`btn btn-quiet view-dropdown-btn${className ? ` ${className}` : ''}`} aria-label={tr('显示为：{name}', { name })}>
        <span className="view-dropdown-name">{name}</span>
        <ChevronDown size={15} aria-hidden />
      </RacButton>
      <Popover className="popover menu-popover" placement="bottom end" offset={4}>
        <Menu
          className="menu"
          aria-label={label}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[value]}
          onSelectionChange={(keys) => {
            const k = [...keys][0];
            if (k === 'list' || k === 'icons') onChange(k);
          }}
        >
          {PINNED_STYLES.map((s) => (
            <MenuItem key={s} id={s} className="menu-item menu-check" textValue={LABEL[s]()}>
              {({ isSelected }) => (
                <>
                  <span className="menu-check-text">{LABEL[s]()}</span>
                  <span className="menu-check-mark" aria-hidden>
                    {isSelected && <Check size={15} />}
                  </span>
                </>
              )}
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
