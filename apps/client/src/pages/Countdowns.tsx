import { useRef, useState } from 'react';
import { Button as RacButton, Dialog, Popover } from 'react-aria-components';
import { Hourglass, Paintbrush, PanelRight, Plus } from 'lucide-react';
import { formatDateZh, formatTaskDate, toDateKey, type Task } from '@mindough/core';
import { useDateDisplay } from '../lib/date-display';
import { useNow, useStore } from '../store/StoreProvider';
import { useUi } from '../lib/ui';
import { Button, ChipPicker, Empty, MenuAt, OverflowMenu, Section, Segmented, useContextMenuAt, type MenuAction } from '../ui/primitives';
import { CardColorPicker } from '../components/CardColorPicker';
import { cardColorVars } from '../lib/card-colors';
import { useSettings } from '../lib/settings';
import { CategoryLabel, CategoryLabels, NO_CATEGORY } from '../components/CategoryPicker';
import { PageHeader } from '../components/PageHeader';
import { titleOf } from '../lib/view';
import { typeIcon } from '../lib/icons';
import { tr } from '../lib/i18n';
import { trx } from '../lib/trx';
import { createBlankTask } from '../lib/blank-task';


/**
 * 倒数日（Rei 2026-10-26「把倒数日从“打卡”中拆出来单独一个侧边栏入口」）：
 * 以前是打卡页最下面的一节，现在单独一页，在侧边栏「持续」里。卡片和原来一样，点开是任务详情（提醒、农历重复都在详情里）。
 * 排序：今天和还没到的在前，越近越前；已经过了的排后面，刚过的在前。
 * 类型（Rei 2026-10-26，和打卡、项目共用一套）：能按类型筛选、分组；只列有倒数日挂着的类型，一个都没挂就不出筛选条。
 */
/**
 * 一张倒数日卡片：点了打开详情；右键 / 长按 / 右上角 ··· 出菜单「查看详情 ｜ 颜色…」。
 * 背景色（Rei 2026-11-02「倒数日的card可以设置不同的颜色背景」）存在 task.card_color，字色按对比度挑黑或白（lib/card-colors.ts）。
 */
function CountdownCard({ task: t, n, withCat }: { task: Task; n: number; withCat: boolean }) {
  const store = useStore();
  const ui = useUi();
  const { theme } = useSettings();
  const today = toDateKey(useNow());
  const dateMode = useDateDisplay();
  const menu = useContextMenuAt();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [picking, setPicking] = useState(false);
  const type = store.get('task_type', t.type_id);
  const Icon = typeIcon(type?.icon);
  const c = withCat ? store.categoryOf(t) : undefined;
  const vars = cardColorVars(t, theme);
  const items: MenuAction[] = [
    { id: 'open', label: tr('查看详情'), icon: <PanelRight size={16} />, onAction: () => ui.openEditor(t.id) },
    { id: 'color', label: tr('颜色…'), icon: <Paintbrush size={16} />, separator: true, onAction: () => window.setTimeout(() => setPicking(true), 0) },
  ];
  return (
    <div ref={wrapRef} className={`countdown-card-wrap${vars ? ' has-color' : ''}`} style={vars} {...menu.props}>
      <RacButton
        className={`card countdown-card${vars ? ' has-color' : ''}${ui.editingId === t.id ? ' is-selected' : ''}`}
        data-task-id={t.id}
        aria-current={ui.editingId === t.id ? 'true' : undefined}
        onPress={() => {
          if (menu.consumeLongPress()) return;
          ui.openEditor(t.id);
        }}
      >
        <span className="countdown-title">
          {type && type.layout !== 'text' && <Icon size={14} style={vars ? undefined : { color: type.color }} />}
          {titleOf(store, t)}
        </span>
        <span className="countdown-num">
          {n === 0 ? <b>{tr('今天')}</b> : n > 0 ? trx('还有 {n} 天', { n: <b>{n}</b> }, { count: n }, { wrap: 'countdown-affix' }) : trx('已过 {n} 天', { n: <b>{-n}</b> }, { count: -n }, { wrap: 'countdown-affix' })}
        </span>
        <span className="countdown-date">
          {dateMode === 'auto' ? formatDateZh(t.target_date!) : formatTaskDate(t.target_date!, { mode: dateMode, today })}
          {c && <CategoryLabels cats={store.categoriesOfTask(t)} size={12} />}
        </span>
      </RacButton>
      <OverflowMenu label={tr('倒数日操作')} items={items} className="countdown-card-more" />
      <MenuAt at={menu.at} label={tr('倒数日操作')} items={items} onClose={menu.close} />
      {picking && (
        <Popover triggerRef={wrapRef} isOpen onOpenChange={(o) => !o && setPicking(false)} className="popover popover-panel" placement="bottom start" offset={6}>
          <Dialog className="popover-dialog" aria-label={tr('卡片颜色')}>
            <div className="pop-section">
              <div className="pop-title">{tr('卡片颜色')}</div>
              <CardColorPicker store={store} task={t} onDone={() => setPicking(false)} />
            </div>
          </Dialog>
        </Popover>
      )}
    </div>
  );
}

