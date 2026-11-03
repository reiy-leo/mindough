/**
 * 挑任务时的搜索（Rei 2026-11-02「做完后解锁和先做的搜索搜不到任务标题」）：
 * 任务没有单独的标题字段，标题 = taskTitle（主字段，或正文第一行去掉 markdown 标记），和列表行、⌘K 用的是同一个。
 * 搜标题 + 正文（去掉 markdown 标记），不分大小写；搜索词全是字母时也认中文标题的拼音首字母（ds → 读书）和全拼（dushu）。
 * 几个词用空格隔开时每个词都要对上（顺序不限）；标题、正文里的空格不算（「交 房租」搜「交房租」）。
 */
import { categoryMatches } from './category-prefs';
import { stripUnderlineTags, stripWithLiterals } from './preview';

const norm = (s: string) => s.normalize('NFKC').toLowerCase();

/** markdown 的正文摊成一行纯文字：去掉行首的 # > - [ ] 1. 、粗体斜体代码符号、图片、反斜杠转义，链接只留文字，HTML 标签去掉。 */
export function plainMarkdown(md: string): string {
  // 下划线标签先去掉、不留空格（别的 HTML 标签换成空格）
  // 反斜杠转义（draw\.io）和行内代码先保护起来，去完记号再换回原字（md-text.ts）
  return stripWithLiterals(md, (s) =>
    stripUnderlineTags(s)
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/(^|\n)\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/g, '$1')
      .replace(/[*_`~]/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function terms(query: string): string[] {
  return norm(query).split(/\s+/).filter(Boolean);
}

/** 标题、正文对不对得上搜索词。空搜索词算对上。 */
export function taskTextMatches(title: string, bodyMd: string, query: string): boolean {
  const ts = terms(query);
  if (!ts.length) return true;
  const hay = norm(`${title} ${plainMarkdown(bodyMd)}`);
  // 中文里空格常是排版（「交 房租」），去掉空格再比一次
  const tight = hay.replace(/\s+/g, '');
  return ts.every((t) => hay.includes(t) || tight.includes(t) || categoryMatches([title], t));
}

/** 排序分：标题以搜索词开头 0，标题包含 1，拼音对上 2，只在正文里 3。 */
export function taskMatchRank(title: string, query: string): number {
  const ts = terms(query);
  if (!ts.length) return 0;
  const low = norm(title);
  if (low.startsWith(ts[0]!)) return 0;
  if (ts.every((t) => low.includes(t))) return 1;
  if (ts.every((t) => low.includes(t) || categoryMatches([title], t))) return 2;
  return 3;
}
