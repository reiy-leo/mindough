/**
 * 打卡描述（Rei 2026-11-13 05:09「打卡任务 添加一个新属性"打卡描述"。只有打卡任务能添加。打卡描述显示在任务编辑器底部，打卡任务一直显示。」）：
 * 任务详情正文下面一块，打卡一直显示；空着是淡色占位，点进去直接写。纯文字（task.checkin_note），边打边存（Rei 2026-11-13 06:19，lib/live-save：停手 300 ms 存，失焦 / Esc / 关掉 / 页面藏起 / 打卡前马上存，选字中不存）。
 * 打卡达标把正文存档时它不动。不进属性胶囊和「+」菜单。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { NotebookText } from 'lucide-react';
import type { Store, Task } from '@mindough/core';
import { AutoTextarea } from '../../ui/primitives';
import { registerTaskFlush } from '../../lib/body-flush';
import { createLiveSaver, onPageHide } from '../../lib/live-save';
import { tr } from '../../lib/i18n';

export function CheckInNote({ store, task, readOnly = false }: { store: Store; task: Task; readOnly?: boolean }) {
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
  const saveRef = useRef(save);
  saveRef.current = save;
  // 打卡前、关掉面板时也存；页面藏起来时排着的马上存
  useEffect(() => registerTaskFlush(store, task.id, () => (editing.current || saver.pending) && saveRef.current()), [store, task.id, saver]);
  useEffect(() => () => void ((editing.current || saver.pending) && saveRef.current()), [saver]);
  useEffect(() => onPageHide(() => saver.flush()), [saver]);
  const id = `ci-note-${task.id}`;
  return (
    <section className="checkin-note" aria-labelledby={id}>
      <div className="checkin-note-head" id={id}>
        <NotebookText size={14} aria-hidden />
        {tr('打卡描述')}
      </div>
      {readOnly ? (
        saved ? <p className="checkin-note-text">{saved}</p> : <p className="checkin-note-text is-empty">{tr('没有打卡描述')}</p>
      ) : (
        <AutoTextarea
          label={tr('打卡描述')}
          className="checkin-note-input"
          minRows={1}
          value={text}
          placeholder={tr('添加打卡描述…')}
          onChange={(v) => {
            editing.current = true;
            latest.current = v;
            setText(v);
            saver.schedule();
          }}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              save();
              e.currentTarget.blur();
            }
          }}
        />
      )}
    </section>
  );
}
