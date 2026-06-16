@echo off
setlocal

set "SCRIPT_DIR=%~dp0"

powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%SCRIPT_DIR%Check Server Status.ps1"

endlocal