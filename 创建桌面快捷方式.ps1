$exePath = $PSScriptRoot + "\src-tauri\target\release\bilingual-speaking-coach.exe"
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = "$desktopPath\双语口语训练.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = $exePath
$Shortcut.WorkingDirectory = Split-Path $exePath
$Shortcut.Description = "双语并行口语训练智能体"
$Shortcut.Save()

Write-Host "桌面快捷方式已创建: $shortcutPath" -ForegroundColor Green
Write-Host "现在可以在桌面双击打开应用了" -ForegroundColor Green
Start-Sleep -Seconds 3