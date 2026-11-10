/**
 * 资料库页卡片的小字（名字下面那行）。
 * 目的地只显示名字（Rei 2026-11-11：地址在卡片网格里挤成一团，地址留在详情里看），
 * 按内置类型 id 认，用户改过名也认。别的库照旧：字段摘要 · N 件任务。
 */
import { BUILTIN_TYPE_IDS, type TaskType } from '@mindough/core';

export function tileShowsSub(type: Pick<TaskType, 'id'>): boolean {
  return type.id !== BUILTIN_TYPE_IDS.travel;
}

export function tileSubText(type: Pick<TaskType, 'id'>, subtitle: string, usesText: string): string {
  if (!tileShowsSub(type)) return '';
  return [subtitle, usesText].filter(Boolean).join(' · ');
}
