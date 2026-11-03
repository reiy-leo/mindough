/**
 * markdown 摊成纯文字时的「字面量」：反斜杠转义和行内代码（Rei 2026-11-03「任务列表中，.会显示成\.」）。
 *
 * 标题、搜索、片段、日记预览都是拿正则去掉 markdown 记号。去之前先把这两样换成占位符，去完再换回来：
 * - 反斜杠转义（CommonMark：\ 后面跟 ASCII 标点）：`draw\.io` → `draw.io`，`\\` → `\`，`\*` → `*`。
 *   换成占位符后，`1\. 不是列表`、`\# 不是标题`、`\<u>` 这类本来就是字面量的，也不会被当成记号去掉。
 * - 行内代码（成对的反引号）：里面原样保留（`a\.b` 还是 a\.b，`a_b` 不去下划线），反引号本身去掉。
 */

/** CommonMark 里能被反斜杠转义的 ASCII 标点。 */
const ESCAPABLE = '!"#$%&\'()*+,\\-./:;<=>?@[\\\\\\]^_`{|}~';
/** 一个转义，或一段行内代码（开头的反引号串和结尾的一样长，前后都不挨着别的反引号）。 */
const LITERAL_RE = new RegExp(`\\\\([${ESCAPABLE}])|(?<!\`)(\`+)(?!\`)([\\s\\S]*?)(?<!\`)\\2(?!\`)`, 'g');

/** 占位符用私用区字符（U+E000 起），正文里不会有，去记号的正则也碰不到它。 */
const PUA = 0xe000;
const PUA_MAX = 0xf8ff;
const PUA_RE = /[\ue000-\uf8ff]/;
const PUA_ALL = /[\ue000-\uf8ff]/g;

/** 先把转义和行内代码换成占位符，交给 strip 去记号，再换回原字。 */
export function stripWithLiterals(md: string, strip: (s: string) => string): string {
  // 正文里本来就有私用区字符（少见）：不用占位符，去完记号再去转义
  if (PUA_RE.test(md)) return unescapeMarkdown(strip(md));
  const keep: string[] = [];
  const masked = md.replace(LITERAL_RE, (whole, esc: string | undefined, _fence: string | undefined, code: string | undefined) => {
    if (keep.length > PUA_MAX - PUA) return whole;
    let text: string;
    if (esc !== undefined) text = esc;
    else {
      // 行内代码：换行算空格；两头都有空格（且不全是空格）时各去一个（CommonMark）
      text = (code ?? '').replace(/\r?\n/g, ' ');
      if (/^ [\s\S]*[^ ][\s\S]* $/.test(text)) text = text.slice(1, -1);
    }
    keep.push(text);
    return String.fromCharCode(PUA + keep.length - 1);
  });
  if (!keep.length) return strip(md);
  return strip(masked).replace(PUA_ALL, (c) => keep[c.charCodeAt(0) - PUA] ?? c);
}

/** 只去反斜杠转义（行内代码里的不动，反引号保留）。 */
export function unescapeMarkdown(md: string): string {
  return md.replace(LITERAL_RE, (whole, esc: string | undefined) => (esc !== undefined ? esc : whole));
}

/**
 * 下划线的标签（编辑器存成 `<u>…</u>`、`<u class="wavy">`、`<u class="double">`，Rei 2026-11-03）。
 * 标题、搜索、片段里去掉，不留空格（「这是<u>重点</u>」搜「这是重点」也对得上）。
 */
export const UNDERLINE_TAG_RE = /<\/?u(?:\s+class=(["'])(?:wavy|double)\1)?\s*>/gi;
export const stripUnderlineTags = (s: string) => s.replace(UNDERLINE_TAG_RE, '');
