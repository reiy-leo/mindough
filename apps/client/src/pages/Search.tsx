import { useEffect, useRef } from 'react';
import { Input, SearchField, Button as RacButton } from 'react-aria-components';
import { Plus, Search, X } from 'lucide-react';
import { plainTitleMarkdown } from '@mindough/core';
import { useStore } from '../store/StoreProvider';
import { useUi } from '../lib/ui';
import { imeBusy, useImeQuery } from '../lib/ime';
import { hashWithSearchQuery, searchQueryInHash } from '../lib/router';
import { viewOf } from '../lib/view';
import { tr } from '../lib/i18n';
import { StickyHead } from '../components/StickyHead';
import { SearchHitRow, SearchTaskRow, openSearchHit, useRecentTasks, useSearchHits } from '../components/SearchResults';

/**
 * 搜索页（Rei 2026-11-12 01:21「手机端任何页面都不显示搜索按钮……搜索改成单独的一页」）：#/search，手机从「更多」页第一行进。
 * 顶上搜索框，没带关键词进来时自动聚焦；结果和 ⌘F 浮层同一套（components/SearchResults → core search()）。
 * 关键词随手写进地址的 ?q=（replaceState，不攒记录），点结果进详情、按返回回来，关键词和结果都还在；带着关键词回来时不自动弹键盘。
 * 电脑上 ⌘F 浮层不变；宽屏打开 #/search 也能用这一页。
 */
export function SearchPage() {
  const store = useStore();
  const ui = useUi();
  const initial = useRef(searchQueryInHash(location.hash)).current;
  const ime = useImeQuery(initial);
  const q = ime.query;
  const hits = useSearchHits(q);
  const recent = useRecentTasks(q);
  const input = useRef<HTMLInputElement>(null);

  // 关键词写回地址（只换当前这条记录）：返回到这页时从 ?q= 读回来
  useEffect(() => {
    if (!/^#\/search(\?|$)/.test(location.hash)) return;
    const next = hashWithSearchQuery(location.hash, q.trim() ? q : '');
    if (next !== location.hash) history.replaceState(history.state, '', `${location.pathname}${location.search}${next}`);
  }, [q]);

  useEffect(() => {
    if (!initial) input.current?.focus();
  }, [initial]);

  const trim = q.trim();
  const createFromQuery = () => {
    const t = store.createTask({ body_md: plainTitleMarkdown(trim) });
    store.addToMyDay(t.id);
    ui.toast({ tone: 'success', message: tr('已新建并加入我的一天：「{trim}」', { trim }) }, 3000);
    ime.reset('');
  };

  return (
    <div className="page search-page has-sticky-head">
      <h1 className="sr-only">{tr('搜索')}</h1>
      <StickyHead className="search-page-head">
        <SearchField
          aria-label={tr('搜索任务、资料库、人物、项目')}
          className="search-page-field"
          value={ime.text}
          onChange={ime.onChange}
          onKeyDown={(e) => {
            if (imeBusy(e.nativeEvent)) return;
            e.continuePropagation();
          }}
          // 回车收起键盘看结果（手机上回车不新建，新建用列表最上面那一行）
          onSubmit={() => input.current?.blur()}
        >
          <Search size={16} className="search-page-icon" aria-hidden />
          <Input ref={input} className="input search-page-input" placeholder={tr('搜索任务、资料库、人物、项目…')} enterKeyHint="search" {...ime.handlers} />
          {ime.text && (
            <RacButton className="icon-btn search-page-clear" aria-label={tr('清除')}>
              <X size={15} />
            </RacButton>
          )}
        </SearchField>
      </StickyHead>
      <ul className="palette-list search-page-list">
        {trim && (
          <li className="palette-item">
            <RacButton className="palette-main" onPress={createFromQuery}>
              <span className="thumb thumb-icon"><Plus size={16} /></span>
              <span className="palette-text">
                <span className="palette-title">{tr('新建「{trim}」并加入我的一天', { trim })}</span>
              </span>
            </RacButton>
          </li>
        )}
        {!trim && recent.length > 0 && <li className="palette-group">{tr('最近的任务')}</li>}
        {!trim && recent.map((t) => <SearchTaskRow key={t.id} id={t.id} title={viewOf(store, t).title} snippet="" onOpen={() => ui.openEditor(t.id)} />)}
        {trim && hits.map((h) => <SearchHitRow key={h.id} hit={h} onOpen={() => openSearchHit(ui, h)} />)}
        {trim && hits.length === 0 && <li className="palette-empty">{tr('没有找到「{trim}」', { trim })}</li>}
      </ul>
    </div>
  );
}