export function CountdownsPage() {
  const store = useStore();
  const ui = useUi();
  const now = useNow();
  const today = toDateKey(now);
  const dateMode = useDateDisplay();
  const daysOf = (t: Task) => store.progress(t.id, today)?.value ?? 0;
  // 归档了的项目里的倒数日不列（Rei 2026-11-05）
  const countdowns = store
    .activeTasks()
    .filter((t) => t.completion_mode === 'countdown' && t.target_date && t.status !== '关闭')
    .map((t) => ({ t, n: daysOf(t) }))
    .sort((a, b) => (a.n >= 0) === (b.n >= 0) ? Math.abs(a.n) - Math.abs(b.n) : a.n >= 0 ? -1 : 1);
  const [cat, setCat] = useState<string>('all');
  const [arrange, setArrange] = useState<'date' | 'category'>('date');
  const catOf = (t: Task) => store.categoryOf(t);
  // 一件任务能挂几个类型（Rei 2026-10-28）：筛选看挂没挂这个类型；按类型分组时放在第一个类型下面（不重复出现）
  const hasCat = (t: Task, id: string) => store.categoryIdsOfTask(t).includes(id);
  const usedCats = store.categories(true).filter((c) => countdowns.some(({ t }) => hasCat(t, c.id)));
  const hasUncategorized = countdowns.some(({ t }) => !catOf(t));
  const shown = cat === 'all' ? countdowns : countdowns.filter(({ t }) => (cat === NO_CATEGORY ? !catOf(t) : hasCat(t, cat)));
  // 不弹新建面板（Rei 2026-11-09 01:31）：直接建一条空倒数日，在详情里打开、日期在详情里选（lib/blank-task）
  const newCountdown = () => createBlankTask(store, ui.openEditor, 'countdown', cat !== 'all' && cat !== NO_CATEGORY ? cat : null);
  const grid = (list: typeof countdowns, withCat: boolean) => (
    <div className="countdown-grid">
      {list.map(({ t, n }) => (
        <CountdownCard key={t.id} task={t} n={n} withCat={withCat} />
      ))}
    </div>
  );

  return (
    <div className="page">
      <PageHeader
        title={tr('倒数日')}
        icon={<Hourglass size={22} />}
        actions={
          <Button variant="primary" onPress={newCountdown}>
            <Plus size={16} />
            {tr('新建倒数日')}
          </Button>
        }
      />
      {countdowns.length > 0 && usedCats.length > 0 && (
        <div className="filter-row checkin-filters">
          <ChipPicker
            label={tr('按类型筛选')}
            value={cat}
            onChange={setCat}
            options={[
              { id: 'all', label: tr('全部 {length}', { length: countdowns.length }) },
              ...usedCats.map((c) => ({ id: c.id, label: <CategoryLabel c={c} plain />, color: c.color })),
              ...(hasUncategorized ? [{ id: NO_CATEGORY, label: tr('没有类型') }] : []),
            ]}
          />
          <Segmented
            label={tr('排列方式')}
            value={arrange}
            onChange={setArrange}
            options={[
              { id: 'date', label: tr('按日期') },
              { id: 'category', label: tr('按类型') },
            ]}
          />
        </div>
      )}
      {countdowns.length ? (
        arrange === 'category' && usedCats.length > 0 ? (
          [...usedCats.map((c) => ({ key: c.id, c })), { key: NO_CATEGORY, c: undefined }].map(({ key, c }) => {
            const list = shown.filter(({ t }) => (c ? catOf(t)?.id === c.id : !catOf(t)));
            if (!list.length) return null;
            return (
              <Section key={key} title={c ? <CategoryLabel c={c} size={15} /> : tr('没有类型')} extra={<span className="muted small">{tr('{length} 项', { length: list.length })}</span>}>
                {grid(list, false)}
              </Section>
            );
          })
        ) : (
          grid(shown, true)
        )
      ) : (
        <Empty icon={<Hourglass size={28} />} title={tr('还没有倒数日')} hint={tr('考试、纪念日、出发那天，记下来看看还有几天。')} />
      )}
    </div>
  );
}
