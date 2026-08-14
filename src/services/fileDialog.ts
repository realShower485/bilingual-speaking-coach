// =====================================================================
// fileDialog — 数据库文件 / 目录选择辅助
// ---------------------------------------------------------------------
// 首版使用浏览器隐藏 <input type="file"> 作为占位实现。
// 待 Tauri dialog 插件就绪后,可替换为原生对话框(@tauri-apps/plugin-dialog),
// 仅需替换函数体即可保持调用方接口不变。
// =====================================================================

/**
 * 选择一个数据库文件(*.db / *.sqlite / *.sqlite3)。
 * @returns 用户选择的文件绝对路径;取消时返回 null。
 *
 * 说明:浏览器环境下 input[type=file] 仅能拿到 File 对象,无法获取真正的
 * 绝对路径。此处回退为返回文件名,并允许用户在文本框中手动补全完整路径。
 * 在 Tauri 环境中应替换为原生 dialog,以拿到真实文件系统路径。
 */
export async function selectDatabaseFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.db,.sqlite,.sqlite3';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '-9999px';

    let settled = false;
    const cleanup = () => {
      input.remove();
      window.removeEventListener('focus', onFocus, true);
    };
    // 用户点取消时 input 不会触发 change,但窗口会重新获得焦点
    const onFocus = () => {
      // 给 change 事件一点缓冲,避免误判
      window.setTimeout(() => {
        if (!settled) {
          cleanup();
          resolve(null);
        }
      }, 300);
    };

    input.addEventListener('change', () => {
      settled = true;
      cleanup();
      const file = input.files?.[0];
      resolve(file ? file.name : null);
    });

    window.addEventListener('focus', onFocus, true);
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * 选择一个目录。
 * @returns 用户选择的目录路径;取消时返回 null。
 *
 * 说明:浏览器环境下 input[webkitdirectory] 只能拿到目录内相对路径前缀,
 * 无法获取真实的绝对路径。此处回退为返回该前缀(目录名)。
 * 在 Tauri 环境中应替换为原生 dialog 的目录选择模式。
 */
export async function selectDirectory(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    // 非标准属性,需要 as any 绕过 TS 类型检查
    (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory =
      true;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '-9999px';

    let settled = false;
    const cleanup = () => {
      input.remove();
      window.removeEventListener('focus', onFocus, true);
    };
    const onFocus = () => {
      window.setTimeout(() => {
        if (!settled) {
          cleanup();
          resolve(null);
        }
      }, 300);
    };

    input.addEventListener('change', () => {
      settled = true;
      cleanup();
      const file = input.files?.[0];
      // webkitRelativePath 形如 "mydir/file.txt",取第一段作为目录名
      const relPath = (file as unknown as { webkitRelativePath?: string })
        ?.webkitRelativePath;
      const dirName = relPath ? relPath.split('/')[0] : file?.name ?? null;
      resolve(dirName);
    });

    window.addEventListener('focus', onFocus, true);
    document.body.appendChild(input);
    input.click();
  });
}
