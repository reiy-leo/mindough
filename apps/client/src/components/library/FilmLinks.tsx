/**
 * 影人 ↔ 影片的关联（Rei 2026-11-14 影人库，docs/FILM-PEOPLE.md）：全部手动连，不按 TMDB 演职员表自动匹配。
 * - 影人详情「作品」：已关联的影片按年份排（新的在前），每行写角色和这部片的观看任务状态；「关联影片」从影视库里搜着选。
 * - 影视详情「主创」：只列已关联的影人（头像 + 名字 + 角色）；「关联影人」从影人库里搜着选。
 * - 两边每行「…」里能改角色、断开（提示里能撤销）。数据在 core（Store.linkLibraryItems / linksFromItem / linksToItem）。
 */
import { useState, type CSSProperties } from 'react';
import { Pencil, Plus, Unlink } from 'lucide-react';
import { BUILTIN_TYPE_IDS, TASK_STATUS_LABEL, isFinished, libraryCopy, type LibraryItem, type LibraryLink, type Store, type Task, type TaskStatus, type TaskType } from '@mindough/core';
import { useUi } from '../../lib/ui';
import { href } from '../../lib/router';
import { imageUrl } from '../../lib/view';
import { Button, Field, OverflowMenu, Section, Sheet } from '../../ui/primitives';
import { ItemArt, LibraryPicker, artShape } from './Library';

import { tr } from '../../lib/i18n';

/** 这部片的观看任务状态：有没做完的就写它（进行中优先），都做完了写最近结束的那件；没有任务 = null。 */
export function filmTaskStatus(tasks: readonly Pick<Task, 'status' | 'done_at' | 'created_at'>[]): TaskStatus | null {
  if (!tasks.length) return null;
  const open = tasks.filter((t) => !isFinished(t.status));
  if (open.length) return open.some((t) => t.status === '进行中') ? '进行中' : '待办';
  const last = [...tasks].sort((a, b) => ((b.done_at ?? b.created_at) > (a.done_at ?? a.created_at) ? 1 : -1))[0]!;
  return last.status;
}

type Side = 'works' | 'credits';

/** 两边共用的一行：图 + 名字 + 角色（+ 状态），点开去另一条资料；行尾「…」改角色、断开。 */
function LinkRow({ store, side, link, item, type, onEditRole, onUnlink }: { store: Store; side: Side; link: LibraryLink; item: LibraryItem; type: TaskType | undefined; onEditRole: () => void; onUnlink: () => void }) {
  const shape = type ? artShape(type) : side === 'works' ? 'poster' : 'round';
  const year = side === 'works' && typeof item.fields.year === 'number' ? String(item.fields.year) : '';
  const meta = [year, link.role].filter(Boolean).join(' · ');
  const status = side === 'works' ? filmTaskStatus(store.tasksOfItem(item.id)) : null;
  return (
    <li className={`flink-row is-${side}`}>
      <a className="flink-main" href={href({ page: 'libitem', typeId: item.type_id, id: item.id })}>
        <ItemArt src={imageUrl(store, item.image)} name={item.name} shape={shape} className="flink-art" />
        <span className="flink-text">
          <span className="flink-name" title={item.name}>{item.name}</span>
          {meta && <span className="flink-meta" title={meta}>{meta}</span>}
        </span>
      </a>
      {side === 'works' && (
        <span className={`flink-status${status ? ` is-${status === '进行中' ? 'doing' : isFinished(status) ? 'done' : 'todo'}` : ' is-none'}`}>
          {status ? TASK_STATUS_LABEL[status] : tr('没有任务')}
        </span>
      )}
      <OverflowMenu
        label={tr('「{name}」的更多操作', { name: item.name })}
        className="flink-more"
        items={[
          { id: 'role', label: tr('改角色…'), icon: <Pencil size={16} />, onAction: onEditRole },
          { id: 'unlink', label: tr('断开'), icon: <Unlink size={16} />, danger: true, onAction: onUnlink },
        ]}
      />
    </li>
  );
}

/** 改角色的小弹层。 */
function RoleSheet({ name, role, onSave, onClose }: { name: string; role: string; onSave: (role: string) => void; onClose: () => void }) {
  const [v, setV] = useState(role);
  const save = () => {
    onSave(v);
    onClose();
  };
  return (
    <Sheet
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={tr('改角色')}
      className="modal-flink-role"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault();
          save();
        }
      }}
      footer={
        <>
          <span className="grow" />
          <Button variant="secondary" onPress={onClose}>
            {tr('取消')}
          </Button>
          <Button variant="primary" onPress={save}>
            {tr('保存')}
          </Button>
        </>
      }
    >
      <Field label={tr('「{name}」的角色', { name })} value={v} onChange={setV} placeholder={tr('比如：导演，或主演·饰某某')} autoFocus />
    </Sheet>
  );
}

