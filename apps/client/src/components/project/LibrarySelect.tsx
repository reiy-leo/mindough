/**
 * 项目面板里的「资料库」多选下拉（Rei 2026-11-10「项目新建 / 编辑窗口加资料库下拉，多选，选中资料库里的任务自动加入这个项目」）。
 * 列出能挂资料的库（没归档的，含人物；已经关联这个项目的归档库也列出来，方便取消）。
 * 一个库只能关联一个项目：已关联别的项目的那行写「已关联：项目名」，选它先弹确认，确认了才勾上（保存时改关联过来）。
 * 只改面板里的选择，真正关联、挪任务在保存时（ProjectSheet → store.setGroupLibraries）。
 */
import { useMemo, useState } from 'react';
import { Button as RacButton, Label, ListBox, ListBoxItem, Popover, Select as RacSelect, type Key } from 'react-aria-components';
import { Check, ChevronDown } from 'lucide-react';
import { isArchivedType, libraryCopy, type Store, type TaskType } from '@mindough/core';
import { ConfirmDialog } from '../../ui/primitives';
import { IconTile } from '../IconTile';
import { tr } from '../../lib/i18n';

export function LibrarySelect({ store, groupId, value, onChange }: { store: Store; groupId: string | null; value: string[]; onChange: (v: string[]) => void }) {
  const linkOf = useMemo(() => store.libLinkOf(), [store, store.version]);
  const libs: TaskType[] = useMemo(() => {
    const pickable = new Set(store.refLibraries().map((t) => t.id));
    return store.orderedTypes().filter((t) => pickable.has(t.id) || (isArchivedType(t) && !!groupId && linkOf(t.id)?.groupId === groupId));
  }, [store, store.version, groupId, linkOf]);
  // 已关联别的项目（不是正在编辑的这个）：那个项目的名字
  const elsewhere = (typeId: string): string | undefined => {
    const gid = linkOf(typeId)?.groupId;
    return gid && gid !== groupId ? (store.get('group', gid)?.name ?? '') : undefined;
  };
  const [confirm, setConfirm] = useState<{ typeId: string; next: string[]; project: string } | null>(null);
  // 下拉开没开：要弹确认时先收起下拉，免得盖在确认框上面
  const [open, setOpen] = useState(false);
  const names = libs.filter((t) => value.includes(t.id)).map((t) => libraryCopy(t).name);
  const text = names.join(tr('、'));
  const change = (keys: Key[]) => {
    const next = libs.map((t) => t.id).filter((id) => keys.map(String).includes(id));
    const added = next.find((id) => !value.includes(id) && elsewhere(id) !== undefined);
    if (added) {
      setOpen(false);
      setConfirm({ typeId: added, next, project: elsewhere(added)! });
      return;
    }
    onChange(next);
  };
  const joining = store.libraryJoinCount(groupId, value);
  return (
    <div className="project-libs">
      <RacSelect className="field multi-select project-libs-select" selectionMode="multiple" isOpen={open} onOpenChange={setOpen} value={value} onChange={(keys) => change(keys as Key[])} placeholder={tr('不关联')}>
        <Label className="field-label">{tr('资料库')}</Label>
        <RacButton className="input select-btn">
          <span className={`select-value${text ? '' : ' is-placeholder'}`}>{text || tr('不关联')}</span>
          <ChevronDown size={16} aria-hidden />
        </RacButton>
        <Popover className="popover multi-select-popover project-libs-popover">
          <ListBox className="listbox" items={libs}>
            {(t) => {
              const other = elsewhere(t.id);
              const name = libraryCopy(t).name;
              return (
                <ListBoxItem id={t.id} className="listbox-item pick-item project-libs-item" textValue={other !== undefined ? `${name} ${tr('已关联：{name}', { name: other })}` : name}>
                  <IconTile icon={t.icon} color={t.color} size={20} />
                  <span className="grow project-libs-name">
                    <span className="project-libs-title">{name}</span>
                    {other !== undefined && <span className="project-libs-linked">{tr('已关联：{name}', { name: other })}</span>}
                  </span>
                  <Check size={15} className="pick-check" aria-hidden />
                </ListBoxItem>
              );
            }}
          </ListBox>
        </Popover>
      </RacSelect>
      <p className="setting-hint project-libs-hint">{tr('选中的资料库里的任务会自动放进这个项目，以后加进库里的也会。')}</p>
      {joining > 0 && <p className="setting-hint project-libs-hint project-libs-count">{tr('会有 {n} 件任务放进来。', { n: joining })}</p>}
      <ConfirmDialog
        isOpen={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={tr('改关联到这个项目？')}
        message={
          confirm
            ? tr('「{library}」已关联项目「{project}」。一个资料库只能关联一个项目，改过来以后，它里面的任务会一起挪到这个项目。', {
                library: libraryCopy(store.get('task_type', confirm.typeId) ?? { id: confirm.typeId, name: '' }).name,
                project: confirm.project,
              })
            : ''
        }
        confirmLabel={tr('改关联')}
        onConfirm={() => {
          if (confirm) onChange(confirm.next);
          setConfirm(null);
        }}
      />
    </div>
  );
}
