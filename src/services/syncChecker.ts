// =====================================================================
// syncChecker — 跨电脑同步检测
// ---------------------------------------------------------------------
// 通过对比数据库内部记录的 last_modified 时间戳与本地缓存的"已知时间",
// 判断数据库文件是否在外部被更新(例如另一台电脑通过 WebDAV/iCloud/OneDrive
// 同步覆盖了本地的 .db 文件)。
// 已知时间存放在 localStorage 中(自用场景占位实现,后续可替换为 Tauri fs)。
// =====================================================================

import { getDbModifiedTime } from './db';

const KNOWN_TIME_KEY = 'bilingual-speaking-coach:db-known-time';

export interface SyncCheckResult {
  /** 是否检测到外部修改(数据库时间戳晚于本地已知时间)。 */
  isModified: boolean;
  /** 本地记录的上次已知修改时间戳;首次启动时为 null。 */
  lastKnownTime: number | null;
  /** 数据库当前记录的修改时间戳;无法读取时为 null。 */
  currentTime: number | null;
}

function readKnownTime(): number | null {
  try {
    const raw = localStorage.getItem(KNOWN_TIME_KEY);
    if (!raw) return null;
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  } catch {
    return null;
  }
}

function writeKnownTime(time: number): void {
  try {
    localStorage.setItem(KNOWN_TIME_KEY, String(time));
  } catch {
    // localStorage 写入失败时静默忽略;同步检测功能将退化为每次都视为未修改
  }
}

/**
 * 检测数据库是否在外部被修改。
 *
 * 判定规则:
 *   - 首次启动(lastKnownTime === null):不视为外部修改(避免首次使用弹窗)
 *   - 数据库无法读取时间戳:不视为外部修改(可能是尚未初始化)
 *   - currentTime > lastKnownTime:视为外部修改
 *   - 其他情况:不视为外部修改
 *
 * 注意:本函数不读取文件系统的 mtime,而是依赖数据库内部 db_meta 表的
 * last_modified 字段。这意味着若两台电脑的时间偏差较大,或同步机制未真正
 * 覆盖本地文件,可能漏报。生产环境建议结合文件 mtime 双重校验。
 */
export async function checkDbModified(): Promise<SyncCheckResult> {
  const lastKnownTime = readKnownTime();
  let currentTime: number | null = null;
  try {
    currentTime = await getDbModifiedTime();
  } catch {
    // 数据库未初始化或读取失败时,currentTime 保持 null
  }

  let isModified = false;
  if (lastKnownTime !== null && currentTime !== null) {
    // 留 500ms 容差,避免同一台电脑内连续操作的时间戳抖动误报
    isModified = currentTime > lastKnownTime + 500;
  }

  return { isModified, lastKnownTime, currentTime };
}

/**
 * 将数据库当前修改时间记录到本地缓存。
 * 通常在应用正常退出、或确认加载数据后调用。
 */
export async function recordDbTime(): Promise<void> {
  try {
    const time = await getDbModifiedTime();
    if (time !== null) {
      writeKnownTime(time);
    }
  } catch {
    // 读取失败时静默忽略;下次启动可能误报,但不影响功能
  }
}
