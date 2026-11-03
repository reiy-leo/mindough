/** 挑任务的搜索（Rei 2026-11-02「做完后解锁和先做的搜索搜不到任务标题」）：标题带 markdown、中文、拼音首字母，和 ⌘K 一致。 */
import { describe, expect, it } from 'vitest';
import { plainMarkdown, taskMatchRank, taskTextMatches } from '../src/task-match';
import { taskTitle } from '../src/preview';
import { search } from '../src/search';
import { BUILTIN_TASK_TYPES } from '../src/seed/builtin-types';
import { mkTask } from './helpers';

const t = (body_md: string) => ({ title: taskTitle({ body_md, type_data: {} }), body: body_md });
const match = (body_md: string, q: string) => {
  const x = t(body_md);
  return taskTextMatches(x.title, x.body, q);
};

describe('plainMarkdown', () => {
  it('去掉行首标记、粗体、链接、图片、HTML', () => {
    expect(plainMarkdown('# **买菜**\n- [ ] 去 [超市](https://x.cn) ![图](a.png)\n<details><summary>更多</summary></details>')).toBe('买菜 去 超市 更多');
  });
});

describe('taskTextMatches：标题 = 正文第一行（去掉 markdown）', () => {
  it('标题带 markdown 标记也能搜到', () => {
    expect(match('# 写**周报**', '写周报')).toBe(true);
    expect(match('- [ ] 交 [房租](https://bank.cn)', '交房租')).toBe(true);
    expect(match('1. ~~旧~~ 计划', '旧 计划')).toBe(true);
  });
  it('中文、大小写不敏感、几个词不分先后', () => {
    expect(match('读书 30 页', '读书')).toBe(true);
    expect(match('Review PR for Mindough', 'mindough review')).toBe(true);
    expect(match('读书 30 页', '看电影')).toBe(false);
  });
  it('拼音首字母、全拼', () => {
    expect(match('# 买菜', 'mc')).toBe(true);
    expect(match('读书 30 页', 'dushu')).toBe(true);
    expect(match('读书 30 页', 'xyz')).toBe(false);
  });
  it('正文里的字也算', () => {
    expect(match('买菜\n- 西红柿\n- **鸡蛋**', '鸡蛋')).toBe(true);
  });
  it('空搜索词全都算对上', () => {
    expect(match('随便', '  ')).toBe(true);
  });
});

describe('taskMatchRank', () => {
  it('标题开头 < 标题包含 < 拼音 < 只在正文', () => {
    expect(taskMatchRank('买菜', '买')).toBe(0);
    expect(taskMatchRank('去买菜', '买菜')).toBe(1);
    expect(taskMatchRank('去买菜', 'mc')).toBe(2);
    expect(taskMatchRank('去买菜', '鸡蛋')).toBe(3);
  });
});

describe('⌘K 和挑任务用的是同一套', () => {
  const tasks = [mkTask('a', { body_md: '# **买菜**' }), mkTask('b', { body_md: '读书 30 页' })];
  const input = { tasks, types: BUILTIN_TASK_TYPES, people: [], groups: [], taskPeople: [] };
  it('标题带 markdown：⌘K 也搜得到', () => {
    expect(search(input, '买菜').map((h) => h.id)).toContain('a');
  });
  it('拼音首字母：⌘K 也搜得到', () => {
    expect(search(input, 'mc').map((h) => h.id)).toContain('a');
    expect(search(input, 'ds').map((h) => h.id)).toContain('b');
  });

  it('下划线标签去掉、不留空格', () => {
    expect(plainMarkdown('这是<u class="double">重点</u>内容')).toBe('这是重点内容');
    expect(match('a<u>bc</u>d', 'abcd')).toBe(true);
    expect(match('<u>x</u>', 'u')).toBe(false);
  });
});
