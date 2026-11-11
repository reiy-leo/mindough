/**
 * 类型详情里选分组的下拉（Rei 2026-11-12「选分组的控件改成可搜索的下拉」）：React Aria ComboBox。
 * - 框里写着当前分组；点框或右边的箭头展开全部分组（内置前五组、自己建的、「其他」最后），当前那项打勾。
 * - 打字就按名字过滤，拼音首字母 / 全拼也行（core filterGroupOptions，规则同类型搜索）。
 * - 没有同名的分组时，列表最后一项「新建分组“xxx”」，选它就新建（store.createCategoryGroup）并把类型放进去。
 * - 选了或者点开别处，框里回到当前分组的名字。
 * - 固定的「内置」组（Rei 2026-11-12 07:20，只放置顶、收藏、紧急、重要）不出现在下拉里，自建类型选不进去；
 *   打「内置」（或它在当前语言的名字）也不出「新建分组」。
 */
import { useMemo, useState } from 'react';
import { Button as RacButton, ComboBox, Input, Label, ListBox, ListBoxItem, Popover, type Key } from 'react-aria-components';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { BUILTIN_CATEGORY_GROUP_ZH, CATEGORY_GROUP_ZH, filterGroupOptions, groupCreateName, isBuiltinCategoryGroup, isCategoryGroup, type CategoryGroupId, type GroupOption } from '@mindough/core';
import { useStore } from '../store/StoreProvider';
import { categoryGroupLabel } from './CategoryEditor';
import { tr } from '../lib/i18n';

const CREATE = '__create__';

interface Item {
  id: string;
  label: string;
  create?: boolean;
}

/** 下拉里的分组：界面名字在前，内置组再带上中文名（切了语言也能用中文、拼音搜）。 */
export function groupOptions(ids: readonly CategoryGroupId[], label: (g: CategoryGroupId) => string): (GroupOption & { label: string })[] {
  return ids.map((id) => {
    const l = label(id);
    const zh = isCategoryGroup(id) ? CATEGORY_GROUP_ZH[id] : isBuiltinCategoryGroup(id) ? BUILTIN_CATEGORY_GROUP_ZH : null;
    const names = zh && zh !== l ? [l, zh] : [l];
    return { id, label: l, names };
  });
}

/**
 * 下拉该列哪些项：没打字（或框里就是当前分组名）时列全部；打了字就过滤，没有同名的再加最后一项「新建」。
 * 「内置」组不列（选不进去），但算同名：打「内置」不出「新建」。
 */
export function groupComboItems(options: readonly (GroupOption & { label: string })[], input: string, currentLabel: string): Item[] {
  const typed = input.trim() && input !== currentLabel ? input : '';
  const pickable = options.filter((o) => !isBuiltinCategoryGroup(o.id));
  const list: Item[] = filterGroupOptions(pickable, typed).map((o) => ({ id: o.id, label: o.label }));
  const name = typed ? groupCreateName(options, typed) : null;
  if (name) list.push({ id: CREATE, label: name, create: true });
  return list;
}

export function CategoryGroupCombo({ value, onChange, className }: { value: CategoryGroupId; onChange: (g: CategoryGroupId) => void; className?: string }) {
  const store = useStore();
  const ids = store.categoryGroupIds();
  const label = (g: CategoryGroupId) => categoryGroupLabel(g, store);
  const options = useMemo(() => groupOptions(ids, label), [ids.join(), store.customCategoryGroups().map((g) => g.name).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = label(value);
  const [input, setInput] = useState<string | null>(null);
  const shown = input ?? current;
  const items = groupComboItems(options, shown, current);

  const pick = (k: Key | null) => {
    if (k === null) return;
    if (k === CREATE) {
      const name = items.find((i) => i.create)?.label;
      const gid = name ? store.createCategoryGroup(name) : null;
      if (gid) onChange(gid);
    } else if (String(k) !== value) onChange(String(k));
    setInput(null);
  };

  return (
    <ComboBox
      className={`field group-combo${className ? ` ${className}` : ''}`}
      items={items}
      selectedKey={value}
      inputValue={shown}
      onInputChange={(v) => setInput(v === current ? null : v)}
      onSelectionChange={pick}
      onOpenChange={(open) => !open && setInput(null)}
      menuTrigger="focus"
      allowsEmptyCollection
      defaultFilter={() => true}
    >
      <Label className="field-label">{tr('分组')}</Label>
      <div className="input-wrap group-combo-wrap">
        <Input className="input has-adornment group-combo-input" placeholder={tr('搜分组，或者输入名字新建')} />
        <span className="input-adornment">
          <RacButton className="icon-btn group-combo-btn">
            <ChevronDown size={16} aria-hidden />
          </RacButton>
        </span>
      </div>
      <Popover className="popover group-combo-popover" placement="bottom start" offset={4}>
        <ListBox className="listbox" items={items}>
          {(it) =>
            it.create ? (
              <ListBoxItem id={it.id} className="listbox-item group-combo-item is-create" textValue={it.label}>
                <Plus size={15} aria-hidden />
                <span className="group-combo-text">{tr('新建分组“{name}”', { name: it.label })}</span>
              </ListBoxItem>
            ) : (
              <ListBoxItem id={it.id} className="listbox-item group-combo-item" textValue={it.label}>
                {({ isSelected }) => (
                  <>
                    <span className="group-combo-text">{it.label}</span>
                    <span className="group-combo-mark" aria-hidden>
                      {isSelected && <Check size={15} />}
                    </span>
                  </>
                )}
              </ListBoxItem>
            )
          }
        </ListBox>
      </Popover>
    </ComboBox>
  );
}
