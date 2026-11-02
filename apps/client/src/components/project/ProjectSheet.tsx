/**
 * 新建项目和编辑项目用的同一个面板（Rei 2026-11-02「新建项目的弹窗需要优化，删掉默认资料库，开始结束删掉。和编辑窗口统一」）。
 * 两边字段一样：图标预览 + 名字 + 图标选择 +「出现在我的一天」开关（Rei 2026-11-02，存在 group.my_day_auto，默认开）。只有标题和主按钮不同：新建是「新建项目」+「创建」，编辑是「编辑项目」+「保存」。
 * 开始 / 结束、类型、默认资料库界面上不再填，数据字段还在（老项目照常读）；新建的项目这几项都是空的。
 */
import { useState } from 'react';
import { Input, TextField } from 'react-aria-components';
import { groupAutoMyDay, groupIconFromPicker, groupIconName, type Group, type Store } from '@mindough/core';
import { Button, Sheet, Switch } from '../../ui/primitives';
import { IconPicker } from '../TypeManager';
import { GroupIcon } from './GroupIcon';
import { navigate } from '../../lib/router';
import { tr } from '../../lib/i18n';

/** 新建（不给 group）建好后打开那个项目；编辑（给 group）改名、换图标。 */
export function ProjectSheet({ store, group, onClose }: { store: Store; group?: Group; onClose: () => void }) {
  const [name, setName] = useState(group?.name ?? '');
  const [icon, setIcon] = useState(group ? groupIconName(group.icon) : 'folder');
  // 「出现在我的一天」（Rei 2026-11-02），新建默认开
  const [myDay, setMyDay] = useState(group ? groupAutoMyDay(group) : true);
  const save = () => {
    if (!name.trim()) return;
    if (group) {
      store.updateGroup(group.id, { name, icon, my_day_auto: myDay });
      onClose();
      return;
    }
    const g = store.insert('group', {
      name: name.replace(/\s+/g, ' ').trim(),
      icon: groupIconFromPicker(icon),
      start_at: null,
      end_at: null,
      category_id: null,
      default_type_id: null,
      my_day_auto: myDay,
    });
    onClose();
    navigate({ page: 'group', id: g.id });
  };
  return (
    <Sheet
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={group ? tr('编辑项目') : tr('新建项目')}
      footer={
        <Button variant="primary" isDisabled={!name.trim()} onPress={save}>
          {group ? tr('保存') : tr('创建')}
        </Button>
      }
    >
      <div className="project-edit">
        <div className="project-edit-head">
          <span className="project-edit-preview" aria-hidden>
            <GroupIcon icon={icon} size={24} />
          </span>
          <TextField aria-label={tr('项目名字')} value={name} onChange={setName} autoFocus className="project-edit-name">
            <Input className="input" placeholder={tr('项目名字')} onKeyDown={(e) => e.key === 'Enter' && save()} />
          </TextField>
        </div>
        <IconPicker value={icon} searchable onChange={setIcon} />
        <div className="setting project-edit-myday">
          <div className="setting-text">
            <div className="setting-name">{tr('出现在我的一天')}</div>
            <div className="setting-hint">{myDay ? tr('到了该做的那天，项目里的任务直接放进我的一天。') : tr('项目里的任务不会自己出现在我的一天，到了那天只放在建议里。')}</div>
          </div>
          <Switch label={tr('出现在我的一天')} isSelected={myDay} onChange={setMyDay} />
        </div>
      </div>
    </Sheet>
  );
}
