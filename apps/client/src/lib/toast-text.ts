/**
 * toast 里嵌的名字截短（Rei 2026-11-13 06:16「toast通知：任务名称最多显示20个字符，多个部分显示"..."」）。
 * 任务名、项目名、打卡名、类型 / 资料 / 人物 / 附件名插进提示文案前都过一遍 clipName：
 * 超过 20 个字就留前 20 个，后面接「...」。
 *
 * 按「字」数，不按 UTF-16 码元：用 Intl.Segmenter 按字素切，emoji（含肤色、ZWJ 组合、国旗）、带附加符号的字母都算一个，
 * 不会切成半个；没有 Intl.Segmenter 的老环境退回 Array.from 按码点切（组合 emoji 可能拆开，但不会出现孤立的代理项）。
 */

export const TOAST_NAME_MAX = 20;
export const TOAST_ELLIPSIS = '...';

type Seg = { segment(input: string): Iterable<{ segment: string }> };

let segmenter: Seg | null | undefined;
function graphemeSegmenter(): Seg | null {
  if (segmenter !== undefined) return segmenter;
  const S = (Intl as unknown as { Segmenter?: new (locale?: string, opts?: { granularity: 'grapheme' }) => Seg }).Segmenter;
  segmenter = S ? new S(undefined, { granularity: 'grapheme' }) : null;
  return segmenter;
}

/** 把字符串切成一个个「字」（字素）；没有 Intl.Segmenter 时按码点。 */
export function graphemes(s: string, seg: Seg | null = graphemeSegmenter()): string[] {
  if (!seg) return Array.from(s);
  const out: string[] = [];
  for (const g of seg.segment(s)) out.push(g.segment);
  return out;
}

/** 名字超过 max 个字就截成前 max 个 +「...」；首尾空白先去掉。空值返回空串。 */
export function clipName(name: string | null | undefined, max: number = TOAST_NAME_MAX, seg?: Seg | null): string {
  const s = (name ?? '').trim();
  // 码元数不超过上限时字数一定也不超过，省掉切分
  if (s.length <= max) return s;
  const gs = seg === undefined ? graphemes(s) : graphemes(s, seg);
  if (gs.length <= max) return s;
  return gs.slice(0, max).join('').trimEnd() + TOAST_ELLIPSIS;
}
