import { useState } from 'react';
import { Button as RacButton } from 'react-aria-components';
import { Archive, ArchiveRestore, CalendarRange, ChevronRight, Plus, Shapes } from 'lucide-react';
import { formatDateZh, isFinished, toDateKey, type Group, type Task } from '@mindough/core';
import { useStore } from '../store/StoreProvider';
import { navigate } from '../lib/router';
import { Button, ChipPicker, Empty, MenuAt, OverflowMenu, PopoverPanel, Section, Tip, useContextMenuAt } from '../ui/primitives';
import { GroupIcon } from '../components/project/GroupIcon';
import { ProjectTitle, unarchiveProject, useProjectActions } from '../components/project/ProjectActions';
import { useUi } from '../lib/ui';
import { ProjectSheet } from '../components/project/ProjectSheet';
import { CategoryLabel, CategoryPicker, NO_CATEGORY } from '../components/CategoryPicker';
import { TaskRow } from '../components/TaskRow';
import { PageHeader } from '../components/PageHeader';
import { QuickAddBar } from '../components/QuickAddBar';
import { ProjectBoard } from '../components/project/ProjectBoard';
import { ProjectTimeline } from '../components/project/ProjectTimeline';
import { ProjectChains } from '../components/project/ProjectChains';
import { SortMenu, ViewMenu } from '../components/project/ProjectMenus';
import { useSettings } from '../lib/settings';
import { normalizePrefs, sortTasks, type ProjectViewPrefs } from '../lib/project-view';

import { dataLabel, tr, trc } from '../lib/i18n';
function range(g: Group) {
  if (!g.start_at && !g.end_at) return tr('不限时间');
  return `${g.start_at ? formatDateZh(g.start_at, false) : '…'} – ${g.end_at ? formatDateZh(g.end_at, false) : '…'}`;
}

/**
 * 项目列表里的一张卡片：点了打开项目；右键 / 长按出菜单「在侧边栏显示 / 取消在侧边栏显示」（Rei 2026-10-28）。
 * 卡片是 react-aria 的按钮，右键和长按挂在外面一层（display: contents，不影响网格）。
 */
function GroupCard({ group: g }: { group: Group }) {
  const store = useStore();
  const menu = useContextMenuAt();
  const tasks = store.tasks().filter((t) => t.group_id === g.id);
  // 关闭的不算成就：既不算完成，也不计入总数
  const counted = tasks.filter((t) => t.status !== '关闭');
  const done = counted.filter((t) => t.status === '完成').length;
  const blocked = tasks.filter((t) => store.derived().get(t.id)?.state === '被阻塞').length;
  const c = store.category(g.category_id);
  const late = g.end_at && g.end_at < toDateKey(store.now()) && done < counted.length;
  const actions = useProjectActions(store, g);
  return (
    <div className="group-card-wrap" {...menu.props}>
      <RacButton
        className={`card group-card${g.archived_at ? ' is-archived' : ''}`}
        onPress={() => {
          if (menu.consumeLongPress()) return;
          navigate({ page: 'group', id: g.id });
        }}
      >
        <div className="group-card-head">
          <GroupIcon group={g} size={26} className="group-icon" />
          <span className="group-name">{g.name}</span>
          {c && <CategoryLabel c={c} size={12} />}
        </div>
        <div className={`group-range${late ? ' is-late' : ''}`}>
          <CalendarRange size={13} /> {range(g)}
        </div>
        {/* 卡片不显示进度（Rei 2026-11-04「项目列表中item紧凑一点，进度不显示」） */}
        {blocked > 0 && (
          <div className="group-stats">
            <span className="state-blocked">{tr('{blocked} 件还不能开始', { blocked })}</span>
          </div>
        )}
      </RacButton>
      <OverflowMenu label={tr('项目操作')} items={actions.items} className="group-card-more" />
      <MenuAt at={menu.at} label={tr('项目操作')} items={actions.items} onClose={menu.close} />
      {actions.dialogs}
    </div>
  );
}

