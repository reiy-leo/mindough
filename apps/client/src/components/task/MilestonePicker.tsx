/**
 * 里程碑选择（Rei 2026-11-13 09:19「显示为一个可搜索的dropdown，搜索可以选择，也可以新建」，见 core milestone.ts）。
 * 任务详情的「里程碑」胶囊、新建面板都用它；列的是这个项目自己的里程碑。样子沿用类型下拉（.cat-select）。
 *
 * - 顶上搜索框：输入就过滤（名字包含、中文名拼音首字母 / 全拼都行），组字时不过滤（lib/ime）。
 * - 列表：这个项目没归档的里程碑，按列表顺序；任务现在挂的里程碑归档了也列上，带「已归档」。单选，点了就选上并收起。
 * - 搜不到完全同名的（忽略大小写、首尾空白）：最后一行「新建里程碑“xxx”」，回车或点它就建，建完直接选上。
 *   同名的里程碑归档了，「新建」就是把它取消归档再选上。
 * - 每行右边「…」：改名（行里直接改，回车存，Esc 取消；空的、同项目重名的不让存）、归档 / 取消归档（提示里能撤销）。
 *   归档只是不在这里列，挂着它的任务照常显示。里程碑没有删除。
 * - 底部「清除里程碑」（选了里程碑时才有）。键盘：↑↓ 移动，回车选，Esc 关掉。
 */
import { imeBusy, useImeQuery } from '../../lib/ime';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Button as RacButton } from 'react-aria-components';
import { Archive, ArchiveRestore, Check, Milestone as MilestoneIcon, Pencil, Plus, Search } from 'lucide-react';
import { milestoneOptions, type Milestone, type Store } from '@mindough/core';
import { OverflowMenu } from '../../ui/primitives';
import { useUi } from '../../lib/ui';
import { clipName } from '../../lib/toast-text';
import { tr } from '../../lib/i18n';

