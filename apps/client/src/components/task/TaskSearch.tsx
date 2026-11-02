/**
 * 挑任务的可搜索列表：详情里加前后关系 / 相关任务，新建面板里的「相关任务」都用它。
 * 给了 selected 就是多选（点一下勾上 / 取消，弹层不关），否则点一下就选中。
 * 组字、退格（Rei 2026-11-02）：组字时不过滤、选词回车不新建；列表高度固定，删字时弹层不跟着伸缩。
 */
import { Autocomplete, Button as RacButton, Input, ListBox, ListBoxItem, SearchField } from 'react-aria-components';
import { Check, Plus, Search } from 'lucide-react';
import { isFinished, taskMatchRank, taskTextMatches, type Store, type Task } from '@mindough/core';
import { titleOf } from '../../lib/view';
import { useImeQuery } from '../../lib/ime';

import { tr } from '../../lib/i18n';
/** 列表里一件任务的状态短语（可开始的待办不写，免得满屏字）。 */
export function taskStateText(store: Store, t: Task): string | null {
  if (t.status === '完成') return tr('已完成');
  if (t.status === '关闭') return tr('已关闭');
  if (t.status === '进行中') return tr('进行中');
  if (store.derived().get(t.id)?.state === '被阻塞') return tr('还不能开始');
  return null;
}

export function TaskSearch({
  store,
  exclude,
  selected,
  hideFinished,
  label = tr('搜索任务'),
  onPick,
  onCreate,
}: {
  store: Store;
  exclude: Set<string>;
  selected?: ReadonlySet<string>;
  /** 已完成、已关闭的不列出来（挑「先做完这些 / 做完后解锁」时）。 */
  hideFinished?: boolean;
  label?: string;
  onPick: (id: string) => void;
  /** 给了就在最后一行出「新建“xxx”」：用搜索词新建一件任务（像资料库的选择框）。 */
  onCreate?: (text: string) => void;
}) {
  // 组字时框里是拼音，不拿去过滤；回车选词不算提交（lib/ime.ts）
  const ime = useImeQuery();
  const term = ime.query.trim();
  // 标题和列表行同一个取法（titleOf → core taskTitle），搜标题 + 正文、拼音首字母（core taskTextMatches），和 ⌘K 一致
  const items = store
    .tasks()
    .filter((t) => !t.deleted && !exclude.has(t.id) && !(hideFinished && isFinished(t.status) && !selected?.has(t.id)))
    .map((t) => ({ id: t.id, title: titleOf(store, t), body: t.body_md, finished: isFinished(t.status), picked: !!selected?.has(t.id) }))
    .filter((t) => taskTextMatches(t.title, t.body, term))
    .map((t) => ({ ...t, rank: term ? taskMatchRank(t.title, term) : 0 }))
    .sort((a, b) => Number(b.picked) - Number(a.picked) || Number(a.finished) - Number(b.finished) || a.rank - b.rank);
  return (
    <div className="task-search" {...ime.handlers}>
      {/* 过滤自己做（上面的 items），Autocomplete 只管把方向键、回车交给列表 */}
      <Autocomplete inputValue={ime.text} onInputChange={ime.onChange}>
        <SearchField
          aria-label={label}
          className="cat-search"
          autoFocus
          onSubmit={() => {
            // 回车：没有搜到时直接新建
            if (onCreate && term && !items.length) onCreate(term);
          }}
        >
          <Search size={14} aria-hidden className="cat-search-icon" />
          <Input className="input" placeholder={label} />
        </SearchField>
        <ListBox
          aria-label={tr('任务')}
          className="listbox pick-list task-search-list"
          items={items}
          {...(selected ? { selectionMode: 'multiple' as const, selectedKeys: [...selected].filter((id) => items.some((i) => i.id === id)) } : {})}
          onAction={selected ? undefined : (k) => onPick(String(k))}
          onSelectionChange={selected ? (keys) => {
            if (keys === 'all') return;
            const next = new Set([...keys].map(String));
            const changed = [...next].find((id) => !selected.has(id)) ?? [...selected].find((id) => !next.has(id));
            if (changed) onPick(changed);
          } : undefined}
          renderEmptyState={() => (onCreate && term ? null : <div className="pick-empty">{tr('没有找到')}</div>)}
        >
          {(t) => (
            <ListBoxItem id={t.id} className="listbox-item pick-item" textValue={t.title}>
              <span className={`grow ellipsis${t.finished ? ' muted' : ''}`}>{t.title}</span>
              {t.finished && <span className="pick-meta">{tr('已结束')}</span>}
              {selected && <Check size={14} className="pick-check" />}
            </ListBoxItem>
          )}
        </ListBox>
      </Autocomplete>
      {/* 没有字时也占着这一行（藏起来），删到空时弹层不缩一截 */}
      {onCreate && (
        <RacButton className={`pick-create${term ? '' : ' is-idle'}`} isDisabled={!term} aria-hidden={!term || undefined} onPress={() => term && onCreate(term)}>
          <Plus size={15} aria-hidden />
          <span className="grow ellipsis">{term ? tr('新建“{term}”', { term }) : ' '}</span>
        </RacButton>
      )}
    </div>
  );
}