export function GroupsPage() {
  const store = useStore();
  const [creating, setCreating] = useState(false);
  const [cat, setCat] = useState('all');
  // 归档了的（Rei 2026-11-05「项目可以归档」）不在主列表，放在最下面折叠的「已归档（N）」一节，默认收起；筛选只管主列表
  const [archivedOpen, setArchivedOpen] = useState(false);
  const archived = store.archivedGroups();
  // 类型（Rei 2026-10-26，和任务、打卡共用一套）：筛选只列有项目挂着的类型，空的不显示
  const all = store.activeGroups();
  const catOf = (g: Group) => store.category(g.category_id);
  const usedCats = store.categories(true).filter((c) => all.some((g) => catOf(g)?.id === c.id));
  const hasNone = all.some((g) => !catOf(g));
  const groups = all.filter((g) => cat === 'all' || (cat === NO_CATEGORY ? !catOf(g) : catOf(g)?.id === cat));
  return (
    <div className="page">
      <PageHeader
        title={trc('导航', '项目')}
        subtitle={tr('把相关的任务放在一起')}
        icon={<Shapes size={22} />}
        actions={
          <Tip content={tr('新建项目')}>
            <Button variant="primary" className="page-cta" aria-label={tr('新建项目')} onPress={() => setCreating(true)}>
              <Plus size={16} aria-hidden />
              <span className="page-cta-label">{tr('新建项目')}</span>
            </Button>
          </Tip>
        }
      />
      <div className="filter-row">
        {usedCats.length > 0 && (
          <ChipPicker
            label={tr('按类型筛选')}
            value={cat}
            onChange={setCat}
            options={[
              { id: 'all', label: tr('全部 {length}', { length: all.length }) },
              ...usedCats.map((c) => ({ id: c.id, label: <CategoryLabel c={c} plain />, color: c.color })),
              ...(hasNone ? [{ id: NO_CATEGORY, label: tr('没有类型') }] : []),
            ]}
          />
        )}
      </div>
      {groups.length === 0 ? (
        archived.length ? null : <Empty title={tr('还没有项目')} hint={tr('项目用来装一批相关任务，比如“搬家”“开发某个功能”')} />
      ) : (
        <div className="card-grid">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </div>
      )}
      {archived.length > 0 && (
        <section className={`section group-archived${archivedOpen ? ' is-open' : ''}`}>
          <RacButton className="habit-archived-toggle" aria-expanded={archivedOpen} aria-controls="group-archived-list" onPress={() => setArchivedOpen((o) => !o)}>
            <ChevronRight size={15} className="habit-archived-chevron" aria-hidden />
            <Archive size={15} aria-hidden />
            <span className="section-title">{tr('已归档（{n}）', { n: archived.length })}</span>
          </RacButton>
          {archivedOpen && (
            <div id="group-archived-list" className="card-grid">
              {archived.map((g) => (
                <GroupCard key={g.id} group={g} />
              ))}
            </div>
          )}
        </section>
      )}
      {creating && <ProjectSheet store={store} onClose={() => setCreating(false)} />}
    </div>
  );
}

/**
 * 单个项目的任务页（Rei 2026-10-26：「每个项目的视图支持列表、看板、时间轴，排序支持创建时间、修改时间、开始时间、到期时间，正序、倒序。
 * 视图和排序放在右上角图标按钮，点击dropdown。新建任务也统一换成输入框。标题和图标左上角，小一点，和右侧图标对齐」；
 * 同日「关系图完全去掉」「添加另外一个视图：任务链」「把项目中的任务关系按照任务链排列」）。
 * 视图、排序每个项目单独记在本机设置（settings.projectViews，不同步）；逻辑见 lib/project-view。
 */
export function GroupDetailPage({ id }: { id: string }) {
  const store = useStore();
  const { settings, set } = useSettings();
  const prefs = normalizePrefs(settings.projectViews[id]);
  const setPrefs = (patch: Partial<ProjectViewPrefs>) => set('projectViews', { ...settings.projectViews, [id]: { ...prefs, ...patch } });
  const g = store.get('group', id);
  if (!g) return <Empty title={tr('找不到这个项目')} hint={tr('可能已经删除了')} />;
  const tasks: Task[] = sortTasks(
    store.tasks().filter((t) => t.group_id === id),
    prefs.sort,
    prefs.dir,
  );
  // 回车建到本项目（带项目的默认类型），马上打开；看板里新任务是「待办」，自然在待办列
  const create = (text: string) => store.createTask({ body_md: text, group_id: g.id }).id;
  return <GroupDetail g={g} tasks={tasks} prefs={prefs} setPrefs={setPrefs} create={create} />;
}

