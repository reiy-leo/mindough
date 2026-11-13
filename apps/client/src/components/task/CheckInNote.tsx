/**
 * 打卡描述（Rei 2026-11-13 05:09「打卡任务 添加一个新属性"打卡描述"。只有打卡任务能添加。」）。
 * 07:25 改成属性（「打卡描述做成属性，在属性dropdown中放在心情、附件一组。打卡显示成一个box,背景略深，统一圆角」）：
 * - 胶囊行上面（正文下面）一个框（底色同详情里的属性卡片，圆角 --radius-lg），只有打卡有；
 * - 没写时不显示，从「+」菜单选「打卡描述」才出来、光标进去（autoFocus）；写了就一直显示；
 * - 删空后离开（失焦 / Esc）就收起，回到「+」菜单；框内右上角的 × 一下清掉并收起，提示里能撤销（同心情胶囊的 ×）。
 * - 09:31 去掉框头（「打卡描述的label不要，换成用placeholder」）：框里只有输入区，空着时靠占位「添加打卡描述…」说明用途；读屏名还是「打卡描述」。
 * 纯文字（task.checkin_note），边打边存（Rei 2026-11-13 06:19，lib/live-save：停手 300 ms 存，失焦 / Esc / 关掉 / 页面藏起 / 打卡前马上存，选字中不存）。
 * 打卡达标把正文存档时它不动。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button as RacButton } from 'react-aria-components';
import { X } from 'lucide-react';
import type { Store, Task } from '@mindough/core';
import { AutoTextarea } from '../../ui/primitives';
import { registerTaskFlush } from '../../lib/body-flush';
import { createLiveSaver, onPageHide } from '../../lib/live-save';
import { tr } from '../../lib/i18n';
import { useUi } from '../../lib/ui';

export function CheckInNote({
  store,
  task,
  readOnly = false,
  autoFocus = false,
  onOpenChange,
}: {
  store: Store;
  task: Task;
  readOnly?: boolean;
  /** 刚从「+」菜单打开：光标放进去。 */
  autoFocus?: boolean;
  /** 光标进来时 true（打字删空也不收）；删空后离开、点 × 时 false（收起）。 */
  onOpenChange?: (open: boolean) => void;
}) {
  const ui = useUi();
  const saved = task.checkin_note ?? '';
  const [text, setText] = useState(saved);
  const latest = useRef(text);
  latest.current = text;
  const editing = useRef(false);
  useEffect(() => {
    // 别处（同步、撤销）改了，而这里没在写：跟上
    if (!editing.current) setText(saved);
  }, [saved]);
  /** 写进库（没变不写）。 */
  const write = () => {
    const cur = store.get('task', task.id);
    if (!cur || store.isLocked(cur)) return;
    if ((cur.checkin_note ?? '') !== latest.current) store.setCheckInNote(task.id, latest.current);
  };
  const writeRef = useRef(write);
  writeRef.current = write;
  const saver = useMemo(() => createLiveSaver(() => writeRef.current()), []);
  /** 离开（失焦 / Esc / 关掉 / 打卡前）：马上存，之后别处来的改动可以灌进来。 */
  const save = () => {
    saver.cancel();
    editing.current = false;
    write();
  };
  /** 失焦 / Esc：存下；删空了就收起（回到「+」菜单）。 */
  const leave = () => {
    save();
    if (!latest.current.trim()) onOpenChange?.(false);
  };
  /** 框内右上角的 ×：清掉、收起，提示里能撤销。 */
  const clear = () => {
    saver.cancel();
    editing.current = false;
    const before = store.get('task', task.id)?.checkin_note ?? '';
    latest.current = '';
    setText('');
    store.setCheckInNote(task.id, null);
    onOpenChange?.(false);
    if (before.trim())
      ui.toast({ message: tr('已清除「{label}」', { label: tr('打卡描述') }), actions: [{ label: tr('撤销'), onPress: () => store.setCheckInNote(task.id, before) }] }, 5000);
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  // 打卡前、关掉面板时也存；页面藏起来时排着的马上存
  useEffect(() => registerTaskFlush(store, task.id, () => (editing.current || saver.pending) && saveRef.current()), [store, task.id, saver]);
  useEffect(() => () => void ((editing.current || saver.pending) && saveRef.current()), [saver]);
  useEffect(() => onPageHide(() => saver.flush()), [saver]);
  return (
    <section className={`checkin-note${readOnly ? '' : ' has-x'}`} aria-label={tr('打卡描述')}>
      {!readOnly && (
        <RacButton className="checkin-note-x" aria-label={tr('清除{label}', { label: tr('打卡描述') })} onPress={clear}>
          <X size={12} strokeWidth={2.5} aria-hidden />
        </RacButton>
      )}
      {readOnly ? (
        <p className="checkin-note-text">{saved}</p>
      ) : (
        <AutoTextarea
          label={tr('打卡描述')}
          className="checkin-note-input"
          minRows={1}
          value={text}
          autoFocus={autoFocus}
          placeholder={tr('添加打卡描述…')}
          onFocus={() => onOpenChange?.(true)}
          onChange={(v) => {
            editing.current = true;
            latest.current = v;
            setText(v);
            saver.schedule();
          }}
          onBlur={leave}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              const el = e.currentTarget;
              leave();
              el.blur();
            }
          }}
        />
      )}
    </section>
  );
}
