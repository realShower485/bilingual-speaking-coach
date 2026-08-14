// =====================================================================
// 统一 HTTP 请求层
// ---------------------------------------------------------------------
// 在 Tauri 环境中使用 @tauri-apps/plugin-http 的 fetch（从 Rust 后端发请求，
// 绕过浏览器 CORS 限制）；在非 Tauri 环境中回退到原生 fetch。
// =====================================================================

import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

/** 统一 fetch：Tauri 环境用插件（绕过 CORS），否则用原生 fetch。 */
export async function httpFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  return tauriFetch(input.toString(), init as RequestInit);
}
