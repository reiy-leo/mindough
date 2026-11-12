/**
 * toast 里的名字截短（Rei 2026-11-13 06:16「任务名称最多显示20个字符，多个部分显示"..."」）。
 */
import { describe, expect, it } from 'vitest';
import { clipName, graphemes, TOAST_ELLIPSIS, TOAST_NAME_MAX } from './toast-text';

describe('clipName', () => {
  it('20 个字以内原样', () => {
    expect(TOAST_NAME_MAX).toBe(20);
    expect(clipName('写周报')).toBe('写周报');
    expect(clipName('一二三四五六七八九十一二三四五六七八九十')).toBe('一二三四五六七八九十一二三四五六七八九十');
    expect(clipName('abcdefghijklmnopqrst')).toBe('abcdefghijklmnopqrst');
  });

  it('超过 20 个字留前 20 个，后面接 ...', () => {
    expect(TOAST_ELLIPSIS).toBe('...');
    expect(clipName('一二三四五六七八九十一二三四五六七八九十多')).toBe('一二三四五六七八九十一二三四五六七八九十...');
    expect(clipName('Finish the quarterly report for the team')).toBe('Finish the quarterly...');
  });

  it('首尾空白先去掉，空值返回空串', () => {
    expect(clipName('  写周报  ')).toBe('写周报');
    expect(clipName(null)).toBe('');
    expect(clipName(undefined)).toBe('');
  });

  it('截断处是空格时不留空格', () => {
    expect(clipName('aaaaaaaaaaaaaaaaaaa bbbb')).toBe('aaaaaaaaaaaaaaaaaaa...');
  });

  it('按字素数：组合 emoji、国旗、肤色、带附加符号的字母都算一个，不切坏', () => {
    const family = '👨‍👩‍👧‍👦';
    const flag = '🇨🇳';
    const thumb = '👍🏽';
    const e = 'e\u0301';
    expect(graphemes(family + flag + thumb + e)).toEqual([family, flag, thumb, e]);
    // 20 个全家福 emoji：码元远超 20，字素正好 20，不截
    expect(clipName(family.repeat(20))).toBe(family.repeat(20));
    // 21 个：截成 20 个 + ...，每个都完整
    expect(clipName(family.repeat(21))).toBe(family.repeat(20) + '...');
    expect(clipName('打卡' + flag.repeat(19) + thumb)).toBe('打卡' + flag.repeat(18) + '...');
  });

  it('没有 Intl.Segmenter 时按码点切，不留孤立的代理项', () => {
    const s = '😀'.repeat(25);
    const out = clipName(s, 20, null);
    expect(out).toBe('😀'.repeat(20) + '...');
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out)).toBe(false);
  });

  it('可以给别的上限', () => {
    expect(clipName('abcdef', 3)).toBe('abc...');
  });
});
