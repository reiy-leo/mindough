/**
 * 心情图标（Rei 2026-10-17：「5个太少了，可以生成一组动画svg图标么，点击时显示动画」）。
 *
 * 31 个手写 SVG（2026-10-17 的 12 个，2026-11-16 Rei 又加了 19 个），风格统一：32×32，一张圆脸（填心情色的淡色）+ 线条五官（currentColor，2px 圆头），
 * 有的带一个小配件（星光、心、z、汗滴、泪滴、怒气、墨镜、派对帽、问号、省略号、体温计……）。颜色 = 皮肤令牌 --mood-<id>（三套 × 明暗，见 skin/tokens.css），
 * 由外层 .mood-icon 的 color 给，所以三皮肤、深浅色自动跟着变。
 *
 * 动画：playing 时外层加 .is-playing，各部分（.mi-face / .mi-eyes / .mi-extra …）按心情播一段 0.7s 左右的 keyframes
 * （styles/journal.css）；prefers-reduced-motion 时不播。每次点选换一个 key 重新播。
 */
import type { ReactNode } from 'react';
import { isMoodId, type MoodId } from '@mindough/core';

const eye = (cx: number, cy = 13.5) => <circle cx={cx} cy={cy} r={1.7} className="mi-fill" />;
const dotEyes = (
  <g className="mi-eyes">
    {eye(11.5)}
    {eye(20.5)}
  </g>
);

/** 小心形（以中心点和缩放给）。形状同「感恩」那颗：凹口在上、尖在下。 */
const heart = (cx: number, cy: number, k: number) => {
  const x = (d: number) => +(cx + d * k).toFixed(2);
  const y = (d: number) => +(cy - 2.1 * k + d * k).toFixed(2);
  return `M${x(0)} ${y(5.5)} C${x(-3.9)} ${y(2.9)} ${x(-3.9)} ${y(-0.3)} ${x(-1.9)} ${y(-1)} C${x(-0.9)} ${y(-1.3)} ${x(-0.2)} ${y(-0.7)} ${x(0)} ${y(0)} C${x(0.2)} ${y(-0.7)} ${x(0.9)} ${y(-1.3)} ${x(1.9)} ${y(-1)} C${x(3.9)} ${y(-0.3)} ${x(3.9)} ${y(2.9)} ${x(0)} ${y(5.5)} Z`;
};
/** 空心大眼 + 实心瞳孔（期待、感动、尴尬、害怕、委屈、崩溃用），dy 让瞳孔往上 / 下看。 */
const ringEye = (cx: number, cy: number, r: number, pr: number, dy = 0) => (
  <>
    <circle cx={cx} cy={cy} r={r} className="mi-thin" />
    <circle cx={cx} cy={cy + dy} r={pr} className="mi-fill" />
  </>
);