/**
 * 挑另一边的资料来连：上面填角色（可空），下面在库里搜着选；选中就连上、关掉弹层。
 * 已经连着的行尾打勾，再点一下就是断开（同任务「添加资料」面板的习惯）。
 */
function LinkPickSheet({ store, side, item, pickType, onClose }: { store: Store; side: Side; item: LibraryItem; pickType: TaskType; onClose: () => void }) {
  const ui = useUi();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const linked = side === 'works' ? store.linksFromItem(item.id) : store.linksToItem(item.id);
  const selected = new Set(linked.map((r) => r.item.id));
  const pick = (otherId: string, name: string) => {
    const hit = linked.find((r) => r.item.id === otherId);
    if (hit) {
      const before = store.unlinkLibraryItems(hit.link.id);
      if (before) ui.toast({ message: tr('已断开「{name}」', { name }), actions: [{ label: tr('撤销'), onPress: () => store.restoreLibraryLink(before) }] });
    } else {
      const l = side === 'works' ? store.linkLibraryItems(item.id, otherId, role) : store.linkLibraryItems(otherId, item.id, role);
      if (l) ui.toast({ message: tr('已关联「{name}」', { name }), actions: [{ label: tr('撤销'), onPress: () => store.unlinkLibraryItems(l.id) }] });
    }
    onClose();
  };
  return (
    <Sheet isOpen onOpenChange={(o) => !o && onClose()} title={side === 'works' ? tr('关联影片') : tr('关联影人')} className="modal-flink-pick">
      <div className="flink-pick" style={{ '--chip-color': pickType.color } as CSSProperties}>
        <Field label={tr('角色（可不填）')} value={role} onChange={setRole} placeholder={tr('比如：导演，或主演·饰某某')} className="flink-role-field" />
        <p className="flink-pick-hint">{tr('在{name}里选一条，选中就关联上。', { name: libraryCopy(pickType).name })}</p>
        <LibraryPicker
          store={store}
          type={pickType}
          query={query}
          onQueryChange={setQuery}
          autoFocus
          allowCreate={false}
          selected={selected}
          onPick={(e) => pick(e.id, e.name)}
          onCreate={() => {}}
        />
      </div>
    </Sheet>
  );
}

/** 影人详情「作品」/ 影视详情「主创」。 */
export function FilmLinksSection({ store, item, side }: { store: Store; item: LibraryItem; side: Side }) {
  const ui = useUi();
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<{ link: LibraryLink; name: string } | null>(null);
  const pickType = store.get('task_type', side === 'works' ? BUILTIN_TYPE_IDS.movie : BUILTIN_TYPE_IDS.filmPerson);
  const rows = side === 'works' ? store.linksFromItem(item.id) : store.linksToItem(item.id);
  const unlink = (link: LibraryLink, name: string) => {
    const before = store.unlinkLibraryItems(link.id);
    if (before) ui.toast({ message: tr('已断开「{name}」', { name }), actions: [{ label: tr('撤销'), onPress: () => store.restoreLibraryLink(before) }] });
  };
  const title = side === 'works' ? tr('作品 {n}', { n: rows.length }) : tr('主创 {n}', { n: rows.length });
  return (
    <Section
      title={title}
      className={`flink-section is-${side}`}
      extra={
        pickType ? (
          <Button variant="quiet" className="flink-add" onPress={() => setPicking(true)}>
            <Plus size={15} aria-hidden />
            {side === 'works' ? tr('关联影片') : tr('关联影人')}
          </Button>
        ) : undefined
      }
    >
      {rows.length ? (
        <ul className="flink-list">
          {rows.map((r) => (
            <LinkRow
              key={r.link.id}
              store={store}
              side={side}
              link={r.link}
              item={r.item}
              type={store.get('task_type', r.item.type_id)}
              onEditRole={() => setEditing({ link: r.link, name: r.item.name })}
              onUnlink={() => unlink(r.link, r.item.name)}
            />
          ))}
        </ul>
      ) : (
        <p className="lib-none">{side === 'works' ? tr('还没有关联的影片。') : tr('还没有关联的影人。')}</p>
      )}
      {picking && pickType && <LinkPickSheet store={store} side={side} item={item} pickType={pickType} onClose={() => setPicking(false)} />}
      {editing && <RoleSheet name={editing.name} role={editing.link.role} onSave={(v) => store.setLibraryLinkRole(editing.link.id, v)} onClose={() => setEditing(null)} />}
    </Section>
  );
}
