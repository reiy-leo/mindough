/**
 * 日记的输入框（Rei 2026-10-28 附图：深色圆角输入框，占位「What's on your mind? Capture it…」，底部左边图标，右边「Send」）。
 * 正文用和任务一样的 Tiptap 编辑器（Rei 2026-10-29「任务和日记 editor 要行为一致」）：写法、快捷键、粘贴都一样，
 * 正文里也不收图片（粘贴 / 拖进来的图片拦下，提示「正文里不能放图片」）。
 * - 左边：心情（可选，点一个再发；再点一次取消）、图片、剪贴板（剪贴板里有图片时才出现）。
 *   列表按钮去掉了（Rei 2026-11-09 03:52「日记页 输入框 功能栏 去掉列表按钮」）；正文里打「- 」「1. 」照样变列表（编辑器自带的 Markdown 输入规则）。
 *   标签不做（Rei 2026-10-28「标签不做」），所以没有 # 按钮。
 * - 图片（Rei 2026-10-29「日记的工具栏保留图标，限制只能是图片」）：只收图片，选了先放在编辑器下面的「待发」小图里（能去掉），
 *   发送时跟着这条走，挂成这条的附件（lib/journal-send.ts）。别的文件提示「只能加图片」。
 *   把图片拖到输入框上（包括正文）也一样进「待发」（Rei 2026-11-01，和任务详情拖附件一致）。
 * - 右边：发送（⌘/Ctrl + Enter 也发）。只放了图片也能发。发了就不能改（Store 拦着），所以发送前不用确认。
 * - 没发的正文和心情存成这台设备上的草稿（Rei 2026-11-14，lib/list-draft）：切页回来、刷新、重启都还在，发了就删；待发的图片不存。
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from 'react';
import { Button as RacButton } from 'react-aria-components';
import { ImagePlus, Send, Smile, X } from 'lucide-react';
import { canSendPost, moodLabel, type MoodId } from '@mindough/core';
import { PopoverPanel, Tip } from '../../ui/primitives';
import { useUi } from '../../lib/ui';
import { tooBigMessage } from '../../lib/attachments';
import { pickImages } from '../../lib/journal-send';
import { LazyMdEditor } from '../editor/LazyMdEditor';
import type { MdEditorHandle } from '../editor/editor';
import { ClipboardButton } from '../attachments/ClipboardButton';
import { DropOverlay, useFileDrop } from '../attachments/Attachments';
import { MoodIcon } from './MoodIcon';
import { MoodGrid } from './MoodGrid';
import { tr } from '../../lib/i18n';
import { draftKey, useListDraft } from '../../lib/list-draft';

export interface ComposerHandle {
  focus: () => void;
}

interface Pending {
  id: number;
  file: File;
  url: string;
}

let seq = 0;

export const JournalComposer = forwardRef<ComposerHandle, { onSend: (body: string, mood: MoodId | null, images: File[]) => void; autoFocus?: boolean }>(function JournalComposer({ onSend, autoFocus }, ref) {
  const ui = useUi();
  const [draft, saveDraft, clearDraft] = useListDraft(draftKey('journal'));
  const body = draft.text;
  const mood = (draft.mood ?? null) as MoodId | null;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // 同一拍里先后改正文和心情也不丢：先更新 ref 再存
  const setBody = (text: string) => saveDraft((draftRef.current = { ...draftRef.current, text }));
  const setMood = (m: MoodId | null) => saveDraft((draftRef.current = { text: draftRef.current.text, mood: m }));
  const [played, setPlayed] = useState(0);
  const [pending, setPending] = useState<Pending[]>([]);
  const editor = useRef<MdEditorHandle | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const focus = () => editor.current?.focus();
  useImperativeHandle(ref, () => ({ focus }), []);

  // 待发的小图用 object URL，去掉、发出去、离开页面时收回
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => () => pendingRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const addImages = (files: readonly File[]) => {
    const r = pickImages(files);
    if (r.notImage.length) ui.toast({ tone: 'error', message: tr('只能加图片') });
    if (r.tooBig.length) ui.toast({ tone: 'error', message: tooBigMessage(r.tooBig) });
    if (r.images.length) setPending((cur) => [...cur, ...r.images.map((f) => ({ id: ++seq, file: f, url: URL.createObjectURL(f) }))]);
  };
  const dropping = useFileDrop(box, addImages);
  const removeImage = (id: number) =>
    setPending((cur) =>
      cur.filter((p) => {
        if (p.id === id) URL.revokeObjectURL(p.url);
        return p.id !== id;
      }),
    );

  const canSend = canSendPost(body, mood, pending.length);
  const send = () => {
    // 编辑器里刚打的字可能还没走完 onChange：直接从编辑器拿
    const text = editor.current?.getMarkdown() ?? body;
    if (!canSendPost(text, mood, pending.length)) return;
    onSend(text, mood, pending.map((p) => p.file));
    pending.forEach((p) => URL.revokeObjectURL(p.url));
    setPending([]);
    clearDraft();
    editor.current?.setMarkdown('');
    focus();
  };
  const sendRef = useRef(send);
  sendRef.current = send;

  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘↩' : 'Ctrl+Enter';
  return (
    <div ref={box} className={`jcomposer${mood ? ' has-mood' : ''}`} style={mood ? ({ '--jm': `var(--mood-${mood})` } as CSSProperties) : undefined}>
      <DropOverlay active={dropping} compact title={tr('添加图片')} />
      <LazyMdEditor
        className="jcomposer-input"
        // 打 @ 提到任务和倒数日（Rei 2026-11-10）
        mention={{ scope: 'journal' }}
        label={tr('写一条日记')}
        placeholder={tr('在想什么？记下来…')}
        value={body}
        onChange={setBody}
        autoFocus={autoFocus}
        onModEnter={() => sendRef.current()}
        handleRef={editor}
      />
      {pending.length > 0 && (
        <ul className="jcomposer-pending" aria-label={tr('要发的图片')}>
          {pending.map((p) => (
            <li key={p.id} className="jcomposer-thumb">
              <img src={p.url} alt={p.file.name} />
              <RacButton className="jcomposer-thumb-x" aria-label={tr('去掉「{name}」', { name: p.file.name })} onPress={() => removeImage(p.id)}>
                <X size={12} strokeWidth={3} aria-hidden />
              </RacButton>
            </li>
          ))}
        </ul>
      )}
      <div className="jcomposer-bar">
        <PopoverPanel
          label={tr('选个心情')}
          className="jmood-pop"
          placement="bottom start"
          trigger={
            <RacButton className={`jcomposer-tool jcomposer-mood${mood ? ' is-set' : ''}`} aria-label={mood ? tr('心情：{label}', { label: moodLabel(mood) }) : tr('选个心情')}>
              {mood ? <MoodIcon key={played} mood={mood} size={22} playing={played > 0} /> : <Smile size={18} />}
              {mood && <span className="jcomposer-mood-name">{moodLabel(mood)}</span>}
            </RacButton>
          }
        >
          {(close) => (
            <MoodGrid
              value={mood}
              onPick={(next) => {
                setMood(next);
                if (next) setPlayed((n) => n + 1);
                close();
                requestAnimationFrame(focus);
              }}
            />
          )}
        </PopoverPanel>
        {mood && (
          <RacButton className="jcomposer-tool jcomposer-clear" aria-label={tr('不选心情')} onPress={() => setMood(null)}>
            <X size={14} />
          </RacButton>
        )}
        <Tip content={tr('添加图片')}>
          <RacButton className="jcomposer-tool" aria-label={tr('添加图片')} onPress={() => file.current?.click()}>
            <ImagePlus size={18} />
          </RacButton>
        </Tip>
        <ClipboardButton className="jcomposer-tool" imagesOnly onFiles={addImages} />
        <input
          ref={file}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            addImages(files);
          }}
        />
        <span className="grow" />
        <Tip content={tr('发送（{key}）', { key: shortcut })}>
          <RacButton className="jcomposer-send" isDisabled={!canSend} onPress={send}>
            <Send size={16} />
            <span>{tr('发送')}</span>
          </RacButton>
        </Tip>
      </div>
    </div>
  );
});
