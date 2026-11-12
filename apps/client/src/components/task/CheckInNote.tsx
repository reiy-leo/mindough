/**
 * 打卡描述（Rei 2026-11-13 05:09「打卡任务 添加一个新属性"打卡描述"。只有打卡任务能添加。打卡描述显示在任务编辑器底部，打卡任务一直显示。」）：
 * 任务详情正文下面一块，打卡一直显示；空着是淡色占位，点进去直接写。纯文字（task.checkin_note），打字记在本地，失焦 / Esc / 关掉 / 打卡前存。
 * 打卡达标把正文存档时它不动。不进属性胶囊和「+」菜单。
 */
import { useEffect, useRef, useState } from 'react';
import { NotebookText } from 'lucide-react';
import type { Store, Task } from '@mindough/core';
import { AutoTextarea } from '../../ui/primitives';
import { registerTaskFlush } from '../../lib/body-flush';
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
  const save = () => {
    editing.current = false;
    const cur = store.get('task', task.id);
    if (!cur || store.isLocked(cur)) return;
    if ((cur.checkin_note ?? '') !== latest.current) store.setCheckInNote(task.id, latest.current);
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  // 打卡前、关掉面板时也存
  useEffect(() => registerTaskFlush(store, task.id, () => editing.current && saveRef.current()), [store, task.id]);
  useEffect(() => () => void (editing.current && saveRef.current()), []);
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
            setText(v);
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
