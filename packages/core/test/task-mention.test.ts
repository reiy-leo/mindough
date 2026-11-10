/** 正文里 @ 提及任务（Rei 2026-11-10）：地址、候选范围、过滤和排序、光标前的 @。 */
import { describe, expect, it } from 'vitest';
import { mentionCandidates, mentionHref, mentionIdOf, mentionKind, mentionQueryAt, mentionable } from '../src/task-mention';
import { taskTitle } from '../src/preview';
import { mkTask } from './helpers';

const ID = '0199f2a4-7c1e-7000-8000-1a2b3c4d5e6f';

describe('提及的地址', () => {
  it('任务深链往返', () => {
    expect(mentionHref(ID)).toBe(`mindough://task/${ID}`);
    expect(mentionIdOf(mentionHref(ID))).toBe(ID);
    expect(mentionIdOf(`MINDOUGH://task/${ID.toUpperCase()}/`)).toBe(ID);
  });
  it('别的地址不算', () => {
    expect(mentionIdOf('https://mindough.rei8t.dev/#/task/x')).toBeNull();
    expect(mentionIdOf('mindough://view/myday')).toBeNull();
    expect(mentionIdOf(`mindough://task/${ID}?x=1`)).toBeNull();
    expect(mentionIdOf(`mindough://checkin/${ID}`)).toBeNull();
    expect(mentionIdOf('')).toBeNull();
    expect(mentionIdOf(null)).toBeNull();
  });
});

describe('能 @ 谁', () => {
  const plain = mkTask('a');
  const countdown = mkTask('b', { completion_mode: 'countdown', target_date: '2026-12-31' });
  const habit = mkTask('c', { recurrence: 'FREQ=DAILY' });
  const counter = mkTask('d', { completion_mode: 'count', target_value: 8 });
  const timer = mkTask('e', { completion_mode: 'timer' });
  it('种类', () => {
    expect(mentionKind(plain)).toBe('task');
    expect(mentionKind(countdown)).toBe('countdown');
    expect(mentionKind(habit)).toBeNull();
    expect(mentionKind(counter)).toBeNull();
    expect(mentionKind(timer)).toBeNull();
  });
  it('任务正文只列普通任务，日记多列倒数日；打卡都不列', () => {
    expect([plain, countdown, habit, counter, timer].filter((t) => mentionable(t, 'task')).map((t) => t.id)).toEqual(['a']);
    expect([plain, countdown, habit, counter, timer].filter((t) => mentionable(t, 'journal')).map((t) => t.id)).toEqual(['a', 'b']);
  });
  it('删掉的不列', () => {
    expect(mentionable({ ...plain, deleted: true }, 'journal')).toBe(false);
  });
});

describe('候选', () => {
  const tasks = [
    mkTask('t1', { body_md: '读书 30 页', updated_at: '0003' }),
    mkTask('t2', { body_md: '# 买**菜**', updated_at: '0002' }),
    mkTask('t3', { body_md: '读完《三体》', status: '完成', updated_at: '0009' }),
    mkTask('t4', { body_md: '新年倒数', completion_mode: 'countdown', target_date: '2027-01-01', updated_at: '0001' }),
    mkTask('t5', { body_md: '每天读书', recurrence: 'FREQ=DAILY', updated_at: '0008' }),
    mkTask('t6', { body_md: '整理书架\n\n读书笔记放这里', updated_at: '0004' }),
    mkTask('t7', { body_md: '写周报', status: '关闭', updated_at: '0007' }),
  ];
  const run = (query: string, scope: 'task' | 'journal' = 'task', selfId?: string) =>
    mentionCandidates(tasks, { scope, selfId, query, titleOf: (t) => taskTitle(t) }).map((c) => c.id);

  it('空搜索词：没结束的在前、最近改的在前，结束的在后', () => {
    expect(run('')).toEqual(['t6', 't1', 't2', 't3', 't7']);
  });
  it('日记里多出倒数日', () => {
    expect(run('', 'journal')).toEqual(['t6', 't1', 't2', 't4', 't3', 't7']);
  });
  it('任务正文里不列自己', () => {
    expect(run('', 'task', 't1')).not.toContain('t1');
  });
  it('只按标题搜，不搜正文；标题去掉 markdown', () => {
    expect(run('读书')).toEqual(['t1']);
    expect(run('买菜')).toEqual(['t2']);
  });
  it('拼音首字母、全拼', () => {
    expect(run('ds')).toEqual(['t1']);
    expect(run('maicai')).toEqual(['t2']);
    expect(run('xnds', 'journal')).toEqual(['t4']);
  });
  it('已结束的也能搜到，排在后面', () => {
    expect(run('读')).toEqual(['t1', 't3']);
  });
  it('标题以搜索词开头的排前面', () => {
    const list = [mkTask('x1', { body_md: '复读书单', updated_at: '9' }), mkTask('x2', { body_md: '读书会', updated_at: '1' })];
    expect(mentionCandidates(list, { scope: 'task', query: '读书', titleOf: (t) => taskTitle(t) }).map((c) => c.id)).toEqual(['x2', 'x1']);
  });
  it('带上种类和是否结束', () => {
    const c = mentionCandidates(tasks, { scope: 'journal', query: '新年', titleOf: (t) => taskTitle(t) });
    expect(c).toEqual([{ id: 't4', title: '新年倒数', kind: 'countdown', ended: false }]);
  });
  it('最多列 limit 条', () => {
    expect(mentionCandidates(tasks, { scope: 'task', query: '', titleOf: (t) => taskTitle(t), limit: 2 })).toHaveLength(2);
  });
});

describe('光标前的 @', () => {
  it('行首、空格、汉字、标点后面都算', () => {
    expect(mentionQueryAt('@')).toEqual({ at: 0, query: '' });
    expect(mentionQueryAt('看看 @du')).toEqual({ at: 3, query: 'du' });
    expect(mentionQueryAt('今天@读书')).toEqual({ at: 2, query: '读书' });
    expect(mentionQueryAt('（@a')).toEqual({ at: 1, query: 'a' });
  });
  it('全角 ＠ 也算', () => {
    expect(mentionQueryAt('看＠读')).toEqual({ at: 1, query: '读' });
  });
  it('邮箱、打了空格、太长都不算', () => {
    expect(mentionQueryAt('a@b')).toBeNull();
    expect(mentionQueryAt('rei@mail')).toBeNull();
    expect(mentionQueryAt('@读书 ')).toBeNull();
    expect(mentionQueryAt(`@${'x'.repeat(33)}`)).toBeNull();
    expect(mentionQueryAt('没有')).toBeNull();
  });
  it('只看最后一个 @', () => {
    expect(mentionQueryAt('@a @b')).toEqual({ at: 3, query: 'b' });
  });
});