/** 每个心情的五官和配件。 */
const PARTS: Record<MoodId, ReactNode> = {
  happy: (
    <>
      {dotEyes}
      <path className="mi-mouth" d="M10.5 18.5 Q16 24.5 21.5 18.5" />
    </>
  ),
  excited: (
    <>
      <g className="mi-eyes">
        <path className="mi-fill mi-star" d="M11.5 10.6 L12.3 12.7 L14.4 13.5 L12.3 14.3 L11.5 16.4 L10.7 14.3 L8.6 13.5 L10.7 12.7 Z" />
        <path className="mi-fill mi-star" d="M20.5 10.6 L21.3 12.7 L23.4 13.5 L21.3 14.3 L20.5 16.4 L19.7 14.3 L17.6 13.5 L19.7 12.7 Z" />
      </g>
      <path className="mi-mouth mi-fill" d="M10.5 18 H21.5 Q21.5 24.5 16 24.5 Q10.5 24.5 10.5 18 Z" />
      <g className="mi-extra mi-sparkle">
        <path className="mi-fill" d="M27 3.5 L27.6 5.4 L29.5 6 L27.6 6.6 L27 8.5 L26.4 6.6 L24.5 6 L26.4 5.4 Z" />
        <circle className="mi-fill" cx="4.5" cy="6.5" r="1.1" />
      </g>
    </>
  ),
  grateful: (
    <>
      <g className="mi-eyes">
        <path d="M9.5 14 Q11.5 11.5 13.5 14" />
        <path d="M18.5 14 Q20.5 11.5 22.5 14" />
      </g>
      <path className="mi-mouth" d="M11.5 19 Q16 23 20.5 19" />
      <path className="mi-extra mi-heart mi-fill" d="M25.5 27.8 C21.6 25.2 21.6 22 23.6 21.3 C24.6 21 25.3 21.6 25.5 22.3 C25.7 21.6 26.4 21 27.4 21.3 C29.4 22 29.4 25.2 25.5 27.8 Z" />
    </>
  ),
  content: (
    <>
      <g className="mi-eyes">
        <path d="M9.5 13 Q11.5 15.5 13.5 13" />
        <path d="M18.5 13 Q20.5 15.5 22.5 13" />
      </g>
      <g className="mi-blush">
        <ellipse className="mi-fill mi-soft" cx="9.5" cy="18" rx="2" ry="1.3" />
        <ellipse className="mi-fill mi-soft" cx="22.5" cy="18" rx="2" ry="1.3" />
      </g>
      <path className="mi-mouth" d="M12.5 19.5 Q16 22.5 19.5 19.5" />
    </>
  ),
  calm: (
    <>
      <g className="mi-eyes">
        <path d="M9.5 14 Q11.5 15.6 13.5 14" />
        <path d="M18.5 14 Q20.5 15.6 22.5 14" />
      </g>
      <path className="mi-mouth" d="M13 20.5 Q16 21.8 19 20.5" />
    </>
  ),
  okay: (
    <>
      {dotEyes}
      <path className="mi-mouth" d="M12 20.5 H20" />
    </>
  ),
  bored: (
    <>
      <g className="mi-eyes">
        <path d="M9.5 13 H13.5" />
        <path d="M18.5 13 H22.5" />
        <path className="mi-fill" d="M10 13.6 H13 A1.5 1.5 0 0 1 10 13.6 Z" />
        <path className="mi-fill" d="M19 13.6 H22 A1.5 1.5 0 0 1 19 13.6 Z" />
      </g>
      <path className="mi-mouth" d="M12.5 21 L19.5 19.6" />
    </>
  ),
  tired: (
    <>
      <g className="mi-eyes">
        <path d="M9.5 14.5 Q11.5 13 13.5 14.5" />
        <path d="M18.5 14.5 Q20.5 13 22.5 14.5" />
        <path className="mi-soft-line" d="M10 17 Q11.5 17.8 13 17" />
        <path className="mi-soft-line" d="M19 17 Q20.5 17.8 22 17" />
      </g>
      <ellipse className="mi-mouth" cx="16" cy="21.5" rx="1.8" ry="1.4" />
      <g className="mi-extra mi-zzz">
        <path className="mi-z1" d="M23.5 4.5 H27 L23.5 8 H27" />
        <path className="mi-z2 mi-thin" d="M28 1.5 H30 L28 3.5 H30" />
      </g>
    </>
  ),
  anxious: (
    <>
      <g className="mi-brows">
        <path d="M9.5 10.5 L13.5 9.2" />
        <path d="M22.5 10.5 L18.5 9.2" />
      </g>
      <g className="mi-eyes">
        {eye(11.5, 14)}
        {eye(20.5, 14)}
      </g>
      <path className="mi-mouth" d="M11.5 19.5 H20.5 V22.5 H11.5 Z M11.5 21 H20.5" />
      <path className="mi-extra mi-drop mi-fill" d="M26.5 6 Q24.3 9.6 24.3 10.8 A2.2 2.2 0 0 0 28.7 10.8 Q28.7 9.6 26.5 6 Z" />
    </>
  ),
  sad: (
    <>
      {dotEyes}
      <path className="mi-mouth" d="M11 22 Q16 17.5 21 22" />
      <path className="mi-extra mi-tear mi-fill" d="M10.5 16.5 Q9 19 9 19.8 A1.5 1.5 0 0 0 12 19.8 Q12 19 10.5 16.5 Z" />
    </>
  ),
  irritated: (
    <>
      <g className="mi-brows">
        <path d="M9.5 10 L13.5 11.5" />
        <path d="M22.5 10 L18.5 11.5" />
      </g>
      <g className="mi-eyes">
        <path d="M10 14.5 H13" />
        <path d="M19 14.5 H22" />
      </g>
      <path className="mi-mouth" d="M10.5 21 Q12.3 19.2 14.2 21 Q16 22.8 17.8 21 Q19.6 19.2 21.5 21" />
    </>
  ),
  angry: (
    <>
      <g className="mi-brows">
        <path d="M9 10 L14 12.6" />
        <path d="M23 10 L18 12.6" />
      </g>
      <g className="mi-eyes">
        {eye(11.8, 15)}
        {eye(20.2, 15)}
      </g>
      <path className="mi-mouth" d="M11.5 22 Q16 18.8 20.5 22" />
      <g className="mi-extra mi-vein">
        <path d="M23.2 3.5 Q24.6 3.5 24.6 4.9" />
        <path d="M29.2 3.5 Q27.8 3.5 27.8 4.9" />
        <path d="M23.2 9.5 Q24.6 9.5 24.6 8.1" />
        <path d="M29.2 9.5 Q27.8 9.5 27.8 8.1" />
      </g>
    </>
  ),
  // ── 2026-11-16 加的 19 个（Rei 给的 emoji 只当表情参考，画法同上面 12 个） ──
  hopeful: (
    <>
      <g className="mi-brows">
        <path d="M9 9.6 Q11.4 7.9 13.8 9.2" />
        <path d="M23 9.6 Q20.6 7.9 18.2 9.2" />
      </g>
      <g className="mi-eyes">
        {ringEye(11.5, 13.8, 2.3, 1.2, -0.8)}
        {ringEye(20.5, 13.8, 2.3, 1.2, -0.8)}
      </g>
      <path className="mi-mouth" d="M11 19 Q16 24.2 21 19" />
      <path className="mi-extra mi-sparkle mi-fill" d="M27 2.5 L27.6 4.4 L29.5 5 L27.6 5.6 L27 7.5 L26.4 5.6 L24.5 5 L26.4 4.4 Z" />
    </>
  ),
  smitten: (
    <>
      <g className="mi-eyes">
        <path className="mi-fill mi-heart" d={heart(11.3, 13.4, 0.78)} />
        <path className="mi-fill mi-heart" d={heart(20.7, 13.4, 0.78)} />
      </g>
      <path className="mi-mouth mi-fill" d="M10.8 18.6 H21.2 Q21.2 24.2 16 24.2 Q10.8 24.2 10.8 18.6 Z" />
    </>
  ),
  warm: (
    <>
      <g className="mi-eyes">
        <path d="M9.5 14 Q11.5 11.5 13.5 14" />
        <path d="M18.5 14 Q20.5 11.5 22.5 14" />
      </g>
      <g className="mi-blush">
        <ellipse className="mi-fill mi-soft" cx="9" cy="17.6" rx="2" ry="1.3" />
        <ellipse className="mi-fill mi-soft" cx="23" cy="17.6" rx="2" ry="1.3" />
      </g>
      <path className="mi-mouth" d="M12 19 Q16 22.8 20 19" />
      <g className="mi-extra mi-hearts">
        <path className="mi-fill mi-h1" d={heart(26.6, 5.4, 0.55)} />
        <path className="mi-fill mi-h2" d={heart(4.6, 8, 0.4)} />
      </g>
    </>
  ),
  proud: (
    <>
      <g className="mi-glasses">
        <path d="M7 11.4 H25" />
        <path className="mi-fill" d="M8 11.4 H14.6 V12.8 Q14.6 16.4 11.3 16.4 Q8 16.4 8 12.8 Z" />
        <path className="mi-fill" d="M17.4 11.4 H24 V12.8 Q24 16.4 20.7 16.4 Q17.4 16.4 17.4 12.8 Z" />
      </g>
      <path className="mi-mouth" d="M12 20.6 Q17 22.6 20.6 18.8" />
    </>
  ),
  touched: (
    <>
      <g className="mi-brows">
        <path d="M9.3 10.3 Q11.3 8.8 13.6 9.4" />
        <path d="M22.7 10.3 Q20.7 8.8 18.4 9.4" />
      </g>
      <g className="mi-eyes">
        {ringEye(11.5, 14, 2.6, 1.6)}
        {ringEye(20.5, 14, 2.6, 1.6)}
      </g>
      <path className="mi-mouth" d="M12.6 21 Q14.3 22.4 16 21 Q17.7 22.4 19.4 21" />
      <path className="mi-extra mi-tear mi-fill" d="M23.4 17.4 Q22 19.7 22 20.4 A1.4 1.4 0 0 0 24.8 20.4 Q24.8 19.7 23.4 17.4 Z" />
    </>
  ),
  relaxed: (
    <>
      <g className="mi-brows">
        <path d="M9 10.9 Q11 9.7 13.2 10.2" />
        <path d="M23 10.9 Q21 9.7 18.8 10.2" />
      </g>
      <g className="mi-eyes">
        <path d="M9.5 14 Q11.5 15.8 13.5 14" />
        <path d="M18.5 14 Q20.5 15.8 22.5 14" />
      </g>
      <path className="mi-mouth" d="M12.5 19.8 Q15.6 22.4 18.6 19.8" />
      <g className="mi-extra mi-breath">
        <path className="mi-thin" d="M23.6 6.4 Q26 4.9 28.6 6.1" />
        <path className="mi-thin" d="M25 3.4 Q27.2 2 29.6 3.1" />
      </g>
    </>
  ),
  celebrating: (
    <>
      <g className="mi-hat">
        <path className="mi-tint" d="M18.3 4.2 L26.6 1.4 L25.5 8.6 Z" />
        <circle className="mi-fill" cx="26.8" cy="1.3" r="1.3" />
      </g>
      <g className="mi-eyes">
        <path d="M9.5 14 Q11.5 11.5 13.5 14" />
        <path d="M18.5 14 Q20.5 11.5 22.5 14" />
      </g>
      <path className="mi-mouth mi-fill" d="M10.8 18.4 H21.2 Q21.2 24 16 24 Q10.8 24 10.8 18.4 Z" />
      <g className="mi-extra mi-confetti">
        <circle className="mi-fill mi-c1" cx="5.2" cy="6.6" r="1.1" />
        <path className="mi-thin mi-c2" d="M2.4 13.4 L4 12.2" />
        <path className="mi-fill mi-c3" d="M28.4 13.2 L30.4 13.8 L29 15.3 Z" />
        <circle className="mi-fill mi-c4" cx="11.4" cy="2.4" r="0.9" />
      </g>
    </>
  ),
  surprised: (
    <>
      <g className="mi-brows">
        <path d="M9 9.2 Q11.5 7.4 14 8.9" />
        <path d="M23 9.2 Q20.5 7.4 18 8.9" />
      </g>
      <g className="mi-eyes">
        <circle cx="11.5" cy="13.6" r="1.9" className="mi-fill" />
        <circle cx="20.5" cy="13.6" r="1.9" className="mi-fill" />
      </g>
      <ellipse className="mi-mouth" cx="16" cy="21.2" rx="2.3" ry="2.7" />
    </>
  ),
  torn: (
    <>
      <g className="mi-brows">
        <path d="M9.2 9.9 Q11.4 8.4 13.6 9.6" />
        <path d="M18.4 11.2 L22.8 11.8" />
      </g>
      {dotEyes}
      <path className="mi-mouth" d="M12 21.2 Q14.4 19.6 16.6 21 Q18.6 22.2 20.4 20.6" />
      <g className="mi-extra mi-question">
        <path d="M25 4.8 Q25 2.2 27.3 2.2 Q29.6 2.2 29.6 4.3 Q29.6 5.8 27.9 6.5 Q27.2 6.9 27.2 8.1" />
        <circle className="mi-fill" cx="27.2" cy="10.6" r="1" />
      </g>
    </>
  ),
  speechless: (
    <>
      {dotEyes}
      <g className="mi-extra mi-dots">
        <circle className="mi-fill mi-d1" cx="22.6" cy="3.4" r="1.2" />
        <circle className="mi-fill mi-d2" cx="26" cy="3.4" r="1.2" />
        <circle className="mi-fill mi-d3" cx="29.4" cy="3.4" r="1.2" />
      </g>
    </>
  ),
  blank: (
    <>
      <g className="mi-eyes">
        <circle cx="11.5" cy="14" r="2.1" className="mi-thin" />
        <circle cx="20.5" cy="14" r="2.1" className="mi-thin" />
      </g>
      <path className="mi-mouth" d="M14 21 H18" />
      <path className="mi-extra mi-wisp mi-thin" d="M25.4 7 Q23.8 5.5 25.4 4 Q27 2.5 25.4 1" />
    </>
  ),
  awkward: (
    <>
      <g className="mi-eyes">
        {ringEye(11.5, 13.4, 2.4, 1)}
        {ringEye(20.5, 13.4, 2.4, 1)}
      </g>
      <g className="mi-blush">
        <path className="mi-thin" d="M7.4 19.4 L8.4 17.6 M9.3 19.4 L10.3 17.6 M11.2 19.4 L12.2 17.6" />
        <path className="mi-thin" d="M19.8 19.4 L20.8 17.6 M21.7 19.4 L22.7 17.6 M23.6 19.4 L24.6 17.6" />
      </g>
      <path className="mi-mouth" d="M13.2 22 Q14.6 21 16 22 Q17.4 23 18.8 22" />
    </>
  ),
  disgusted: (
    <>
      <g className="mi-eyes">
        <path d="M9.4 13 H14" />
        <path d="M18.4 13 H23" />
        <g className="mi-pupils">
          <path className="mi-fill" d="M11.6 13.6 H14 A1.2 1.2 0 0 1 11.6 13.6 Z" />
          <path className="mi-fill" d="M20.6 13.6 H23 A1.2 1.2 0 0 1 20.6 13.6 Z" />
        </g>
      </g>
      <path className="mi-mouth" d="M12.4 21.4 Q16.4 19.2 20 21.8" />
    </>
  ),
  nauseous: (
    <>
      <g className="mi-eyes">
        <path d="M9.8 12.4 L13.2 14 L9.8 15.6" />
        <path d="M22.2 12.4 L18.8 14 L22.2 15.6" />
      </g>
      <path className="mi-mouth" d="M13.2 21.4 Q16 19.6 18.8 21.4" />
      <g className="mi-extra mi-cheeks">
        <path className="mi-ch1 mi-thin" d="M3.4 17.4 Q1.6 20.2 3.8 23" />
        <path className="mi-ch2 mi-thin" d="M28.6 17.4 Q30.4 20.2 28.2 23" />
      </g>
    </>
  ),
  scared: (
    <>
      <g className="mi-brows">
        <path d="M9.2 10.9 Q11.2 9.9 13.6 8.9" />
        <path d="M22.8 10.9 Q20.8 9.9 18.4 8.9" />
      </g>
      <g className="mi-eyes">
        {ringEye(11.5, 14, 2.2, 0.9)}
        {ringEye(20.5, 14, 2.2, 0.9)}
      </g>
      <path className="mi-mouth mi-tint" d="M12.8 19.6 H19.2 Q19.6 24 16 24 Q12.4 24 12.8 19.6 Z" />
      <g className="mi-extra mi-shiver">
        <path className="mi-thin" d="M1.4 12.2 Q2.6 14 1.4 15.8" />
        <path className="mi-thin" d="M30.6 12.2 Q29.4 14 30.6 15.8" />
      </g>
    </>
  ),
  disappointed: (
    <>
      <g className="mi-brows">
        <path d="M9.2 11.2 L13.4 10" />
        <path d="M22.8 11.2 L18.6 10" />
      </g>
      <g className="mi-eyes">
        <path d="M9.6 14.6 Q11.5 15.9 13.4 14.6" />
        <path d="M18.6 14.6 Q20.5 15.9 22.4 14.6" />
      </g>
      <path className="mi-mouth" d="M13 21.8 Q16 19.9 19 21.8" />
    </>
  ),
  wronged: (
    <>
      <g className="mi-brows">
        <path d="M9 11 Q11.2 10.2 13.4 8.8" />
        <path d="M23 11 Q20.8 10.2 18.6 8.8" />
      </g>
      <g className="mi-eyes">
        <circle cx="11.5" cy="14.4" r="2.8" className="mi-thin" />
        <circle cx="20.5" cy="14.4" r="2.8" className="mi-thin" />
        <circle cx="11.5" cy="14.8" r="1.9" className="mi-fill" />
        <circle cx="20.5" cy="14.8" r="1.9" className="mi-fill" />
      </g>
      <path className="mi-mouth" d="M13.2 22.2 Q14.6 20.8 16 22 Q17.4 20.8 18.8 22.2" />
    </>
  ),
  overwhelmed: (
    <>
      <g className="mi-eyes">
        {ringEye(11.5, 14, 2.2, 1)}
        {ringEye(20.5, 14, 2.2, 1)}
      </g>
      <path className="mi-mouth mi-tint" d="M12 21 Q16 17.8 20 21 Q16 24.4 12 21 Z" />
      <g className="mi-extra mi-burst">
        <path className="mi-r1" d="M16 2.6 V0.6" />
        <path className="mi-r2" d="M10.3 3.9 L9 1.6" />
        <path className="mi-r3" d="M21.7 3.9 L23 1.6" />
        <path className="mi-r4" d="M6.2 7.2 L4.2 5.6" />
        <path className="mi-r5" d="M25.8 7.2 L27.8 5.6" />
      </g>
    </>
  ),
  sick: (
    <>
      <g className="mi-brows">
        <path d="M9.4 10.9 L13.4 10" />
        <path d="M22.6 10.9 L18.6 10" />
      </g>
      <g className="mi-eyes">
        <path d="M9.6 14 H13.4" />
        <path d="M18.6 14 H22.4" />
        <path className="mi-fill" d="M10.4 14.6 H12.6 A1.1 1.1 0 0 1 10.4 14.6 Z" />
        <path className="mi-fill" d="M19.4 14.6 H21.6 A1.1 1.1 0 0 1 19.4 14.6 Z" />
      </g>
      <path className="mi-mouth" d="M12.6 21 H16.4" />
      <g className="mi-extra mi-therm">
        <path d="M16 21 L25.4 25" />
        <circle className="mi-fill" cx="26.2" cy="25.4" r="1.6" />
      </g>
    </>
  ),
};

/** 一个心情图标。不认识的 id（新版本加的）画成「一般」的脸。 */
export function MoodIcon({ mood, size = 28, playing = false, className }: { mood: string; size?: number; playing?: boolean; className?: string }) {
  const id: MoodId = isMoodId(mood) ? mood : 'okay';
  return (
    <svg
      className={`mood-icon mood-${id}${playing ? ' is-playing' : ''}${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <g className="mi-body">
        <circle className="mi-face" cx="16" cy="16" r="12.5" />
        {PARTS[id]}
      </g>
    </svg>
  );
}
