/**
 * 类型页（侧栏「管理 → 类型」，#/types，深链 view/types）。方案 C（docs/CATEGORY-EDITOR.md，Rei 2026-10-28「按方案C执行」）：
 * 先找到，再改；顺序不用手排。类型只在这一页管（Rei 2026-10-28「去掉设置中的入口」）。
 *
 * - 宽屏左右两栏：左边是 CategoryList（搜索 + 按分组排），右边是选中类型的详情（#/types/<id>）。
 * - 窄屏先列表，点一行整页推进详情，顶上「全部类型」返回。
 * - 详情：图标块（点开换颜色和图标）+ 直接改的名字；常用 / 普通 / 不显示三档；分组（可搜索的下拉，能新建分组，components/CategoryGroupCombo；原叫「大类」，Rei 2026-11-12 改名）；下面是用到它的任务和项目。
 * - 没有页头（Rei 2026-11-12 02:14）：读屏留 h1，手机顶栏只有标题。
 * - 搜索框右边「列表 ⌄ / 图标 ⌄」下拉（Rei 2026-11-11 08:33 加在页头，原是 ···；2026-11-12 改成下拉，样子同打卡页「排列方式」；同天页头去掉后挪到搜索框这一行）：所有分组一起切，本机记住（lib/category-view）。图标 = 图标格子、名字在下。
 * - 键盘：⌘F 或直接打字聚焦搜索；⌘1 / ⌘2 / ⌘3 把高亮或打开的那个切成常用 / 普通 / 不显示。改动马上保存，改档能撤销。
 * - 内置类型（置顶、收藏、紧急、重要，Rei 2026-11-12 04:20 / 04:41）照常列出、能点开看挂了它的任务，但详情只读：图标块不是按钮、名字是纯文字、
 *   没有三档和分组，只有一行说明；⌘1/2/3 对它不起作用（store 也挡着）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button as RacButton, Input, TextField } from 'react-aria-components';
import { ChevronLeft, Tags } from 'lucide-react';
import { IMPORTANT_CATEGORY_ID, STAR_CATEGORY_ID, URGENT_CATEGORY_ID, isFinished, type Category, type CategoryState } from '@mindough/core';
import { useStore } from '../store/StoreProvider';
import { navigate } from '../lib/router';
import { useSettings } from '../lib/settings';
import { Empty, PopoverPanel, Section, Segmented } from '../ui/primitives';
import { TaskRow } from '../components/TaskRow';
import { CategoryTile, CategoryList, categoryStateLabel, useCategoryActions } from '../components/CategoryEditor';
import { IconStylePicker } from '../components/IconStylePicker';
import { dataLabel, tr, trc } from '../lib/i18n';
import { GroupIcon } from '../components/project/GroupIcon';
import { imeBusy, typingKey } from '../lib/ime';
import { ViewStyleDropdown } from '../components/ViewStyleDropdown';
import { CategoryGroupCombo } from '../components/CategoryGroupCombo';
import { useCategoryViewStyle } from '../lib/category-view';

const STATES: CategoryState[] = ['frequent', 'normal', 'hidden'];

export function CategoriesPage({ id }: { id?: string }) {
  const store = useStore();
  const { layout } = useSettings();
  const mobile = layout === 'mobile';
  const selected = store.category(id ?? null);
  const open = useCallback((cid: string) => navigate({ page: 'types', id: cid }), []);
  const searchRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const { setState } = useCategoryActions();
  const [view, setView] = useCategoryViewStyle();
  const target = active ?? selected?.id ?? null;

  // 键盘：⌘F / 直接打字 → 类型搜索框；⌘1/2/3 → 三档。
  // ⌘F 在别的页面开全局搜索（lib/global-keys.ts）；类型页先在捕获阶段拦下、preventDefault，全局那边就不开（弹层里不拦）。
  useEffect(() => {
    if (mobile) return;
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = typingKey(e);
      const inDialog = !!el?.closest('[role="dialog"]');
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey && !e.shiftKey && (e.key === '1' || e.key === '2' || e.key === '3')) {
        if (!target || inDialog) return;
        e.preventDefault();
        setState(target, STATES[Number(e.key) - 1]!);
        return;
      }
      if (mod && !e.altKey && !inDialog && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (!typing && !inDialog && !mod && !e.altKey && e.key.length === 1 && e.key !== ' ') searchRef.current?.focus();
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [mobile, target, setState]);

  if (mobile && selected)
    return (
      <div className="page types-page">
        {/* 返回条固定在顶上，详情往下滚也点得到（Rei 2026-11-04「固定，现在点了返回不了」） */}
        <div className="types-back-bar">
          <RacButton className="btn btn-quiet types-back" onPress={() => navigate({ page: 'types' })}>
            <ChevronLeft size={16} aria-hidden />
            {tr('全部类型')}
          </RacButton>
        </div>
        <CategoryDetail c={selected} />
      </div>
    );
  return (
    <div className={`page types-page is-fill${selected ? ' has-selection' : ''}`}>
      {/* 页头去掉（Rei 2026-11-12 02:14「类型页去掉页头」）：原来页头是图标、标题「类型」、副标题（几个、用到几个）和右边「列表 ⌄」下拉，没有别的按钮；
          下拉挪到搜索框右边同一行（宽屏、手机都一样），标题和副标题不再显示，新建照旧在搜索框里打名字。
          读屏还是要有页面名；手机上标题在顶栏（lib/mobile-topbar 的 HEADERLESS_PAGES），同项目列表、倒数日、日历页 */}
      <h1 className="sr-only">{trc('分类', '类型')}</h1>
      <div className="types-layout">
        <div className="types-list">
          <CategoryList
            selectedId={selected?.id ?? null}
            onOpen={open}
            onActive={setActive}
            mobile={mobile}
            searchRef={searchRef}
            view={view}
            searchAside={<ViewStyleDropdown label={tr('类型显示方式')} value={view} onChange={setView} className="types-view-btn" />}
          />
        </div>
        {!mobile && <div className="types-uses">{selected ? <CategoryDetail c={selected} /> : <Empty icon={<Tags size={28} />} title={tr('点一个类型，看挂了它的任务和项目')} />}</div>}
      </div>
    </div>
  );
}

