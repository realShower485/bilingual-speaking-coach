import type { ScenarioItem, TopicItem } from '../types';
import { scenarioLibrary, topicLibrary } from './libraries';
import * as db from './db';

// =====================================================================
// 自定义条目 ID 前缀
// =====================================================================
// 自定义场景/主题的 id 使用前缀,以便:
// 1. 与内置条目区分(内置 id 如 'ordering_food' 无前缀);
// 2. UI 层可据此判断某条目是否可删除(内置条目不可删除)。
export const CUSTOM_SCENARIO_PREFIX = 'custom_scenario_';
export const CUSTOM_TOPIC_PREFIX = 'custom_topic_';

/** 生成带前缀的唯一 id。 */
function generatePrefixedId(prefix: string): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}${uuid}`;
}

// =====================================================================
// 辅助:判断条目是否为自定义(可删除)
// =====================================================================

export function isCustomScenario(id: string): boolean {
  return id.startsWith(CUSTOM_SCENARIO_PREFIX);
}

export function isCustomTopic(id: string): boolean {
  return id.startsWith(CUSTOM_TOPIC_PREFIX);
}

// =====================================================================
// 获取所有可用条目(内置 + 自定义)
// =====================================================================

/** 获取所有可用场景(内置 + 自定义),自定义条目排在后面。 */
export async function getAllScenarios(): Promise<ScenarioItem[]> {
  const custom = await db.getCustomScenarios();
  return [...scenarioLibrary.scenarios, ...custom];
}

/** 获取所有可用主题(内置 + 自定义),自定义条目排在后面。 */
export async function getAllTopics(): Promise<TopicItem[]> {
  const custom = await db.getCustomTopics();
  return [...topicLibrary.topics, ...custom];
}

// =====================================================================
// 添加自定义场景/主题
// =====================================================================

/** 添加自定义场景(自动生成带前缀的 id)。 */
export async function addCustomScenario(
  scenario: Omit<ScenarioItem, 'id'>,
): Promise<void> {
  const item: ScenarioItem = {
    ...scenario,
    id: generatePrefixedId(CUSTOM_SCENARIO_PREFIX),
  };
  await db.createCustomScenario(item);
}

/** 添加自定义主题(自动生成带前缀的 id)。 */
export async function addCustomTopic(
  topic: Omit<TopicItem, 'id'>,
): Promise<void> {
  const item: TopicItem = {
    ...topic,
    id: generatePrefixedId(CUSTOM_TOPIC_PREFIX),
  };
  await db.createCustomTopic(item);
}

// =====================================================================
// 删除自定义场景/主题
// =====================================================================

/**
 * 删除自定义场景。
 * 仅允许删除带自定义前缀的条目,传入内置 id 时抛错以防止误删。
 */
export async function deleteCustomScenario(id: string): Promise<void> {
  if (!isCustomScenario(id)) {
    throw new Error('内置场景不可删除,仅可删除自定义场景。');
  }
  await db.deleteCustomScenario(id);
}

/**
 * 删除自定义主题。
 * 仅允许删除带自定义前缀的条目,传入内置 id 时抛错以防止误删。
 */
export async function deleteCustomTopic(id: string): Promise<void> {
  if (!isCustomTopic(id)) {
    throw new Error('内置主题不可删除,仅可删除自定义主题。');
  }
  await db.deleteCustomTopic(id);
}
