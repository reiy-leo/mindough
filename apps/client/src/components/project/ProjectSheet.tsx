/**
 * 新建项目和编辑项目用的同一个面板（Rei 2026-11-02「新建项目的弹窗需要优化，删掉默认资料库，开始结束删掉。和编辑窗口统一」）。
 * 两边字段一样：图标预览 + 名字 + 颜色和图标（IconStylePicker，2026-11-04 起项目能选颜色）+「出现在我的一天」开关（Rei 2026-11-02，存在 group.my_day_auto，默认开）+「默认日期：今天」开关（Rei 2026-11-09，group.default_date_today，默认关）。只有标题和主按钮不同：新建是「新建项目」+「创建」，编辑是「编辑项目」+「保存」。
 * 开始 / 结束、类型、默认资料库界面上不再填，数据字段还在（老项目照常读）；新建的项目这几项都是空的。
 */
import { useState } from 'react';
import { Input, TextField } from 'react-aria-components';
import { defaultIconColor, groupAutoMyDay, groupColor, groupIconFromPicker, groupIconName, type Group, type Store } from '@mindough/core';
import { Button, Sheet, Switch } from '../../ui/primitives';
import { IconStylePicker } from '../IconStylePicker';
import { GroupIcon } from './GroupIcon';
import { navigate } from '../../lib/router';
import { tr } from '../../lib/i18n';
import { imeBusy } from '../../lib/ime';

/** 新建（不给 group）建好后打开那个项目；编辑（给 group）改名、换图标。 */
export function ProjectSheet({ store, group, onClose }: { store: Store; group?: Group; onClose: () => void }) {
  const [name, setName] = useState(group?.name ?? '');
  const [icon, setIcon] = useState(group ? groupIconName(group.icon) : 'folder');
  // 颜色：编辑时没选过就是空（显示按 id 挑的默认色，不点就不写）；新建先随机给一个色板里的颜色，建好就存下
  const [color, setColor] = useState<string | null>(group ? (group.color ?? null) : () => defaultIconColor(String(Math.random())));
  const shownColor = group ? (color ?? groupColor(group)) : color!;
  // 「出现在我的一天」（Rei 2026-11-02），新建默认开
  const [myDay, setMyDay] = useState(group ? groupAutoMyDay(group) : true);
  // 「默认日期：今天」（Rei 2026-11-09 03:52）：项目里新建的任务日期填今天，新建默认关；存在 group.default_date_today，跟着同步
  const [dateToday, setDateToday] = useState(group?.default_date_today === true);
  const save = () => {
    if (!name.trim()) return;
    if (group) {
      store.updateGroup(group.id, { name, icon, my_day_auto: myDay, default_date_today: dateToday, ...(color !== (group.color ?? null) ? { color } : {}) });
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
      color,
      default_date_today: dateToday,
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
          <GroupIcon group={{ icon, color: shownColor }} size={40} className="project-edit-preview" />
          <TextField aria-label={tr('项目名字')} value={name} onChange={setName} autoFocus className="project-edit-name">
            <Input className="input" placeholder={tr('项目名字')} onKeyDown={(e) => e.key === 'Enter' && !imeBusy(e.nativeEvent) && save()} />
          </TextField>
        </div>
        <IconStylePicker color={shownColor} icon={icon} onColor={setColor} onIcon={setIcon} className="project-edit-style" />
        <div className="setting project-edit-myday">
          <div className="setting-text">
            <div className="setting-name">{tr('出现在我的一天')}</div>
            <div className="setting-hint">{myDay ? tr('到了该做的那天，项目里的任务直接放进我的一天。') : tr('项目里的任务不会自己出现在我的一天，到了那天只放在建议里。')}</div>
          </div>
          <Switch label={tr('出现在我的一天')} isSelected={myDay} onChange={setMyDay} />
        </div>
        <div className="setting project-edit-myday">
          <div className="setting-text">
            <div className="setting-name">{tr('默认日期：今天')}</div>
            <div className="setting-hint">{tr('在这个项目里新建的任务，日期自动填今天。')}</div>
          </div>
          <Switch label={tr('默认日期：今天')} isSelected={dateToday} onChange={setDateToday} />
        </div>
      </div>
    </Sheet>
  );
}
