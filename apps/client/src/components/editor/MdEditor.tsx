/**
 * Markdown 所见即所得编辑器（任务内容、资料 / 人物备注）。写的时候就是排好版的样子，存的还是 markdown。
 *
 * - 写法：直接打 markdown 也会变（「# 」标题、「- 」列表、「[ ] 」清单、「> 」引用、「```」代码、**粗体**…）。
 * - 没有工具栏（Rei 2026-10-25「换成tiptap后，不用显示toolbar」）：格式靠快捷键（⌘B / ⌘I / ⌘⌥X / ⌘⌥1–6 / ⌘⌥8 / ⌘⌥7 / ⌘⇧B / ⌘⌥C）
 *   和手打语法（清单 `[] `、表格 `|3x2| `、折叠块 `<details>` 回车、提示块 `> [!NOTE]`、公式 `$…$`）。⌘K / Ctrl+K 加链接，Esc 收起。
 * - 悬停不变底色（Rei 2026-10-25「hover编辑器不用change bg」），聚焦也不变；只有光标。备注框（.note-editor）聚焦时边框照旧变强调色。
 * - 链接（Rei 2026-10-17「放上去就展示吧，点一下是访问链接」）：点一下打开（Web 新标签页，App 交给系统浏览器）；
 *   鼠标移到链接上出现小浮层：「访问」「编辑」「去掉链接」三个按钮，不显示网址（Rei 2026-11-03），网址在「访问」的悬停提示里；
 *   鼠标能移进浮层，移开收起。
 *   触屏没有悬停：长按选中链接里的字（光标 / 选区落在链接里）出同一个浮层。
 * - 链接框（Rei 2026-10-17「编辑器中链接要支持编辑名称和链接」）：浮层「编辑」、⌘K 都开同一个框，
 *   桌面：就是那个悬停浮层原地展开（新加时锚在光标 / 选区处），不是居中弹窗；触屏：底部弹出面板，键盘弹起时跟着抬高、留出安全区。
 *   两栏「文字」「链接」：在已有链接里 = 预填两栏、保存时整段换掉；选了字 = 预填文字；文字空着就用网址当名字；
 *   网址没协议补 https://，不像网址就在框里提示、不关。回车保存（输入法选字的回车不算）、Esc 取消，Tab 只在框里转。
 *   点框外面 = 取消。
 *   ⌘K 新加链接（不在已有链接里、选中的字本身不是网址）：读剪贴板，是一条链接就填进「链接」并全选，回车就保存
 *   （Rei 2026-11-04）。先开框、读到再填，用户已经在框里打字就不填。怎么读、什么算链接见 lib/clip-link.ts。
 * - 外面的值变了（同步下来）且不是自己刚写的：替换内容。
 * - ⌘ / Ctrl + Enter：给了 onModEnter 就交给它（日记输入框发送，Rei 2026-10-29「任务和日记 editor 要行为一致」），不给照常换行。
 * - ⌘? / ⌘/（Windows / Linux 是 Ctrl）：光标旁弹出「写法和快捷键」浮层（Rei 2026-11-03），只看不点；Esc、再按一次、点别处、离开编辑器都收起。
 *   下划线 ⌘U（+1 波浪线、+2 双线）见 underline.ts。
 * - 粘贴进正文的图片：拦下、不上传，提示「正文里不能放图片」（Rei 2026-10-29）。从外面拖进来的文件（包括图片、落在正文上）都是附件，外框先接住，见 Attachments.tsx attachFileDrop。
 * - @ 提及任务（Rei 2026-11-10）：给了 mention（任务正文、日记）就能打 @，光标旁弹出候选（mention.ts 管 @ 和键盘，这里画浮层）；
 *   ↑ ↓ 换、回车 / Tab / 点一下选、Esc 收起；组字时不弹不过滤。插进去是胶囊，点了打开那件任务。
 * 内核是 Tiptap 3（@tiptap/react 的 useEditor + EditorContent，Rei 2026-10-25 从 Milkdown 换过来），读写 markdown 见 editor.ts / markdown.ts。
 * 这个文件按需加载（LazyMdEditor），加载完之前显示排好版的预览。
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import { Button as RacButton, Input, Label, TextField } from 'react-aria-components';
import { Circle, CircleCheck, ExternalLink, Hourglass } from 'lucide-react';
import type { MentionCandidate, MentionScope } from '@mindough/core';
import { mentionChoices, mentionInfo } from '../../lib/task-mention';
import { tr } from '../../lib/i18n';
import { externalHref, openExternal } from '../../lib/external';
import { readClipboardLink } from '../../lib/clip-link';
import { useUiOptional } from '../../lib/ui';
import { MdController, normalizeHref, stopTab, type LinkRange, type MdEditorHandle, type MdEditorOptions, type MentionState } from './editor';
import { mentionAnchor, placeMentionPop, type Coords } from './mention-place';
import { formatChord, isAppleKeyboard, shortcutRows, shortcutTexts } from './shortcuts';

export interface MdEditorProps {
  value: string;
  onChange: (md: string) => void;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
  onEscape?: () => void;
  className?: string;
  /** 只读：能看、能点链接，不能改。 */
  readOnly?: boolean;
  /** ⌘ / Ctrl + Enter（日记输入框发送用，Rei 2026-10-29）；不给就照常换行。 */
  onModEnter?: () => void;
  /** 拿到编辑器句柄（日记输入框：清空、聚焦、列表按钮）；卸载时置回 null。 */
  handleRef?: MutableRefObject<MdEditorHandle | null>;
  /** 任务正文：第一行是标题，只能是纯文字（Rei 2026-11-03，见 title.ts）。日记、备注不给。 */
  plainTitle?: boolean;
  /** 能打 @ 提及任务（Rei 2026-11-10）：任务正文 scope task（selfId = 这件任务，不列自己）、日记 scope journal（多列倒数日）。备注不给。 */
  mention?: { scope: MentionScope; selfId?: string | null };
}