/** 详情：头部（图标块 + 名字）、三档、分组、用到它的任务和项目。 */
function CategoryDetail({ c }: { c: Category }) {
  return (
    <div className="types-uses-body">
      <CategoryHead c={c} />
      <CategoryUses c={c} />
    </div>
  );
}

function CategoryHead({ c }: { c: Category }) {
  const store = useStore();
  const { setState, setGroup } = useCategoryActions();
  const shown = dataLabel(c.name);
  const [name, setName] = useState(shown);
  const [note, setNote] = useState('');
  useEffect(() => {
    setName(shown);
    setNote('');
  }, [shown, c.id]);
  const commit = () => {
    const n = name.trim();
    if (!n || n === shown || n === c.name) return setName(shown);
    if (!store.updateCategory(c.id, { name: n })) {
      setNote(tr('已经有叫「{name}」的类型了，名字没改', { name: n }));
      setName(shown);
    } else setNote('');
  };
  const state = store.categoryState(c.id);
  const group = store.categoryGroup(c.id);
  // 内置类型（置顶、收藏、紧急、重要）只读：不出任何编辑入口，只说一句为什么
  if (store.isCategoryLocked(c.id))
    return (
      <div className="cat-head is-locked">
        <div className="cat-head-top">
          <CategoryTile c={c} size={44} />
          <h2 className="cat-head-title">{shown}</h2>
        </div>
        <p className="foot-note cat-head-hint">{lockedHint(c.id)}</p>
      </div>
    );
  return (
    <div className="cat-head">
      <div className="cat-head-top">
        <PopoverPanel
          label={tr('图标和颜色')}
          className="icon-style-popover"
          trigger={
            <RacButton className="tile-btn" aria-label={tr('换「{name}」的图标和颜色', { name: shown })}>
              <CategoryTile c={c} size={44} />
            </RacButton>
          }
        >
          <IconStylePicker color={c.color} icon={c.icon} onColor={(color) => store.updateCategory(c.id, { color })} onIcon={(icon) => store.updateCategory(c.id, { icon })} />
        </PopoverPanel>
        <TextField aria-label={tr('「{name}」的名字', { name: shown })} value={name} onChange={setName} className="cat-head-name">
          <Input className="input" onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && !imeBusy(e.nativeEvent) && (e.target as HTMLInputElement).blur()} />
        </TextField>
      </div>
      {note && (
        <p className="foot-note cat-head-note" role="status">
          {note}
        </p>
      )}
      <div className="cat-head-props">
        <div className="field cat-head-state">
          <span className="field-label">{tr('显示方式')}</span>
          <Segmented label={tr('显示方式')} value={state} onChange={(s) => setState(c.id, s)} options={STATES.map((s) => ({ id: s, label: categoryStateLabel(s) }))} />
        </div>
        <CategoryGroupCombo className="cat-head-group" value={group} onChange={(g) => setGroup(c.id, g)} />
      </div>
      <p className="foot-note cat-head-hint">
        {state === 'hidden'
          ? tr('不显示：选类型时看不到它，已经挂着的任务和项目照常显示。')
          : state === 'frequent'
            ? tr('常用：选类型时排在最前面。')
            : tr('普通：选类型时按最近用过的先后排。')}
      </p>
    </div>
  );
}

