/**
 * 项目的 ··· 菜单（Rei 2026-11-01「项目可以删除、解散。放在项目的ellipsis中，编辑也放这里」）。
 * 项目页右上角、项目列表卡片右上角、侧边栏里那一项的右键都用这一套：编辑… ｜ 在侧边栏显示 · 归档 ｜ 解散项目… · 删除项目…
 * 归档（Rei 2026-11-05「项目可以归档」）：不用确认，提示里能撤销；归档了的换成「取消归档」，也不给「在侧边栏显示」（归档的不在侧栏）。
 * 解散：项目没了，任务留着（没日期的回待安排）；删除：项目和里面的任务一起删。两个都先确认，删完提示里能撤销。
 */
import { useState, type ReactNode } from 'react';
import { Button as RacButton, Input, TextField } from 'react-aria-components';
import { Archive, ArchiveRestore, FolderMinus, Pencil, Trash2 } from 'lucide-react';
import { groupColor, groupIconName, type Group, type Store } from '@mindough/core';
import { ConfirmDialog, PopoverPanel, type MenuAction } from '../../ui/primitives';
import { ProjectSheet } from './ProjectSheet';
import { IconStylePicker } from '../IconStylePicker';
import { GroupIcon } from './GroupIcon';
import { groupSidebarAction } from '../../lib/library-sidebar';
import { navigate, useRoute } from '../../lib/router';
import { useUi, type UiCtx } from '../../lib/ui';
import { tr } from '../../lib/i18n';
import { imeBusy } from '../../lib/ime';

type Dialog = 'edit' | 'dissolve' | 'delete' | null;

/** 菜单项 + 要挂在页面上的对话框。items 交给 OverflowMenu / MenuAt，dialogs 放在同一个组件里渲染。 */
export function useProjectActions(store: Store, group: Group): { items: MenuAction[]; dialogs: ReactNode } {
  const ui = useUi();
  const route = useRoute();
  const [open, setOpen] = useState<Dialog>(null);
  const count = store.groupTasks(group.id).length;
  const archived = !!group.archived_at;
  const items: MenuAction[] = [
    { id: 'edit', label: tr('编辑…'), icon: <Pencil size={16} />, onAction: () => setOpen('edit') },
    ...(archived ? [] : [groupSidebarAction(store, group)]),
    archived
      ? { id: 'unarchive', label: tr('取消归档'), icon: <ArchiveRestore size={16} />, onAction: () => unarchiveProject(store, ui, group) }
      : { id: 'archive', label: tr('归档'), icon: <Archive size={16} />, onAction: () => archiveProject(store, ui, group) },
    { id: 'dissolve', label: tr('解散项目…'), icon: <FolderMinus size={16} />, separator: true, onAction: () => setOpen('dissolve') },
    { id: 'delete', label: tr('删除项目…'), icon: <Trash2 size={16} />, danger: true, onAction: () => setOpen('delete') },
  ];
  const leave = () => {
    // 正开着这个项目就回项目列表；右列开着的任务被删了就关掉
    if (route.page === 'group' && route.id === group.id) navigate({ page: 'groups' });
  };
  const close = (o: boolean) => !o && setOpen(null);
  const dialogs = (
    <>
      {open === 'edit' && <ProjectSheet store={store} group={group} onClose={() => setOpen(null)} />}
      <ConfirmDialog
        isOpen={open === 'dissolve'}
        onOpenChange={close}
        title={tr('解散「{name}」？', { name: group.name })}
        message={count ? tr('项目没了，里面的 {n} 件任务都留着：没日期的回到待安排，有日期的还在那一天。', { n: count }) : tr('项目里没有任务，解散后项目就没了。')}
        confirmLabel={tr('解散')}
        onConfirm={() => {
          const r = store.dissolveGroup(group.id);
          leave();
          if (r) ui.toast({ message: tr('已解散「{name}」', { name: group.name }), actions: [{ label: tr('撤销'), onPress: () => store.undoGroupRemoval(r.undo) }] }, 8000);
        }}
      />
      <ConfirmDialog
        isOpen={open === 'delete'}
        onOpenChange={close}
        danger
        title={tr('删除「{name}」？', { name: group.name })}
        message={count ? tr('项目和里面的 {n} 件任务会一起删掉。只想留下任务，就选「解散项目」。', { n: count }) : tr('项目里没有任务，删掉的只有项目本身。')}
        confirmLabel={tr('删除')}
        onConfirm={() => {
          const deletedIds = new Set(store.groupTasks(group.id).map((t) => t.id));
          const r = store.deleteGroup(group.id);
          leave();
          if (ui.editingId && deletedIds.has(ui.editingId)) ui.openEditor(null);
          if (r) ui.toast({ message: tr('已删除「{name}」', { name: group.name }), actions: [{ label: tr('撤销'), onPress: () => store.undoGroupRemoval(r.undo) }] }, 8000);
        }}
      />
    </>
  );
  return { items, dialogs };
}

/** 归档项目，提示里能撤销（Rei 2026-11-05）。正开着这个项目就留在项目页，顶上会出「这个项目已归档」。 */
export function archiveProject(store: Store, ui: UiCtx, group: Group) {
  if (group.archived_at) return;
  store.archiveGroup(group.id);
  ui.toast({ message: tr('已归档「{name}」，在项目列表最下面「已归档」里', { name: group.name }), actions: [{ label: tr('撤销'), onPress: () => store.unarchiveGroup(group.id) }] }, 6000);
}

/** 取消归档：一切照旧。 */
export function unarchiveProject(store: Store, ui: UiCtx, group: Group) {
  if (!group.archived_at) return;
  store.unarchiveGroup(group.id);
  ui.toast({ message: tr('已取消归档「{title}」', { title: group.name }) }, 3000);
}

/**
 * 项目页左上角的图标和名字（Rei 2026-11-01）：点图标换图标，点名字原地改名（回车或点别处保存，Esc 不改）。
 */
export function ProjectTitle({ store, group }: { store: Store; group: Group }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const commit = () => {
    store.updateGroup(group.id, { name: draft });
    setEditing(false);
  };
  return (
    <span className="project-title">
      <PopoverPanel
        label={tr('图标和颜色')}
        className="icon-style-popover"
        trigger={
          <RacButton className="tile-btn project-icon-btn" aria-label={tr('换图标和颜色')}>
            <GroupIcon group={group} size={28} />
          </RacButton>
        }
      >
        {(close) => (
          <IconStylePicker
            color={groupColor(group)}
            icon={groupIconName(group.icon)}
            onColor={(color) => store.updateGroup(group.id, { color })}
            onIcon={(icon) => {
              store.updateGroup(group.id, { icon });
              close();
            }}
          />
        )}
      </PopoverPanel>
      {editing ? (
        <TextField aria-label={tr('项目名字')} value={draft} onChange={setDraft} autoFocus className="project-name-field">
          <Input
            className="input project-name-input"
            onFocus={(e) => e.currentTarget.select()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !imeBusy(e.nativeEvent)) e.currentTarget.blur();
              if (e.key === 'Escape') {
                e.preventDefault();
                setDraft(group.name);
                setEditing(false);
              }
            }}
          />
        </TextField>
      ) : (
        <RacButton
          className="project-name-btn"
          aria-label={tr('改名：{name}', { name: group.name })}
          onPress={() => {
            setDraft(group.name);
            setEditing(true);
          }}
        >
          <h1 className="page-title">{group.name}</h1>
        </RacButton>
      )}
    </span>
  );
}
