import { describe, expect, it } from 'vitest';
import { firstLine, taskSubtitle, taskTitle } from '../src/preview';
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

  it('标题：类型主字段优先，其次正文首行，再其次“空白任务”', () => {
    expect(taskTitle(mkTask('a', { body_md: '想看', type_data: { title: '沙丘' } }), movie)).toBe('沙丘');
    expect(taskTitle(mkTask('a', { body_md: '想看', type_data: {} }), movie)).toBe('想看');
    expect(taskTitle(mkTask('a', { body_md: '' }))).toBe('空白任务');
    expect(taskSubtitle(mkTask('a', { body_md: '想看', type_data: { title: '沙丘' } }), movie)).toBe('想看');
  });

  it('人物字段通过解析器显示姓名', () => {
    const t = mkTask('a', { body_md: '聊天', type_data: { person: 'p1' } });
    expect(taskTitle(t, person, (_d, v) => (v === 'p1' ? '妈妈' : ''))).toBe('妈妈');
  });
});