/** 链接框：改哪一段（新加时是选区 / 光标）、是不是已有的链接、两栏的值。 */
interface LinkDialog {
  range: { from: number; to: number };
  existing: LinkRange | null;
  text: string;
  href: string;
  /** 选区跨了段落：文字不能改，只加链接。 */
  textLocked: boolean;
  error: '' | 'empty' | 'bad';
  /** 触屏：底部弹出面板（避开键盘和安全区）；鼠标 / 键盘：锚在链接 / 光标旁的浮层。 */
  sheet: boolean;
}

/** 输入法正在选字时的回车（Safari 选完字的那次 keydown 是 229）不算保存。 */
const composing = (e: React.KeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229;

export function MdEditor({ value, onChange, label, placeholder = '', autoFocus, onBlur, onEscape, className, readOnly = false, onModEnter, handleRef, plainTitle = false, mention }: MdEditorProps) {
  const ui = useUiOptional();
  const handle = useRef<MdEditorHandle | null>(null);
  const cb = useRef({ onChange, onBlur, onEscape, onModEnter });
  cb.current = { onChange, onBlur, onEscape, onModEnter };
  const [focused, setFocused] = useState(false);
  const [dialog, setDialog] = useState<LinkDialog | null>(null);
  /** 鼠标指着的链接；光标 / 选区所在的链接（触屏、键盘）。 */
  const [hover, setHover] = useState<LinkRange | null>(null);
  const [selLink, setSelLink] = useState<LinkRange | null>(null);
  const [popPos, setPopPos] = useState<{ left: number; top: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touch = useRef(false);
  const wrap = useRef<HTMLDivElement>(null);
  const popEl = useRef<HTMLDivElement>(null);
  const hrefInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const linkingRef = useRef(false);
  linkingRef.current = !!dialog;
  /** 「写法和快捷键」浮层：开着时的光标位置（视口坐标）。 */
  const [help, setHelp] = useState<{ left: number; top: number; bottom: number } | null>(null);
  const helpRef = useRef(false);
  helpRef.current = !!help;
  const toggleHelp = () => {
    if (helpRef.current) return setHelp(null);
    const h = handle.current;
    if (!h) return;
    const box = wrap.current?.getBoundingClientRect();
    const c = h.coordsOf(h.selection()) ?? (box ? { left: box.right - 16, top: box.top, bottom: box.top } : null);
    if (c) setHelp(c);
  };
  const toggleHelpRef = useRef(toggleHelp);
  toggleHelpRef.current = toggleHelp;

  /** 正在打的 @（mention.ts 报上来的）、候选里选中第几条、手指 / 鼠标正按在浮层上（这时编辑器失焦不收）。 */
  const [mq, setMq] = useState<MentionState | null>(null);
  const [mActive, setMActive] = useState(0);
  const mPointer = useRef(false);
  const mentionRef = useRef(mention);
  mentionRef.current = mention;
  const choices: MentionCandidate[] = useMemo(
    () => (mq && mention ? mentionChoices(mention.scope, mention.selfId, mq.query) : []),
    [mq?.query, mq != null, mention?.scope, mention?.selfId], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const mRef = useRef({ mq, choices, mActive });
  mRef.current = { mq, choices, mActive };
  useEffect(() => setMActive(0), [mq?.query, mq?.from]);
  const pickMention = (c: MentionCandidate) => {
    const cur = mRef.current.mq;
    if (!cur) return;
    handle.current?.insertMention({ from: cur.from, to: cur.to }, { id: c.id, title: c.title });
    mPointer.current = false;
  };
  const pickRef = useRef(pickMention);
  pickRef.current = pickMention;

  const cancelHide = () => clearTimeout(hideTimer.current);
  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setHover(null), 250);
  };
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  /** 打开链接：别的源的 http(s) 和别的 App 的链接（mailto / tel / codex:// …）走 openExternal（App 里交给系统，Web 端 http(s) 新标签页、别的协议就地交给浏览器）；同源的 #/ 路由就地跳。 */
  const openLink = (raw: string) => {
    const url = externalHref(raw, window.location.origin);
    if (url) return void openExternal(url).catch((err) => console.error('打开链接失败', err));
    if (raw.startsWith('#')) window.location.hash = raw;
  };

  /** 第几次开链接框；剪贴板读回来时对一下，免得填进后来开的框。 */
  const dialogSeq = useRef(0);
  /** 这次开框以后用户在框里打过字没有（打过就不拿剪贴板覆盖）。 */
  const dialogTyped = useRef(false);
  /** 剪贴板刚填进来的那一次（seq）：渲染完把焦点放进「链接」并全选。 */
  const clipFilled = useRef(0);
  const dialogRef = useRef<LinkDialog | null>(null);
  dialogRef.current = dialog;

  /** 开链接框：给了链接 = 改它；否则看选区（在链接里 = 改那条；选了字 = 预填文字；空光标 = 新加）。fromShortcut：⌘K 开的，新加时读剪贴板。 */
  const openLinkForm = (existing?: LinkRange, fromShortcut = false) => {
    const h = handle.current;
    if (!h) return;
    const sel = h.selection(); // 先把 DOM 上刚改的选区读进来
    const cur = existing ?? h.linkAtSelection();
    const range = cur ? { from: cur.from, to: cur.to } : sel;
    const st = h.view().state;
    let textLocked = false;
    try {
      textLocked = !st.doc.resolve(range.from).sameParent(st.doc.resolve(range.to));
    } catch {
      /* 范围过期了：当普通的 */
    }
    const text = h.textOf(range);
    // 选中的字本身像网址：顺手填进「链接」
    const href = cur?.href ?? (/^(https?:\/\/|www\.)\S+$/i.test(text.trim()) && normalizeHref(text) ? text.trim() : '');
    setHover(null);
    const coarse = typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
    const seq = ++dialogSeq.current;
    dialogTyped.current = false;
    setDialog({ range, existing: cur, text, href, textLocked, error: '', sheet: touch.current || coarse });
    if (!fromShortcut || cur || href) return;
    void readClipboardLink().then((link) => {
      if (!link) return;
      // 读得比框渲染出来还快（桌面 App）：等框出来再填，最多等十来帧
      const fill = (tries: number) => {
        if (seq !== dialogSeq.current || dialogTyped.current) return;
        const d = dialogRef.current;
        if (!d) return void (tries > 0 && setTimeout(() => fill(tries - 1), 16));
        if (d.href) return;
        clipFilled.current = seq;
        setDialog({ ...d, href: link, error: '' });
      };
      fill(10);
    });
  };
  const openRef = useRef(openLinkForm);
  openRef.current = openLinkForm;
  const initial = useRef(value);

  const optsRef = useRef<MdEditorOptions>(null as unknown as MdEditorOptions);
  optsRef.current = {
    value: initial.current,
    label,
    placeholder,
    readOnly,
    plainTitle,
    onChange: (md) => cb.current.onChange(md),
    onFocus: () => setFocused(true),
    onBlur: () => {
      // 点链接框里的输入框不算离开
      setTimeout(() => {
        if (linkingRef.current || mPointer.current || wrap.current?.contains(document.activeElement)) return;
        setFocused(false);
        setHelp(null);
        cb.current.onBlur?.();
      }, 0);
    },
    // 快捷键浮层开着：Esc 先关它，不收起编辑器 / 关详情
    onEscape: () => (helpRef.current ? setHelp(null) : cb.current.onEscape?.()),
    onHelpShortcut: () => toggleHelpRef.current(),
    onLinkShortcut: () => openRef.current(undefined, true),
    ...(onModEnter ? { onModEnter: () => cb.current.onModEnter?.() } : {}),
    onSelection: () => {
      const h = handle.current;
      if (!h) return;
      setSelLink(h.linkAtSelection());
    },
    onLinkHover: (r) => {
      if (touch.current) return; // 触屏的点按会先补一个 mouseover：不当悬停
      if (r) {
        cancelHide();
        setHover(r);
      } else scheduleHide();
    },
    onLinkOpen: (u) => openLink(u),
    onImageBlocked: () => ui?.toast({ message: tr('正文里不能放图片') }, 4000),
    ...(mention
      ? {
          mention: {
            onState: (st: MentionState | null) => setMq(st),
            onKey: (key: 'up' | 'down' | 'enter') => {
              const { choices: list, mActive: at } = mRef.current;
              if (key === 'enter') {
                const c = list[at];
                if (!c) return false;
                pickRef.current(c);
                return true;
              }
              if (list.length) setMActive((a) => (key === 'down' ? (a + 1) % list.length : (a - 1 + list.length) % list.length));
              return true;
            },
          },
        }
      : {}),
  };
  const ctl = useMemo(() => new MdController(() => optsRef.current), []);
  // 编辑器只建一次（官方 useEditor）；value 的变化走下面的 setMarkdown
  const editor = useEditor({ ...ctl.options(), immediatelyRender: true, shouldRerenderOnTransaction: false }, []);
  useEffect(() => {
    if (!editor) return;
    ctl.attach(editor);
    handle.current = ctl.handle();
    if (handleRef) handleRef.current = handle.current;
    // 自动聚焦等编辑器挂到页面上再做（这一刻 view 可能还没挂，直接 commands.focus 会抛「reading 'commands' of null」，2026-11-09）
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    const tryFocus = (left: number) => {
      focusTimer = undefined;
      try {
        if (editor.isDestroyed) return;
        if (editor.view.dom.isConnected) return void editor.commands.focus('end', { scrollIntoView: false });
      } catch {
        /* 还没挂上：下面再等等 */
      }
      if (left > 0) focusTimer = setTimeout(() => tryFocus(left - 1), 30);
    };
    if (autoFocus && !readOnly) focusTimer = setTimeout(() => tryFocus(10), 0);
    return () => {
      if (focusTimer) clearTimeout(focusTimer);
      handle.current = null;
      if (handleRef) handleRef.current = null;
    };
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editor && editor.isEditable === readOnly) editor.setEditable(!readOnly, false);
  }, [editor, readOnly]);

  // Tab 不冒泡到弹层的焦点圈（见 editor.ts stopTab）
  useEffect(() => (wrap.current ? stopTab(wrap.current) : undefined), []);

  useEffect(() => {
    handle.current?.setMarkdown(value);
  }, [value]);

  /** 关链接框。refocus：回到编辑器；点了编辑器外面就补上刚才压住的 onBlur。 */
  const closeDialog = (refocus = true) => {
    setDialog(null);
    setHover(null);
    if (refocus) return void handle.current?.focus();
    setTimeout(() => {
      if (wrap.current?.contains(document.activeElement)) return;
      setFocused(false);
      cb.current.onBlur?.();
    }, 0);
  };

  const saveLink = () => {
    const h = handle.current;
    const d = dialog;
    if (!h || !d) return;
    if (!d.href.trim()) return void (setDialog({ ...d, error: 'empty' }), hrefInput.current?.focus());
    if (!h.applyLink(d.range, d.textLocked ? h.textOf(d.range) : d.text, d.href)) {
      setDialog({ ...d, error: 'bad' });
      hrefInput.current?.focus();
      return;
    }
    closeDialog();
  };

  const removeLink = (range: LinkRange) => {
    const h = handle.current;
    if (!h) return;
    h.setLink(range, '');
    setHover(null);
    setDialog(null);
    h.focus();
  };

  // 链接框打开时把焦点放进去：选了字的新链接 / 文字改不了 → 「链接」；其余 → 「文字」。
  // 等这一下键盘事件（⌘K）走完再放，不然编辑器会把焦点拿回去。
  const dialogOpen = dialog != null;
  useEffect(() => {
    if (!dialog) return;
    const toHref = dialog.textLocked || (!!dialog.text && !dialog.existing);
    const id = requestAnimationFrame(() => (toHref ? hrefInput : textInput).current?.focus());
    return () => cancelAnimationFrame(id);
  }, [dialogOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // 剪贴板的链接填进来了：焦点在「链接」或还没进框 → 放进「链接」并全选；在「文字」（空光标新加）就不抢
  useLayoutEffect(() => {
    if (!dialog || clipFilled.current !== dialogSeq.current) return;
    clipFilled.current = 0;
    const el = hrefInput.current;
    if (!el || document.activeElement === textInput.current) return;
    el.focus();
    el.select();
  }, [dialog?.href]); // eslint-disable-line react-hooks/exhaustive-deps

  // 快捷键浮层：贴着光标（下面放不下就放上面），收在视口里；点别处收起
  const helpEl = useRef<HTMLDivElement>(null);
  const [helpPos, setHelpPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = helpEl.current;
    if (!help || !el) return setHelpPos(null);
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(8, Math.min(help.left - 12, vw - w - 8));
    let top = help.bottom + 6;
    if (top + hgt > vh - 8) top = help.top - 6 - hgt;
    setHelpPos({ left, top: Math.max(8, top) });
  }, [help]);
  useEffect(() => {
    if (!help) return;
    // 浮层只看不点（pointer-events: none，不挡下面的东西）：点哪儿都收起
    const down = () => setHelp(null);
    const away = () => setHelp(null);
    document.addEventListener('pointerdown', down, true);
    window.addEventListener('resize', away);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      window.removeEventListener('resize', away);
    };
  }, [help]);
  const mac = useMemo(() => isAppleKeyboard(), []);
  const helpPop =
    help &&
    createPortal(
      (() => {
        const t = shortcutTexts(mac);
        return (
          <div
            ref={helpEl}
            className="md-keys-pop"
            role="dialog"
            aria-label={t.title}
            style={helpPos ? { left: helpPos.left, top: helpPos.top } : { left: 0, top: 0, visibility: 'hidden' }}
          >
            <div className="md-keys-title">{t.title}</div>
            <table className="md-keys-table">
              <tbody>
                {shortcutRows().map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    <td className="md-keys-md">{r.md && <code>{r.md}</code>}</td>
                    <td className="md-keys-keys">
                      {r.keys.map((c, i) => (
                        <kbd key={i} className="kbd">
                          {formatChord(c, mac)}
                        </kbd>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {plainTitle && <p className="md-keys-note">{t.title1}</p>}
            <p className="md-keys-note">{t.combo}</p>
            <p className="md-keys-note">{t.clipLink}</p>
            {mention && <p className="md-keys-note">{t.mention}</p>}
            <p className="md-keys-note">{t.close}</p>
          </div>
        );
      })(),
      document.body,
    );

  // 底部面板：键盘弹起时（visualViewport 变矮）把面板抬到键盘上面
  const [kbInset, setKbInset] = useState(0);
  const sheetOpen = !!dialog?.sheet;
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!sheetOpen || !vv) return setKbInset(0);
    const sync = () => setKbInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, [sheetOpen]);

  // 链接框开着：点框外面 = 取消（点在编辑器里就留在编辑器，点在外面就算离开编辑器）
  useEffect(() => {
    if (!dialog) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t || popEl.current?.contains(t)) return;
      closeDialog(false);
    };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [dialogOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 框里的 Tab / Shift+Tab 只在两栏和按钮之间转，不让焦点跑出去（外面的弹层焦点圈也收不到）。 */
  const trapTab = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeDialog();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled])'));
    if (!items.length) return;
    e.preventDefault();
    e.stopPropagation();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : at < 0 || at === items.length - 1 ? 0 : at + 1;
    items[next]!.focus();
  };
  const enterSaves = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); // 不走表单的隐式提交：输入法选字的回车也会触发它
    if (!composing(e)) saveLink();
  };

  // 浮层：链接框 > 鼠标指着的 > 光标所在的（编辑器有焦点时）
  const anchor = dialog?.range ?? hover ?? (focused ? selLink : null);
  const pop = dialog ? null : (hover ?? (focused ? selLink : null));
  useLayoutEffect(() => {
    if (!anchor || !wrap.current || !handle.current) return setPopPos(null);
    const c = handle.current.coordsOf(anchor);
    const box = wrap.current.getBoundingClientRect();
    if (!c) return setPopPos(null);
    // 先不可见地排一次量宽度，再贴着编辑器右边收进来（手机上别撑出横向滚动）
    const w = Math.min(popEl.current?.offsetWidth ?? 240, box.width);
    const left = Math.max(0, Math.min(c.left - box.left, box.width - w));
    setPopPos({ left, top: c.bottom - box.top + 4 });
  }, [anchor?.from, anchor?.to, pop?.href, dialog != null]); // eslint-disable-line react-hooks/exhaustive-deps

  const linkForm = dialog && (
    <form
      className="md-link-dialog"
      role="dialog"
      aria-label={dialog.existing ? tr('编辑链接') : tr('添加链接')}
      onKeyDown={trapTab}
      onSubmit={(e) => {
        e.preventDefault();
        saveLink();
      }}
    >
      <TextField
        className="md-link-row"
        value={dialog.text}
        onChange={(v) => ((dialogTyped.current = true), setDialog({ ...dialog, text: v }))}
        isDisabled={dialog.textLocked}
      >
        <Label className="md-link-label">{tr('文字')}</Label>
        <Input ref={textInput} className="input md-link-input" placeholder={tr('不填就用网址')} onFocus={(e) => e.currentTarget.select()} onKeyDown={enterSaves} />
      </TextField>
      <TextField
        className="md-link-row"
        value={dialog.href}
        onChange={(v) => ((dialogTyped.current = true), setDialog({ ...dialog, href: v, error: '' }))}
        isInvalid={!!dialog.error}
      >
        <Label className="md-link-label">{tr('链接')}</Label>
        <Input
          ref={hrefInput}
          className="input md-link-input"
          placeholder="https://"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={enterSaves}
          aria-describedby={dialog.error ? 'md-link-err' : undefined}
        />
      </TextField>
      {dialog.error && (
        <div id="md-link-err" className="md-link-error" role="alert">
          {dialog.error === 'empty' ? tr('填一个网址') : tr('这不像网址，检查一下')}
        </div>
      )}
      <div className="md-link-actions">
        {dialog.existing && (
          <RacButton className="btn btn-quiet btn-sm md-link-remove" onPress={() => removeLink(dialog.existing!)}>
            {tr('去掉链接')}
          </RacButton>
        )}
        <RacButton className="btn btn-quiet btn-sm" onPress={() => closeDialog()}>
          {tr('取消')}
        </RacButton>
        <RacButton type="submit" className="btn btn-primary btn-sm">
          {dialog.existing ? tr('保存') : tr('添加')}
        </RacButton>
      </div>
    </form>
  );

  // @ 浮层：贴在光标那一行下面、和 @ 对齐（下面放不下就放上面，手机按键盘上沿算），收在视口里（mention-place.ts）。
  // 2026-11-12 Rei 截图浮层跳到窗口左上角，原因有三，都在这里管：
  // ① 量位置时把浮层 left / top 临时设成 0 没改回去，算出的位置和上次一样时 React 不重画，浮层就停在 0,0（打 @ 后再打字必现）；
  // ② 看板详情浮层换行后有居中平移动画，外层 transform 一变 fixed 的参照就变，浮层错开——开着时每帧对一下，错了重放；
  // ③ 输入法上屏、节点刚换掉时 coordsOf 可能量不到（给 null）：留在上一次的位置，下一帧再量。
  const mPopEl = useRef<HTMLDivElement>(null);
  const [mPos, setMPos] = useState<{ left: number; top: number } | null>(null);
  const mLast = useRef<Coords | null>(null);
  const mWant = useRef<{ left: number; top: number } | null>(null);
  const mRetry = useRef(0);
  const [mTick, setMTick] = useState(0);
  const mOpen = !!(mq && mention && focused && !readOnly);
  useLayoutEffect(() => {
    const el = mPopEl.current;
    const h = handle.current;
    if (!mOpen || !el || !h || !mq) {
      mLast.current = null;
      mWant.current = null;
      mRetry.current = 0;
      return setMPos(null);
    }
    let c = mentionAnchor(h.coordsOf({ from: mq.from, to: mq.from }, 1), h.coordsOf({ from: mq.to, to: mq.to }, -1));
    let raf = 0;
    if (c) {
      mLast.current = c;
      mRetry.current = 0;
    } else if (mRetry.current < 30) {
      // 没量到：先用上一次的位置，下一帧再量（最多 30 帧）
      mRetry.current += 1;
      raf = requestAnimationFrame(() => setMTick((n) => n + 1));
      c = mLast.current;
    } else {
      // 一直量不到（极少）：贴编辑器左上，总比窗口左上角强
      const b = wrap.current?.getBoundingClientRect();
      c = mLast.current ?? (b && b.width > 0 ? { left: b.left + 8, top: b.top, bottom: b.top + 24 } : null);
    }
    const cancel = () => cancelAnimationFrame(raf);
    if (!c) return cancel;
    const vv = window.visualViewport;
    const vTop = vv ? vv.offsetTop : 0;
    const vBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const p = placeMentionPop(c, { width: el.offsetWidth, height: el.offsetHeight }, { top: vTop, bottom: vBottom, width: window.innerWidth });
    mWant.current = p;
    // 浮层放在编辑器里面（不放 body：弹层 / 新建面板会把点在外面的当成「点了外面」关掉自己），position: fixed。
    // 外面哪层有 transform 时 fixed 是相对那一层的：先放到 0,0 量出那一层的原点，再减掉。
    // 量完要把 left / top 改回去：算出来和上次一样时 React 不重画，不改回去浮层就停在 0,0（就是 Rei 截图里的左上角）。
    const prevL = el.style.left;
    const prevT = el.style.top;
    el.style.left = '0px';
    el.style.top = '0px';
    const o = el.getBoundingClientRect();
    el.style.left = prevL;
    el.style.top = prevT;
    const next = { left: p.left - o.left, top: p.top - o.top };
    if (!mPos || Math.abs(mPos.left - next.left) > 0.5 || Math.abs(mPos.top - next.top) > 0.5) setMPos(next);
    return cancel;
  }, [mOpen, mq?.from, mq?.to, choices.length, mTick]); // eslint-disable-line react-hooks/exhaustive-deps
  // 浮层开着时：外层的 transform 变了（看板详情浮层换行后居中平移的动画）、滚动、窗口 / 键盘变化，浮层就不在算好的位置了，重放一次
  useEffect(() => {
    if (!mOpen) return;
    let id = 0;
    let off = 0; // 连着几帧没对上（外层一直在缩放之类，放不准）：超过 120 帧就不再追
    const loop = () => {
      const el = mPopEl.current;
      const w = mWant.current;
      if (el && w) {
        const r = el.getBoundingClientRect();
        if (Math.abs(r.left - w.left) > 1 || Math.abs(r.top - w.top) > 1) {
          if (++off <= 120) setMTick((n) => n + 1);
        } else off = 0;
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    const again = () => setMTick((n) => n + 1);
    const vv = window.visualViewport;
    window.addEventListener('scroll', again, true);
    window.addEventListener('resize', again);
    vv?.addEventListener('resize', again);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('scroll', again, true);
      window.removeEventListener('resize', again);
      vv?.removeEventListener('resize', again);
    };
  }, [mOpen]);
  // 选中的那条滚进来
  useEffect(() => {
    mPopEl.current?.querySelector('.mention-item.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [mActive, mOpen]);
  const mUid = useId();
  // 读屏：编辑器指向浮层和选中的那条
  useEffect(() => {
    if (!mention) return;
    // 编辑器的 view 可能还没挂上（第一次渲染）：取不到就算了，开浮层时会再来
    let dom: HTMLElement | null = null;
    try {
      dom = handle.current?.view().dom ?? null;
    } catch {
      dom = null;
    }
    if (!dom) return;
    if (mOpen && choices.length) {
      dom.setAttribute('aria-controls', `${mUid}-list`);
      dom.setAttribute('aria-activedescendant', `${mUid}-opt-${mActive}`);
    } else {
      dom.removeAttribute('aria-controls');
      dom.removeAttribute('aria-activedescendant');
    }
  }, [mOpen, mActive, choices.length, mUid]);
  const mentionPop = mOpen && (
      <div
        ref={mPopEl}
        id={`${mUid}-list`}
        className="mention-pop"
        role="listbox"
        aria-label={tr('提到一件任务')}
        style={mPos ? { left: mPos.left, top: mPos.top } : { left: 0, top: 0, visibility: 'hidden' }}
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={() => (mPointer.current = true)}
        onPointerUp={() => setTimeout(() => (mPointer.current = false), 400)}
        onPointerCancel={() => (mPointer.current = false)}
      >
        {choices.length ? (
          choices.map((c, i) => {
            const meta = c.ended ? tr('已结束') : c.kind === 'countdown' ? mentionInfo(c.id, '').suffix || tr('倒数日') : '';
            const Icon = c.kind === 'countdown' ? Hourglass : c.ended ? CircleCheck : Circle;
            return (
              <div
                key={c.id}
                id={`${mUid}-opt-${i}`}
                role="option"
                aria-selected={i === mActive}
                className={`mention-item${i === mActive ? ' is-active' : ''}${c.ended ? ' is-ended' : ''}${c.kind === 'countdown' ? ' is-countdown' : ''}`}
                onMouseMove={() => i !== mActive && setMActive(i)}
                onClick={() => pickMention(c)}
              >
                <Icon size={14} aria-hidden className="mention-item-icon" />
                <span className="grow ellipsis">{c.title}</span>
                {meta && <span className="mention-item-meta">{meta}</span>}
              </div>
            );
          })
        ) : (
          <div className="mention-empty">{tr('没有找到')}</div>
        )}
      </div>
  );

  return (
    <div
      ref={wrap}
      className={`md-editor${!readOnly && (focused || dialog) ? ' is-focused' : ''}${className ? ` ${className}` : ''}`}
      onPointerDownCapture={(e) => (touch.current = e.pointerType === 'touch' || e.pointerType === 'pen')}
      onPointerMoveCapture={(e) => e.pointerType === 'mouse' && (touch.current = false)}
    >
      <EditorContent editor={editor} className="md-editor-root" />
      {helpPop}
      {mentionPop}
      {(pop || (dialog && !dialog.sheet)) && (
        <div
          ref={popEl}
          className={`md-link-pop${dialog ? ' is-editing' : ''}`}
          style={popPos ? { left: popPos.left, top: popPos.top } : { left: 0, top: 0, visibility: 'hidden' }}
          onMouseEnter={cancelHide}
          onMouseLeave={() => !dialog && hover && scheduleHide()}
          onMouseDown={(e) => !(e.target as HTMLElement).closest('input') && e.preventDefault()}
        >
          {dialog && !dialog.sheet ? (
            linkForm
          ) : pop ? (
            <>
              {/* 不显示网址（Rei 2026-11-03「链接的popover中不显示链接，只显示访问、编辑、去掉链接」），网址放悬停提示里。
                  RAC 的 Button 不往下传 title，提示挂在外面一层（display: contents，不占位） */}
              <span className="md-link-pop-open-tip" title={pop.href}>
                <RacButton
                  className="btn btn-quiet btn-sm md-link-pop-open"
                  aria-label={`${tr('访问')} ${pop.href}`}
                  onPress={() => openLink(pop.href)}
                >
                  <ExternalLink size={14} aria-hidden />
                  {tr('访问')}
                </RacButton>
              </span>
              <RacButton className="btn btn-quiet btn-sm" onPress={() => openLinkForm(pop)}>
                {tr('编辑')}
              </RacButton>
              <RacButton className="btn btn-quiet btn-sm" onPress={() => removeLink(pop)}>
                {tr('去掉链接')}
              </RacButton>
            </>
          ) : null}
        </div>
      )}
      {dialog?.sheet && (
        <>
          <div className="md-link-sheet-backdrop" aria-hidden />
          <div
            ref={popEl}
            className="md-link-sheet"
            style={kbInset ? { bottom: kbInset, paddingBottom: 12 } : undefined}
            onMouseDown={(e) => !(e.target as HTMLElement).closest('input') && e.preventDefault()}
          >
            <div className="md-link-sheet-title" aria-hidden>
              {dialog.existing ? tr('编辑链接') : tr('添加链接')}
            </div>
            {linkForm}
          </div>
        </>
      )}
    </div>
  );
}

export default MdEditor;
