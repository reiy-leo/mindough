import { describe, expect, it } from 'vitest';
import { firstLine, isPlainTitleLine, itemTitleOf, needsTitleLine, taskTitle, withTitleLine } from '../src/preview';
import { BUILTIN_TASK_TYPES, BUILTIN_TYPE_IDS } from '../src/seed/builtin-types';
import { mkTask } from './helpers';

const movie = BUILTIN_TASK_TYPES.find((t) => t.id === BUILTIN_TYPE_IDS.movie)!;
const person = BUILTIN_TASK_TYPES.find((t) => t.id === BUILTIN_TYPE_IDS.person)!;

describe('预览', () => {
  it('首行：跳过空行，去掉 markdown 标记', () => {
    expect(firstLine('\n\n## 想看理由\n正文')).toBe('想看理由');
    expect(firstLine('- [ ] **买**牙膏')).toBe('买牙膏');
    expect(firstLine('[链接](https://x.y) 后面')).toBe('链接 后面');
    expect(firstLine('   ')).toBe('');
  });
  it('首行：去掉下划线标签（三种），字挨着不加空格', () => {
    expect(firstLine('这是<u>重点</u>内容')).toBe('这是重点内容');
    expect(firstLine('- [ ] <u class="wavy">**买**</u>牙膏')).toBe('买牙膏');
    expect(firstLine("## <u class='double'>标题</u>")).toBe('标题');
    expect(firstLine('<u></u>\n第二行')).toBe('第二行');
    // 别的标签不动
    expect(firstLine('<kbd>K</kbd>')).toBe('<kbd>K</kbd>');
  });

  it('标题：任何任务都是正文首行（Rei 2026-11-03），资料名不当标题；没有就是占位（Rei 2026-11-12 09:33 / 09:34）', () => {
    expect(taskTitle(mkTask('a', { body_md: '周末去看', type_data: { title: '沙丘' } }))).toBe('周末去看');
    expect(taskTitle(mkTask('a', { body_md: '想看', type_data: {} }))).toBe('想看');
    expect(taskTitle(mkTask('a', { body_md: '' }))).toBe('未提供描述');
    expect(taskTitle(mkTask('a', { body_md: '', completion_mode: 'countdown' }))).toBe('未命名倒数日');
  });

  it('itemTitleOf：以前的标题来源（主字段的值），人物字段走解析器', () => {
    expect(itemTitleOf(mkTask('a', { type_data: { title: '沙丘' } }), movie)).toBe('沙丘');
    expect(itemTitleOf(mkTask('a', { type_data: { title: '  ' } }), movie)).toBe('');
    expect(itemTitleOf(mkTask('a', { type_data: { title: '沙丘' } }), null)).toBe('');
    const t = mkTask('a', { body_md: '聊天', type_data: { person: 'p1' } });
    expect(itemTitleOf(t, person, (_d, v) => (v === 'p1' ? '妈妈' : ''))).toBe('妈妈');
  });

  it('纯文字标题行：escapeTitleLine 写出来的样子才算', () => {
    for (const ok of ['沙丘', 'draw.io', '\\# 不是标题', '1\\. 不是列表', '3 \\* 4']) expect(isPlainTitleLine(ok)).toBe(true);
    expect(isPlainTitleLine('3 * 4')).toBe(false);
    for (const no of ['## 想看理由', '- 列表', '> 引用', '**粗**', '1. 第一', '[链接](x)', '']) expect(isPlainTitleLine(no)).toBe(false);
  });

  it('needsTitleLine：空正文、模板标题、列表开头算缺；纯文字开头不缺', () => {
    expect(needsTitleLine('')).toBe(true);
    expect(needsTitleLine('\n\n')).toBe(true);
    expect(needsTitleLine('## 想看理由\n\n\n## 观后感\n')).toBe(true);
    expect(needsTitleLine('\n- [ ] 买票')).toBe(true);
    expect(needsTitleLine('周末去看\n\n## 想看理由')).toBe(false);
    expect(needsTitleLine('\\## 想看理由')).toBe(false);
  });

  it('withTitleLine：名字按纯文字转义放最前面，原来的内容空一行接上', () => {
    expect(withTitleLine('## 想看理由\n\n\n## 观后感\n', '沙丘 2')).toBe('沙丘 2\n\n## 想看理由\n\n\n## 观后感');
    expect(withTitleLine('', '沙丘')).toBe('沙丘');
    expect(withTitleLine('\n\n> 引用', '#1 *星*')).toBe('\\#1 \\*星\\*\n\n> 引用');
    expect(taskTitle({ body_md: withTitleLine('## 想看理由', '#1 *星*') })).toBe('#1 *星*');
    expect(needsTitleLine(withTitleLine('## 想看理由', '#1 *星*'))).toBe(false);
  });
});
