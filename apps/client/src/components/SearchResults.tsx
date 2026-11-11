import { useMemo } from 'react';
import { Button as RacButton } from 'react-aria-components';
import { NotebookPen, Plus, Sun, SunDim, UserRound } from 'lucide-react';
import { TASK_STATUS_LABEL, isFinished, libraryCopy, search, type SearchHit, type Store, type Task } from '@mindough/core';
import { MoodIcon } from './journal/MoodIcon';
import { useStore } from '../store/StoreProvider';
import { useUi, type UiCtx } from '../lib/ui';
import { navigate } from '../lib/router';
import { toggleMyDay } from '../lib/actions';
import { imageUrl, viewOf } from '../lib/view';
import { TaskThumb } from './TaskRow';
import { Avatar } from './Avatar';
import { ItemArt, artShape } from './library/Library';
import { GroupIcon } from './project/GroupIcon';
import { dataLabel, tr, trc } from '../lib/i18n';

/**
 * 全局搜索的结果（⌘F 浮层和手机的搜索页共用，Rei 2026-11-12「结果与现在全局搜索同一套逻辑」）：
 * 搜什么、怎么排在 core search()（拼音、标题 = 正文第一行…）；这里管取数和每一行长什么样。
 */
export const SEARCH_LIMIT = 20;

function searchInput(store: Store) {
  return {
    tasks: store.list('task'),
    types: store.list('task_type'),
    people: store.list('person'),
    groups: store.list('group'),
    taskPeople: store.list('task_person'),
    items: store.list('library_item'),
    journal: store.list('journal_post'),
    taskItems: store.list('task_item'),
    taskCategories: store.list('task_category'),
    categories: store.list('category'),
  };
}

/** 搜索结果；q 空时是空数组。 */
export function useSearchHits(q: string): SearchHit[] {
  const store = useStore();
  return useMemo(() => search(searchInput(store), q, SEARCH_LIMIT), [q, store, store.version]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** 没输入时列的「最近的任务」：没做完的最后 6 件，新的在前。 */
export function useRecentTasks(q: string): Task[] {
  const store = useStore();
  return useMemo(() => (q ? [] : store.tasks().filter((t) => !isFinished(t.status)).slice(-6).reverse()), [q, store, store.version]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** 点一条结果去哪：任务开详情，人物 / 资料 / 日记 / 项目去各自的页。 */
export function openSearchHit(ui: UiCtx, h: SearchHit) {
  if (h.kind === 'task') ui.openEditor(h.id);
  else if (h.kind === 'person') navigate({ page: 'person', id: h.id });
  else if (h.kind === 'item') navigate({ page: 'libitem', typeId: h.item.type_id, id: h.id });
  else if (h.kind === 'journal') navigate({ page: 'journal', date: h.post.day });
  else navigate({ page: 'group', id: h.id });
}

interface RowProps {
  active?: boolean;
  onHover?: () => void;
}

/** 一件任务：缩略图、标题、类型 · 状态 · 片段，右边「加入我的一天」。 */
export function SearchTaskRow({ id, title, snippet, active, onHover, onOpen }: RowProps & { id: string; title: string; snippet: string; onOpen: () => void }) {
  const store = useStore();
  const ui = useUi();
  const t = store.get('task', id);
  if (!t) return null;
  const v = viewOf(store, t);
  // 置顶的每天都在我的一天里（Rei 2026-11-08）
  const inDay = !!t.pinned_at || store.isInMyDay(id);
  return (
    <li className={`palette-item${active ? ' is-active' : ''}`} onMouseEnter={onHover}>
      <RacButton className="palette-main" onPress={onOpen}>
        <TaskThumb media={v.media} layout={v.thumbLayout} isAvatar={v.mediaIsAvatar} color={v.type?.color} icon={v.type?.icon} hasItem={v.hasItem} />
        <span className="palette-text">
          <span className="palette-title">{title}</span>
          <span className="palette-snippet">
            {v.type && v.type.layout !== 'text' ? `${dataLabel(v.type.name)} · ` : ''}
            {TASK_STATUS_LABEL[t.status]}
            {snippet ? ` · ${snippet}` : ''}
          </span>
        </span>
      </RacButton>
      <RacButton className={`btn btn-tonal palette-add${inDay ? ' is-on' : ''}`} onPress={() => toggleMyDay(store, ui, id)} aria-label={inDay ? tr('移出我的一天') : tr('加入我的一天')}>
        {inDay ? <Sun size={15} /> : <SunDim size={15} />}
        {inDay ? tr('已在今天') : tr('加入我的一天')}
      </RacButton>
    </li>
  );
}

/**
 * 一条搜索结果（任务、日记、资料、人物、项目）。onOpen 点这一行；onCreateFrom 资料行「用它新建任务」之前要做的事（浮层先关掉）。
 */
export function SearchHitRow({ hit: h, active, onHover, onOpen, beforeCreate }: RowProps & { hit: SearchHit; onOpen: () => void; beforeCreate?: () => void }) {
  const store = useStore();
  const ui = useUi();
  if (h.kind === 'task') return <SearchTaskRow id={h.id} title={h.title} snippet={h.snippet} active={!!active} {...(onHover ? { onHover } : {})} onOpen={onOpen} />;
  const cls = `palette-item${active ? ' is-active' : ''}`;
  if (h.kind === 'journal')
    return (
      <li className={cls} onMouseEnter={onHover}>
        <RacButton className="palette-main" onPress={onOpen}>
          <span className="thumb thumb-icon">{h.post.mood ? <MoodIcon mood={h.post.mood} size={22} /> : <NotebookPen size={16} />}</span>
          <span className="palette-text">
            <span className="palette-title">{h.title}</span>
            <span className="palette-snippet">
              {tr('日记')}
              {h.snippet ? ` · ${h.snippet}` : ''}
            </span>
          </span>
        </RacButton>
      </li>
    );
  if (h.kind === 'item')
    return (
      <li className={cls} onMouseEnter={onHover}>
        <RacButton className="palette-main" onPress={onOpen}>
          <ItemArt src={imageUrl(store, h.item.image)} name={h.title} shape={artShape(h.type)} className="palette-art" />
          <span className="palette-text">
            <span className="palette-title">{h.title}</span>
            <span className="palette-snippet">
              {h.type ? libraryCopy(h.type).name : tr('资料库')}
              {h.snippet ? ` · ${h.snippet}` : ''}
            </span>
          </span>
        </RacButton>
        <RacButton
          className="btn btn-tonal palette-add"
          onPress={() => {
            beforeCreate?.();
            ui.openQuickCreate({ type_id: h.item.type_id, library_item_id: h.id });
          }}
        >
          <Plus size={15} />
          {tr('用它新建任务')}</RacButton>
      </li>
    );
  return (
    <li className={cls} onMouseEnter={onHover}>
      <RacButton className="palette-main" onPress={onOpen}>
        {h.kind === 'person' ? <Avatar store={store} person={h.person} size={32} /> : <GroupIcon group={h.group} size={30} className="thumb-tile" />}
        <span className="palette-text">
          <span className="palette-title">{h.title}</span>
          <span className="palette-snippet">
            {h.kind === 'person' ? <><UserRound size={11} /> {tr('人物')}{h.snippet ? ` · ${h.snippet}` : ''}</> : trc('属性', '项目')}
          </span>
        </span>
      </RacButton>
    </li>
  );
}
