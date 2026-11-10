/**
 * 设置 → 日历 →「日历订阅」（Rei 2026-11-10，docs/CALENDAR.md 第五节）：添加只读 ICS 链接，起名、选颜色；
 * 每条能改名、换颜色、这台设备看不看、立即刷新、删除。列表跟账户同步（calendar_sub 表），事件只存本机（lib/calendar-subs）。
 */
import { useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { RadioGroup, Radio } from 'react-aria-components';
import { calSubStatusText, nextSubColor, normalizeCalendarUrl, normalizeSubColor, SUB_COLORS, syncedAgo, type CalendarSub, type SubColor } from '@mindough/core';
import { Button, ConfirmDialog, IconButton, Section, Sheet, Switch } from '../ui/primitives';
import { calendarSubs, forgetSubData, setSubHidden, syncCalendarSub, useCalendarSubState } from '../lib/calendar-subs';
import { useNow, useStore } from '../store/StoreProvider';
import { useUi } from '../lib/ui';
import { tr } from '../lib/i18n';
import { imeBusy } from '../lib/ime';
import '../styles/calendar.css';

const colorName = (c: SubColor) =>
  ({ blue: tr('蓝'), green: tr('绿'), orange: tr('橙'), red: tr('红'), purple: tr('紫'), teal: tr('青'), pink: tr('粉'), gray: tr('灰') })[c];

export function SubColorPicker({ value, onChange }: { value: SubColor; onChange: (c: SubColor) => void }) {
  return (
    <RadioGroup aria-label={tr('颜色')} orientation="horizontal" className="cal-color-picker" value={value} onChange={(v) => onChange(normalizeSubColor(v))}>
      {SUB_COLORS.map((c) => (
        <Radio key={c} value={c} aria-label={colorName(c)} className="cal-color-dot" style={{ ['--dot' as string]: `var(--cal-${c})` }} />
      ))}
    </RadioGroup>
  );
}

export function CalendarSubsSection() {
  const store = useStore();
  const subs = calendarSubs(store);
  const [adding, setAdding] = useState(false);
  return (
    <Section title={tr('日历订阅')} extra={<Button variant="secondary" onPress={() => setAdding(true)}><Plus size={15} /> {tr('添加订阅')}</Button>}>
      <div className="card settings-card">
        {subs.length === 0 && (
          <div className="setting">
            <div className="setting-text">
              <div className="setting-hint">{tr('贴一个日历的订阅地址（ICS / webcal），事件会显示在日历里，只能看、不能改，也不会变成任务。订阅列表跟着账户同步。')}</div>
            </div>
          </div>
        )}
        {subs.map((s) => (
          <SubRow key={s.id} sub={s} />
        ))}
      </div>
      <AddSubSheet isOpen={adding} onOpenChange={setAdding} />
    </Section>
  );
}

function SubRow({ sub }: { sub: CalendarSub }) {
  const store = useStore();
  const { states, hidden, syncing } = useCalendarSubState();
  const now = useNow(30_000);
  const [name, setName] = useState(sub.name);
  const [confirm, setConfirm] = useState(false);
  const st = states[sub.id]?.url === sub.url ? states[sub.id]! : null;
  const busy = syncing.includes(sub.id);
  const saveName = () => {
    const n = name.trim();
    if (n && n !== sub.name) store.update('calendar_sub', sub.id, { name: n });
    else setName(sub.name);
  };
  const ago = st?.okAt ? syncedAgo(st.okAt, now) : '';
  return (
    <div className="setting is-stacked cal-sub-row" style={{ ['--sub' as string]: `var(--cal-${normalizeSubColor(sub.color)})` }}>
      <div className="cal-sub-head">
        <span className="cal-sub-swatch" aria-hidden />
        <input
          className="input cal-sub-name"
          aria-label={tr('订阅名称')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !imeBusy(e.nativeEvent)) (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setName(sub.name);
          }}
        />
        <Switch label={tr('在这台设备上显示')} isSelected={!hidden.includes(sub.id)} onChange={(v) => setSubHidden(sub.id, !v)} />
      </div>
      <div className="cal-sub-url" title={sub.url}>{sub.url}</div>
      <SubColorPicker value={normalizeSubColor(sub.color)} onChange={(c) => store.update('calendar_sub', sub.id, { color: c })} />
      <div className="cal-sub-foot" aria-live="polite">
        <span className={`setting-hint lunar-status${st?.status ? (st.status.ok ? ' is-ok' : ' is-error') : ''}`}>
          {busy ? tr('正在同步…') : ago ? `${tr('上次同步 · {ago}', { ago })} · ` : ''}
          {!busy && calSubStatusText(st?.status ?? null)}
        </span>
        <span className="grow" />
        <IconButton label={tr('立即刷新')} isDisabled={busy} onPress={() => void syncCalendarSub(sub, { fresh: true })}>
          <RefreshCw size={16} className={busy ? 'spin' : undefined} />
        </IconButton>
        <IconButton label={tr('删除订阅')} onPress={() => setConfirm(true)}>
          <Trash2 size={16} />
        </IconButton>
      </div>
      <ConfirmDialog
        isOpen={confirm}
        onOpenChange={setConfirm}
        title={tr('删除这个订阅？')}
        message={tr('「{name}」的事件不再显示在日历里。所有设备上都会删掉。', { name: sub.name })}
        confirmLabel={tr('删除')}
        danger
        onConfirm={() => {
          store.remove('calendar_sub', sub.id);
          forgetSubData(sub.id);
        }}
      />
    </div>
  );
}