/** 内置类型详情里那一句说明（为什么不能改、挂了有什么用）。 */
function lockedHint(id: string): string {
  if (id === STAR_CATEGORY_ID) return tr('内置类型，不能改。挂了它的任务，列表里的标题是黄色的。');
  if (id === URGENT_CATEGORY_ID) return tr('内置类型，不能改。挂了它的任务，列表里的标题是红色的。');
  if (id === IMPORTANT_CATEGORY_ID) return tr('内置类型，不能改。挂了它的任务，列表里的标题是蓝色的。');
  return tr('内置类型，不能改。挂了它的任务就是置顶的，每天都在我的一天最上面。');
}

/** 挂了这个类型的项目和任务（没做完的在前，做完 / 关闭的收在后面）。 */
function CategoryUses({ c }: { c: Category }) {
  const store = useStore();
  const groups = store.list('group').filter((g) => store.category(g.category_id)?.id === c.id);
  const tasks = store.tasksOfCategory(c.id);
  const open = tasks.filter((t) => !isFinished(t.status));
  const ended = tasks.filter((t) => isFinished(t.status));
  return (
    <>
      {!groups.length && !tasks.length && <Empty title={tr('还没有任务或项目挂这个类型')} hint={tr('任务在详情里点「类型」挂，项目在项目页名字下面挂。')} />}
      {groups.length > 0 && (
        <Section title={tr('项目 {length}', { length: groups.length })}>
          <div className="card types-groups">
            {groups.map((g) => (
              <RacButton key={g.id} className="more-item" onPress={() => navigate({ page: 'group', id: g.id })}>
                <span className="more-icon"><GroupIcon group={g} size={22} /></span>
                <span className="grow">{g.name}</span>
              </RacButton>
            ))}
          </div>
        </Section>
      )}
      {open.length > 0 && (
        <Section title={tr('任务 {length}', { length: open.length })}>
          <div className="task-list plain">
            {open.map((t) => (
              <TaskRow key={t.id} store={store} task={t} showDate />
            ))}
          </div>
        </Section>
      )}
      {ended.length > 0 && (
        <Section title={tr('已结束 {length}', { length: ended.length })}>
          <div className="task-list plain">
            {ended.map((t) => (
              <TaskRow key={t.id} store={store} task={t} showDate />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
