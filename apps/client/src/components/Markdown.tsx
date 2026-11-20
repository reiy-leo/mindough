import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { renderMarkdown } from '../lib/markdown';
import { katexReady, loadKatex, mayHaveMath } from '../lib/math';

import { tr } from '../lib/i18n';
import { scrollIntoContainer } from '../lib/root-scroll';
import { openMention, paintMention, useMentionVersion } from '../lib/task-mention';
import { paintDateMention, useDateMentionVersion } from '../lib/date-mention';
/**
 * 只读的 Markdown。有公式（$…$）时按需加载 KaTeX（本地打包），加载好之前公式先显示源码。
 * 脚注的跳转（#md-fn-…）在这一块里面滚过去，不改地址栏（地址栏的 # 是路由）。
 * @ 提及（Rei 2026-11-10）：渲染成胶囊，按 id 显示任务现在的标题，任务变了跟着重画；点了就地打开详情，不跳页。
 * @ 插进去的日期（Rei 2026-11-20）：日期胶囊，跟着设置显示绝对 / 相对，点了不做事。
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const needsMath = mayHaveMath(source);
  const [mathReady, setMathReady] = useState(katexReady);
  useEffect(() => {
    if (!needsMath || mathReady) return;
    let live = true;
    void loadKatex()
      .then(() => live && setMathReady(true))
      .catch((err) => console.error('加载公式渲染失败', err));
    return () => {
      live = false;
    };
  }, [needsMath, mathReady]);
  const html = useMemo(() => renderMarkdown(source), [source, mathReady && needsMath]); // eslint-disable-line react-hooks/exhaustive-deps
  const box = useRef<HTMLDivElement>(null);
  const mentionVersion = useMentionVersion();
  useLayoutEffect(() => {
    box.current?.querySelectorAll<HTMLElement>('a[data-task-mention]').forEach((a) => {
      a.dataset.label ??= a.textContent ?? '';
      paintMention(a, a.dataset.taskMention ?? '', a.dataset.label);
    });
  }, [html, mentionVersion]);
  // @ 插进去的日期胶囊（Rei 2026-11-20）：设置改了、跨天了跟着重画
  const dateVersion = useDateMentionVersion();
  useLayoutEffect(() => {
    box.current?.querySelectorAll<HTMLElement>('span[data-date-mention]').forEach((el) => {
      paintDateMention(el, Number(el.dataset.dateMention) || 0, el.dataset.label ?? '');
    });
  }, [html, dateVersion]);
  if (!source.trim()) return <div className={`md md-empty ${className ?? ''}`}>{tr('（还没有内容）')}</div>;
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const m = (e.target as HTMLElement).closest?.('a[data-task-mention]') as HTMLElement | null;
    if (m) {
      e.preventDefault();
      e.stopPropagation();
      return openMention(m.dataset.taskMention ?? '');
    }
    const a = (e.target as HTMLElement).closest?.('a[href^="#md-fn-"]');
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    const id = a.getAttribute('href')!.slice(1);
    const target = e.currentTarget.querySelector(`[id="${CSS.escape(id)}"]`);
    if (target) scrollIntoContainer(target, { block: 'center', behavior: 'smooth' });
  };
  return <div ref={box} className={`md ${className ?? ''}`} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** 写法提示（放在悬停提示里，不写在输入框下面）。函数：换语言后重新取文字。 */
export const markdownHelp = () => (
  <span className="md-help">
    {tr('直接这样写，会自动排好版：')}<br />
    <code>{tr('# 标题')}</code> <code>{tr('- [ ] 清单')}</code> <code>{tr('**粗体**')}</code>
  </span>
);
