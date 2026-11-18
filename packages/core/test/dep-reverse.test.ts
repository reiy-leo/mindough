/**
 * 前后关系换方向（Rei 2026-11-18「前置任务和后置任务可以拖拽更换」）：A → B 换成 B → A；
 * 会绕成圈的不换，自动连上的（打卡存档、循环倒数日的记录）不换。
 */
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import { MemoryAdapter } from '../src/storage/memory';
import { CycleError } from '../src/dag';
import { AutoDependencyError, isAutoDependency, reverseCycle } from '../src/dep-reverse';
import { countdownRecordId } from '../src/countdown-repeat';
import { StrictModeError } from '../src/strict';
import { local } from './helpers';

async function open(now: () => Date = () => local(2026, 11, 2, 9)) {
  return Store.open(new MemoryAdapter(), { deviceId: 'dev1', now });
}
const pairs = (store: Store) => store.edges().map((e) => `${store.get('task', e.pred_id)!.body_md}>${store.get('task', e.succ_id)!.body_md}`).sort();

describe('reverseCycle', () => {
  it('只有这一条：换了不成圈；还有别的路从 A 走到 B：换了成圈，给出圈', () => {
    expect(reverseCycle([{ pred_id: 'a', succ_id: 'b' }], 'a', 'b')).toBeNull();
    const edges = [
      { pred_id: 'a', succ_id: 'b' },
      { pred_id: 'a', succ_id: 'x' },
      { pred_id: 'x', succ_id: 'b' },
    ];
    expect(reverseCycle(edges, 'a', 'b')).toEqual(['a', 'x', 'b', 'a']);
    // 换 x → b 不成圈（x 到 b 只有这一条）
    expect(reverseCycle(edges, 'x', 'b')).toBeNull();
  });
});

describe('Store.reverseDependency', () => {
  it('A → B 换成 B → A：旧的打墓碑，新连一条；派生状态跟着变', async () => {
    const store = await open();
    const a = store.createTask({ body_md: 'A' });
    const b = store.createTask({ body_md: 'B' });
    const c = store.createTask({ body_md: 'C' });
    store.addDependency(a.id, b.id);
    store.addDependency(b.id, c.id);
    expect(store.derived().get(a.id)?.state).toBe('可开始');
    expect(store.derived().get(b.id)?.state).toBe('被阻塞');
    const v = store.version;
    const row = store.reverseDependency(a.id, b.id);
    expect(row).toMatchObject({ pred_id: b.id, succ_id: a.id, type: 'FS', lag: 0, deleted: false });
    expect(store.version).toBe(v + 1); // 一批写完
    expect(pairs(store)).toEqual(['B>A', 'B>C']);
    expect(store.listAll('dependency').filter((d) => d.pred_id === a.id && d.succ_id === b.id).every((d) => d.deleted)).toBe(true);
    expect(store.derived().get(a.id)?.state).toBe('被阻塞');
    expect(store.derived().get(b.id)?.state).toBe('可开始');
    // 再换回来
    store.reverseDependency(b.id, a.id);
    expect(pairs(store)).toEqual(['A>B', 'B>C']);
  });

  it('会绕成圈：A → X → B 还在，A → B 换不了，抛 CycleError（圈从 A 出发），什么都不写', async () => {
    const store = await open();
    const a = store.createTask({ body_md: 'A' });
    const x = store.createTask({ body_md: 'X' });
    const b = store.createTask({ body_md: 'B' });
    store.addDependency(a.id, b.id);
    store.addDependency(a.id, x.id);
    store.addDependency(x.id, b.id);
    const v = store.version;
    let err: unknown;
    try {
      store.reverseDependency(a.id, b.id);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CycleError);
    expect((err as CycleError).path).toEqual([a.id, x.id, b.id, a.id]);
    expect(store.version).toBe(v);
    expect(pairs(store)).toEqual(['A>B', 'A>X', 'X>B']);
  });

  it('打卡达标存正文生成的那条：自动连上的，不能换', async () => {
    const store = await open();
    const h = store.createTask({ body_md: '读书\n\n第三章', completion_mode: 'count', target_value: 2, recurrence: 'FREQ=DAILY' });
    store.checkIn(h.id, 'add', 2);
    const arc = store.edges().find((e) => e.succ_id === h.id)!;
    expect(arc).toBeTruthy();
    expect(store.isAutoDependency(arc.pred_id, h.id)).toBe(true);
    const v = store.version;
    expect(() => store.reverseDependency(arc.pred_id, h.id)).toThrow(AutoDependencyError);
    expect(store.version).toBe(v);
    // 自己连的照常能换
    const other = store.createTask({ body_md: '买书' });
    store.addDependency(other.id, h.id);
    expect(store.isAutoDependency(other.id, h.id)).toBe(false);
    store.reverseDependency(other.id, h.id);
    expect(store.edges()).toContainEqual({ pred_id: h.id, succ_id: other.id });
  });

  it('循环倒数日每次的记录那条：自动连上的，不能换', async () => {
    let now = local(2026, 11, 12, 9);
    const store = await open(() => now);
    const t = store.createTask({ body_md: '妈妈生日', completion_mode: 'countdown', target_date: '2026-11-12', recurrence: 'FREQ=YEARLY;BYMONTH=11;BYMONTHDAY=12' }, { joinMyDay: false });
    now = local(2026, 11, 13, 9);
    expect(store.rollRecurringCountdowns()).toBe(1);
    const rid = countdownRecordId(t.id, '2026-11-12');
    expect(store.isAutoDependency(rid, t.id)).toBe(true);
    const dep = store.list('dependency').find((d) => d.pred_id === rid)!;
    expect(isAutoDependency(dep, store.get('task', rid))).toBe(true);
    // 记录的目标日被改过（不再认得出是记录），行 id 照样认得出
    expect(isAutoDependency(dep, { ...store.get('task', rid)!, id: 'other' })).toBe(true);
    expect(() => store.reverseDependency(rid, t.id)).toThrow(AutoDependencyError);
    expect(store.edges()).toContainEqual({ pred_id: rid, succ_id: t.id });
  });

  it('严格模式：碰到完成的任务就不写（StrictModeError）', async () => {
    const store = await open();
    const a = store.createTask({ body_md: 'A' });
    const b = store.createTask({ body_md: 'B' });
    store.addDependency(a.id, b.id);
    store.setStatus(a.id, '完成');
    store.strictDone = true;
    expect(() => store.reverseDependency(a.id, b.id)).toThrow(StrictModeError);
    expect(pairs(store)).toEqual(['A>B']);
  });

  it('两台设备各连了一条、合起来成了 A ⇄ B：换 A → B 时不再新加，留下的 B → A 生效', async () => {
    const store = await open();
    const a = store.createTask({ body_md: 'A' });
    const b = store.createTask({ body_md: 'B' });
    store.addDependency(a.id, b.id);
    store.applyRemote([{ table: 'dependency', row: { id: 'remote-ba', pred_id: b.id, succ_id: a.id, type: 'FS', lag: 0, deleted: false, updated_at: '9999999999995-0000-rem' } as never }]);
    expect(store.conflictEdges()).toHaveLength(1);
    const row = store.reverseDependency(a.id, b.id);
    expect(row.id).toBe('remote-ba');
    expect(store.conflictEdges()).toHaveLength(0);
    expect(pairs(store)).toEqual(['B>A']);
  });

  it('没有这条：抛错', async () => {
    const store = await open();
    const a = store.createTask({ body_md: 'A' });
    const b = store.createTask({ body_md: 'B' });
    expect(() => store.reverseDependency(a.id, b.id)).toThrow();
  });
});
