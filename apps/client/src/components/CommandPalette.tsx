import { useEffect, useState } from 'react';
import { Dialog, Input, Modal, ModalOverlay, SearchField, Button as RacButton } from 'react-aria-components';
import { CornerDownLeft, FileDown, NotebookPen, Plus, Search } from 'lucide-react';
import { plainTitleMarkdown, type SearchHit } from '@mindough/core';
import { requestJournalCompose } from '../lib/journal-compose';
import { useStore } from '../store/StoreProvider';
import { imeBusy, useImeQuery } from '../lib/ime';
import { useUi } from '../lib/ui';
import { navigate } from '../lib/router';
import { viewOf } from '../lib/view';
import { tr } from '../lib/i18n';
import { SearchHitRow, SearchTaskRow, openSearchHit, useRecentTasks, useSearchHits } from './SearchResults';
import { clipName } from '../lib/toast-text';

/** ⌘K / Ctrl+K 全局搜索：搜正文、类型字段、人物、组；结果直接“加入我的一天”。 */
export function CommandPalette() {
  const ui = useUi();
  const store = useStore();
  // 组字时框里是拼音，不拿去搜；选词的回车不当成「新建」（Rei 2026-11-02，lib/ime.ts）
  const ime = useImeQuery();
  const q = ime.query;
  const [active, setActive] = useState(0);
  const { reset } = ime;
  useEffect(() => {
    if (!ui.paletteOpen) {
      reset();
      setActive(0);
    }
  }, [ui.paletteOpen, reset]);

  const hits = useSearchHits(q);
  const recent = useRecentTasks(q);

  const close = () => ui.setPaletteOpen(false);
  // 「写日记」：没输入时排最前；输入像「日记 / journal / 写」时也出来。打开日记页、输入框拿焦点
  const showJournal = !q.trim() || /日记|journal|diary|^写/i.test(q.trim()); // i18n-ignore 匹配用的关键词
  const writeJournal = () => {
    close();
    requestJournalCompose();
    navigate({ page: 'journal' });
  };
  // 「从滴答清单导入…」：没输入时排在日记后面；输入像「滴答 / dida / ticktick / 导入 / import」时也出来
  const showDida = !q.trim() || /滴答|dida|tick|导入|import/i.test(q.trim()); // i18n-ignore 匹配用的关键词
  const importDida = () => {
    close();
    ui.setDidaImportOpen(true);
  };
  const journalIndex = q.trim() ? 1 : 0;
  const didaIndex = journalIndex + (showJournal ? 1 : 0);
  const offset = didaIndex + (showDida ? 1 : 0);
  const createFromQuery = () => {
    const t = store.createTask({ body_md: plainTitleMarkdown(q.trim()) });
    store.addToMyDay(t.id);
    ui.toast({ tone: 'success', message: tr('已新建并加入我的一天：「{trim}」', { trim: clipName(q) }) });
    close();
  };
  const openHit = (h: SearchHit) => {
    close();
    openSearchHit(ui, h);
  };
  const count = offset + (q ? hits.length : recent.length);

  const taskItem = (id: string, title: string, snippet: string, index: number) => (
    <SearchTaskRow key={id} id={id} title={title} snippet={snippet} active={index === active} onHover={() => setActive(index)} onOpen={() => { close(); ui.openEditor(id); }} />
  );

  return (
    <ModalOverlay isOpen={ui.paletteOpen} onOpenChange={ui.setPaletteOpen} isDismissable className="overlay overlay-top">
      <Modal className="modal palette">
        <Dialog aria-label={tr('搜索')} className="dialog">
          <SearchField
            aria-label={tr('搜索任务、资料库、人物、项目')}
            className="palette-search"
            value={ime.text}
            onChange={(v) => {
              ime.onChange(v);
              setActive(0);
            }}
            autoFocus
            onKeyDown={(e) => {
              if (imeBusy(e.nativeEvent)) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, Math.max(0, count - 1)));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else e.continuePropagation(); // 别的键照常往外传：react-aria 包过的 onKeyDown 默认拦住冒泡，Esc 到不了弹窗、关不掉（2026-11-08）
            }}
            onSubmit={() => {
              if (q.trim() && active === 0) createFromQuery();
              else if (showJournal && active === journalIndex) writeJournal();
              else if (showDida && active === didaIndex) importDida();
              else if (!q) {
                const t = recent[active - offset];
                if (t) {
                  close();
                  ui.openEditor(t.id);
                }
              } else {
                const h = hits[active - offset];
                if (h) openHit(h);
              }
            }}
          >
            <Search size={18} className="palette-icon" aria-hidden />
            <Input className="palette-input" placeholder={tr('搜索任务、资料库、人物、项目…')} {...ime.handlers} />
            <kbd className="kbd">Esc</kbd>
          </SearchField>
          <ul className="palette-list">
            {q.trim() && (
              <li className={`palette-item${active === 0 ? ' is-active' : ''}`} onMouseEnter={() => setActive(0)}>
                <RacButton className="palette-main" onPress={createFromQuery}>
                  <span className="thumb thumb-icon"><Plus size={16} /></span>
                  <span className="palette-text">
                    <span className="palette-title">{tr('新建「{trim}」并加入我的一天', { trim: q.trim() })}</span>
                  </span>
                  <CornerDownLeft size={14} className="muted" />
                </RacButton>
              </li>
            )}
            {showJournal && (
              <li className={`palette-item${active === journalIndex ? ' is-active' : ''}`} onMouseEnter={() => setActive(journalIndex)}>
                <RacButton className="palette-main" onPress={writeJournal}>
                  <span className="thumb thumb-icon"><NotebookPen size={16} /></span>
                  <span className="palette-text">
                    <span className="palette-title">{tr('写日记')}</span>
                  </span>
                </RacButton>
              </li>
            )}
            {showDida && (
              <li className={`palette-item${active === didaIndex ? ' is-active' : ''}`} onMouseEnter={() => setActive(didaIndex)}>
                <RacButton className="palette-main" onPress={importDida}>
                  <span className="thumb thumb-icon"><FileDown size={16} /></span>
                  <span className="palette-text">
                    <span className="palette-title">{tr('从滴答清单导入…')}</span>
                  </span>
                </RacButton>
              </li>
            )}
            {!q && recent.length > 0 && <li className="palette-group">{tr('最近的任务')}</li>}
            {recent.map((t, i) => taskItem(t.id, viewOf(store, t).title, '', i + offset))}
            {hits.map((h, i) => {
              const index = i + offset;
              return <SearchHitRow key={h.id} hit={h} active={index === active} onHover={() => setActive(index)} onOpen={() => openHit(h)} beforeCreate={close} />;
            })}
            {q.trim() && hits.length === 0 && <li className="palette-empty">{tr('没找到「{q}」，按回车直接新建', { q })}</li>}
          </ul>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