function AddSubSheet({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (v: boolean) => void }) {
  const store = useStore();
  const { toast } = useUi();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState<SubColor | null>(null);
  const [busy, setBusy] = useState(false);
  const all = store.list('calendar_sub');
  const pick = color ?? nextSubColor(all);
  const norm = url.trim() ? normalizeCalendarUrl(url) : null;
  const invalid = url.trim() !== '' && !norm;
  const dup = !!norm && all.some((s) => !s.deleted && s.url === norm);
  const reset = () => {
    setUrl('');
    setName('');
    setColor(null);
    setBusy(false);
  };
  const save = async () => {
    if (!norm || dup || busy) return;
    setBusy(true);
    const subs = calendarSubs(store);
    const row = store.insert('calendar_sub', { name: name.trim() || tr('日历订阅'), url: norm, color: pick, sort: (subs.at(-1)?.sort ?? 0) + 1, created_at: new Date().toISOString() });
    onOpenChange(false);
    reset();
    const r = await syncCalendarSub(row, { fresh: true });
    if (!name.trim() && r.name) store.update('calendar_sub', row.id, { name: r.name });
    toast(r.status.ok ? { message: tr('已添加订阅') } : { tone: 'error', message: calSubStatusText(r.status) });
  };
  return (
    <Sheet
      isOpen={isOpen}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
      title={tr('添加日历订阅')}
      footer={
        <>
          <span className="grow" />
          <Button variant="primary" isDisabled={!norm || dup || busy} onPress={() => void save()}>
            {tr('添加')}
          </Button>
        </>
      }
    >
      <div className="cal-add-form">
        <label className="field">
          <span className="field-label">{tr('订阅地址')}</span>
          <input
            className="input"
            autoFocus
            spellCheck={false}
            placeholder="https://… / webcal://…"
            value={url}
            aria-invalid={invalid || dup || undefined}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !imeBusy(e.nativeEvent) && void save()}
          />
        </label>
        {invalid && <div className="setting-hint lunar-status is-error">{tr('地址不对：要 http:// 或 https:// 开头的日历地址（webcal:// 也行）')}</div>}
        {dup && <div className="setting-hint lunar-status is-error">{tr('已经订阅过这个地址了')}</div>}
        <label className="field">
          <span className="field-label">{tr('名称')}</span>
          <input className="input" placeholder={tr('留空就用日历自己的名字')} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span className="field-label">{tr('颜色')}</span>
          <SubColorPicker value={pick} onChange={setColor} />
        </div>
        <div className="setting-hint">{tr('只读：事件只显示，不能改，也不会变成任务。地址里如果带私密令牌，同步后其他设备也看得到这个地址。')}</div>
      </div>
    </Sheet>
  );
}