function GroupDetail({
  g,
  tasks,
  prefs,
  setPrefs,
  create,
}: {
  g: Group;
  tasks: Task[];
  prefs: ProjectViewPrefs;
  setPrefs: (patch: Partial<ProjectViewPrefs>) => void;
  create: (text: string) => string;
}) {
  const store = useStore();
  const ui = useUi();
  const actions = useProjectActions(store, g);
  const c = store.category(g.category_id);
  const open = tasks.filter((t) => !isFinished(t.status));
  const ended = tasks.filter((t) => isFinished(t.status));
  // 默认类型归档了照样生效、照常显示（Rei 2026-10-17）
  const defType = store.get('task_type', store.effectiveDefaultTypeId(g));
  return (
    <div className={`page project-page is-${prefs.view}`}>
      <PageHeader
        compact
        title={g.name}
        titleNode={<ProjectTitle key={g.id} store={store} group={g} />}
        subtitle={
          <>
            {/* 顶上不写起止日期（Rei 2026-11-04「项目详情页，顶部不显示日期段」） */}
            <PopoverPanel
              label={trc('分类', '类型')}
              trigger={
                <RacButton className="link-btn project-cat-btn" aria-label={tr('改项目的类型')}>
                  {c ? <CategoryLabel c={c} size={12} /> : <span className="muted">{tr('设类型')}</span>}
                </RacButton>
              }
            >
              {(close) => (
                <div className="pop-section">
                  <CategoryPicker
                    store={store}
                    value={g.category_id}
                    label={false}
                    onChange={(cid) => {
                      store.update('group', g.id, { category_id: cid });
                      close();
                    }}
                  />
                </div>
              )}
            </PopoverPanel>
            {defType && <> {tr(' · 默认资料库：{name}', { name: dataLabel(defType.name) })}</>}
          </>
        }
        actions={
          <>
            <ViewMenu view={prefs.view} onChange={(view) => setPrefs({ view })} />
            <SortMenu field={prefs.sort} dir={prefs.dir} onChange={(sort, dir) => setPrefs({ sort, dir })} />
            <OverflowMenu label={tr('项目操作')} items={actions.items} />
          </>
        }
      />
      {g.archived_at && (
        <div className="banner project-archived-banner" role="status">
          <Archive size={18} aria-hidden />
          <span className="grow">
            <strong>{tr('这个项目已归档')}</strong>
            <span className="muted"> {tr('里面的任务不会进我的一天，也不在待安排、积压、时间轴里。')}</span>
          </span>
          <Button variant="tonal" className="small" onPress={() => unarchiveProject(store, ui, g)}>
            <ArchiveRestore size={15} aria-hidden />
            {tr('取消归档')}
          </Button>
        </div>
      )}
      <QuickAddBar label={tr('添加任务到这个项目')} placeholder={tr('这个项目里要做什么？按回车添加')} create={create} />
      {prefs.view === 'board' ? (
        <ProjectBoard store={store} tasks={tasks} />
      ) : prefs.view === 'timeline' ? (
        <ProjectTimeline store={store} tasks={tasks} scale={prefs.scale} onScale={(scale) => setPrefs({ scale })} />
      ) : prefs.view === 'chain' ? (
        <ProjectChains store={store} groupId={g.id} tasks={tasks} />
      ) : (
        <>
          <div className="task-list plain">
            {open.map((t) => (
              <TaskRow key={t.id} store={store} task={t} showGroup={false} showDate />
            ))}
            {!open.length && <Empty title={tr('项目里的任务都做完了')} />}
          </div>
          {ended.length > 0 && (
            <Section title={tr('已结束 {length}', { length: ended.length })}>
              <div className="task-list plain">
                {ended.map((t) => (
                  <TaskRow key={t.id} store={store} task={t} showGroup={false} showDate />
                ))}
              </div>
            </Section>
          )}
        </>
      )}
      {actions.dialogs}
    </div>
  );
}
