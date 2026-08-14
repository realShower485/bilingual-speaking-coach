import type { AppSettings } from '../types';

// 与 settingsStore 使用同一存储键,保持配置一致;后续替换为 Tauri fs 持久化。
const CONFIG_STORAGE_KEY = 'bilingual-speaking-coach:settings';

/**
 * 从本地存储读取非敏感配置。
 * 当前以 localStorage 作为占位实现(与 settingsStore 一致),
 * 后续接入 Tauri fs 插件时仅需替换函数体即可。
 */
export async function readConfig(): Promise<Partial<AppSettings>> {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<AppSettings>;
  } catch {
    return {};
  }
}

/**
 * 将配置增量合并写入本地存储。
 * 当前以 localStorage 作为占位实现,后续替换为 Tauri fs 持久化。
 */
export async function writeConfig(config: Partial<AppSettings>): Promise<void> {
  try {
    const current = await readConfig();
    const merged = { ...current, ...config };
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // 持久化失败时静默忽略,后续可接入 Tauri 文件系统持久化。
  }
}
