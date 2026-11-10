/**
 * 项目关联资料库（Rei 2026-11-10「项目新建 / 编辑窗口加资料库下拉，多选，选中资料库里的任务自动加入这个项目」）。
 *
 * 数据：
 * - group_library 表：一个资料库一行，id 由库 id 算（groupLibraryId），所以一个库只能关联一个项目，
 *   两台设备各关联各的也只是同一行 LWW，后写的赢。取消关联 = 这行打墓碑；改关联到别的项目 = 改 group_id。
 *   项目删了 / 解散了，这行不动，只是不生效（撤销删除后又生效）。
 * - task.lib_via：这件任务为什么在现在的项目里。
 *   - 资料库 id：因为这个库关联了这个项目，自动放进来的（取消关联时据此移出）；
 *   - LIB_OPT_OUT（'!'）：用户手动把它挪出过资料库带进来的项目，资料库不再自动挪它；
 *   - 空：手动放的，或和资料库无关。
 *
 * 「资料库里的任务」：任务挂了这个库的资料（task_item → library_item.type_id）；人物库 = 任务关联了人（task_person）。
 * 只选了库、没挂资料的老任务（只有 task.type_id）不算：资料库页里也看不到它们。删掉的任务不算；完成、关闭、归档的照样算。
 *
 * 这里只放纯函数（给一件任务算它该去哪），写入在 Store（setGroupLibraries / settleProjectLibraries）。
 */

/** 手动挪出过：资料库不再自动挪这件任务。 */
export const LIB_OPT_OUT = '!';

/** 资料库 → 关联行的 id（一个库一行）。 */
export function groupLibraryId(typeId: string): string {
  return `glib-${typeId}`;
}

/** 一个资料库现在关联到哪个项目（只算生效的：关联行没删、项目还在）。archived = 项目归档了（不再往里自动加新任务）。 */
export interface LibLinkTarget {
  groupId: string;
  archived: boolean;
}

export type LinkOf = (typeId: string) => LibLinkTarget | undefined;

export interface TaskPlacement {
  group_id: string | null;
  lib_via: string | null;
}

/**
 * 一件任务按关联规则该在哪（同步、挂上 / 去掉资料、改关联之后算）。返回 null = 不用动。
 * libs：任务所在的资料库，按任务里资料的顺序（人物库排最后），第一个优先。
 * groupAlive：任务现在的项目还在吗（删了的项目当没有项目）。
 *
 * 规则：
 * 1. lib_via 是 '!'（手动挪出过）：不动。
 * 2. lib_via 是某个库，而且任务还在这个库里、这个库还关联着任务现在的项目：不动。
 *    任务还在别的库里、那个库也关联着现在的项目：换成那个库（以后按它进出）。
 * 3. 否则（库取消关联了、改关联到别的项目了、任务的资料去掉了）：在任务所在、关联着没归档项目的库里挑第一个，挪过去；
 *    一个都没有就移出项目（不回原项目）。
 * 4. lib_via 空：任务现在的项目已经是它某个库关联的项目，就不动（手动放的，取消关联时不移出）；
 *    否则挑第一个关联着没归档项目的库，挪过去（含原来在别的项目里的）。没有就不动。
 */
export function placeTask(task: TaskPlacement, libs: readonly string[], linkOf: LinkOf, groupAlive: (id: string) => boolean): TaskPlacement | null {
  if (task.lib_via === LIB_OPT_OUT) return null;
  const current = task.group_id && groupAlive(task.group_id) ? task.group_id : null;
  const linkedHere = current ? libs.find((l) => linkOf(l)?.groupId === current) : undefined;
  const target = () => {
    for (const l of libs) {
      const k = linkOf(l);
      if (k && !k.archived) return { group_id: k.groupId, lib_via: l };
    }
    return undefined;
  };
  if (task.lib_via) {
    const via = task.lib_via;
    if (libs.includes(via) && current && linkOf(via)?.groupId === current) return null;
    if (linkedHere) return linkedHere === via ? null : { group_id: current, lib_via: linkedHere };
    // 改关联到别的项目：先跟着原来那个库走（它就算排在后面也优先），没有再挑第一个
    const k = libs.includes(via) ? linkOf(via) : undefined;
    const next = k && !k.archived ? { group_id: k.groupId, lib_via: via } : (target() ?? { group_id: null, lib_via: null });
    return next.group_id === task.group_id && next.lib_via === task.lib_via ? null : next;
  }
  if (linkedHere) return null;
  const next = target();
  if (!next) return null;
  return next.group_id === task.group_id && next.lib_via === task.lib_via ? null : next;
}

/**
 * 用户手动改了任务的项目（拖到别的项目、详情里换项目、移出项目）之后，lib_via 该写什么：
 * - 新项目正是它某个库关联的项目：交回给那个库管（取消关联时会移出）；
 * - 它在某个关联着项目的库里（不改的话资料库会把它拉回去）：'!'，以后不再自动挪；
 * - 都不是：空。
 */
export function manualVia(newGroupId: string | null, libs: readonly string[], linkOf: LinkOf): string | null {
  if (newGroupId) {
    const here = libs.find((l) => linkOf(l)?.groupId === newGroupId);
    if (here) return here;
  }
  return libs.some((l) => !!linkOf(l)) ? LIB_OPT_OUT : null;
}

/** 关联资料库前后的差别（保存项目时用）：加了哪些、去掉了哪些、哪些是从别的项目抢过来的。 */
export function libraryLinkDiff(before: readonly string[], after: readonly string[], linkedElsewhere: (typeId: string) => string | undefined) {
  const added = after.filter((x) => !before.includes(x));
  const removed = before.filter((x) => !after.includes(x));
  const taken = added.map((typeId) => ({ typeId, fromGroupId: linkedElsewhere(typeId) })).filter((x): x is { typeId: string; fromGroupId: string } => !!x.fromGroupId);
  return { added, removed, taken };
}