export function MilestoneList({
  store,
  groupId,
  value,
  onChange,
  onDone,
  autoFocus = true,
}: {
  store: Store;
  /** 任务所在的项目（列这个项目的里程碑）。 */
  groupId: string;
  value: string | null;
  onChange: (id: string | null) => void;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const ui = useUi();
  const ime = useImeQuery();
  const q = ime.query;
  const [active, setActive] = useState(0);
  const [editing, setEditing] = useState<{ id: string; text: string; error: string | null } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const all = store.milestones(groupId, true);
  const rows = useMemo(
    () => milestoneOptions(all, q, value),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, store.version, groupId, q, value],
  );
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [autoFocus]);
  // 改名框：等「…」菜单收起、焦点回到按钮以后再把光标放进去，并全选
  const editingId = editing?.id ?? null;
  useEffect(() => {
    if (!editingId) return;
    const t = setTimeout(() => {
      renameRef.current?.focus();
      renameRef.current?.select();
    }, 60);
    return () => clearTimeout(t);
  }, [editingId]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (id: string | null) => {
    onChange(id);
    onDone?.();
  };
  const choose = (i: number) => {
    const r = rows[i];
    if (!r) return;
    if (r.kind === 'milestone') return pick(r.milestone.id);
    const m = store.createMilestone(groupId, r.name);
    if (m) {
      ime.reset('');
      pick(m.id);
    }
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (imeBusy(e.nativeEvent) || ime.isImeEnter(e.nativeEvent)) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (rows.length ? (a + 1) % rows.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (rows.length ? (a - 1 + rows.length) % rows.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(active);
    }
  };

  const saveRename = () => {
    if (!editing) return;
    const r = store.renameMilestone(editing.id, editing.text);
    if (r === 'empty') return setEditing({ ...editing, error: tr('里程碑名字不能是空的') });
    if (r === 'duplicate') return setEditing({ ...editing, error: tr('这个项目里已经有「{name}」了', { name: editing.text.trim() }) });
    setEditing(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const archive = (m: Milestone, on: boolean) => {
    store.setMilestoneArchived(m.id, on);
    if (on)
      ui.toast({ message: tr('已归档里程碑「{name}」', { name: clipName(m.name) }), actions: [{ label: tr('撤销'), onPress: () => store.setMilestoneArchived(m.id, false) }] });
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const optId = (i: number) => `${listId}-${i}`;
  const empty = !all.some((m) => !m.archived_at) && !q.trim();

  return (
    <div className="cat-select milestone-select">
      <div className="cat-select-field" onClick={() => inputRef.current?.focus()}>
        <Search size={15} aria-hidden className="cat-select-icon" />
        <input
          ref={inputRef}
          className="cat-select-input"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={rows.length ? optId(active) : undefined}
          aria-label={tr('搜索里程碑')}
          placeholder={tr('搜里程碑，或输入名字新建')}
          value={ime.text}
          onChange={(e) => ime.onChange(e.target.value)}
          {...ime.handlers}
          onKeyDown={onKey}
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      <ul ref={listRef} id={listId} role="listbox" aria-label={tr('里程碑')} className="cat-select-list">
        {rows.map((r, i) => {
          if (r.kind === 'create')
            return (
              <li key="create" id={optId(i)} data-index={i} role="option" aria-selected={false} className={`cat-option is-create${i === active ? ' is-active' : ''}`} onMouseMove={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(i)}>
                <span className="cat-check" aria-hidden>
                  <Plus size={13} />
                </span>
                <span className="milestone-option-name">{tr('新建里程碑“{name}”', { name: r.name })}</span>
              </li>
            );
          const m = r.milestone;
          const on = m.id === value;
          if (editing?.id === m.id)
            return (
              <li key={m.id} id={optId(i)} data-index={i} role="option" aria-selected={on} className="cat-option milestone-option is-editing">
                <MilestoneIcon size={15} aria-hidden className="milestone-option-icon" />
                <span className="milestone-rename">
                  <input
                    ref={renameRef}
                    className="milestone-rename-input"
                    aria-label={tr('里程碑名字')}
                    aria-invalid={!!editing.error || undefined}
                    value={editing.text}
                    onChange={(e) => setEditing({ id: m.id, text: e.target.value, error: null })}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        saveRename();
                      } else if (e.key === 'Escape') {
                        // 只取消改名，别把整个弹层关了
                        e.preventDefault();
                        e.stopPropagation();
                        setEditing(null);
                        requestAnimationFrame(() => inputRef.current?.focus());
                      }
                    }}
                  />
                  {editing.error && (
                    <span className="milestone-rename-error" role="alert">
                      {editing.error}
                    </span>
                  )}
                </span>
              </li>
            );
          return (
            <li
              key={m.id}
              id={optId(i)}
              data-index={i}
              role="option"
              aria-selected={on}
              className={`cat-option milestone-option${on ? ' is-on' : ''}${i === active ? ' is-active' : ''}${m.archived_at ? ' is-archived' : ''}`}
              onMouseMove={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              <span className="cat-check is-radio" aria-hidden>
                {on && <Check size={12} strokeWidth={3} />}
              </span>
              <MilestoneIcon size={15} aria-hidden className="milestone-option-icon" />
              <span className="milestone-option-name">{m.name}</span>
              {m.archived_at && <span className="milestone-option-tag">{tr('已归档')}</span>}
              <span className="milestone-option-more" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                <OverflowMenu
                  label={tr('「{name}」的操作', { name: m.name })}
                  className="small milestone-more-btn"
                  items={[
                    { id: 'rename', label: tr('改名'), icon: <Pencil size={16} />, onAction: () => setEditing({ id: m.id, text: m.name, error: null }) },
                    m.archived_at
                      ? { id: 'unarchive', label: tr('取消归档'), icon: <ArchiveRestore size={16} />, onAction: () => archive(m, false) }
                      : { id: 'archive', label: tr('归档'), icon: <Archive size={16} />, onAction: () => archive(m, true) },
                  ]}
                />
              </span>
            </li>
          );
        })}
        {empty && <li className="cat-select-empty">{tr('这个项目还没有里程碑，输入名字新建')}</li>}
        {!empty && !rows.length && <li className="cat-select-empty">{tr('没有找到')}</li>}
      </ul>
      {value && (
        <div className="cat-select-foot">
          <RacButton className="link-btn" onPress={() => pick(null)}>
            {tr('清除里程碑')}
          </RacButton>
        </div>
      )}
    </div>
  );
}
