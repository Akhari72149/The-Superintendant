@echo off
setlocal enabledelayedexpansion

for /L %%S in (1,1,6) do (
    set /A PORT=1900 + %%S * 100
    set "WINDOW_TITLE=Arma 3 Console version 2.20.152984 x64 : port !PORT!"

    tasklist /v /fi "WINDOWTITLE eq !WINDOW_TITLE!" | find /i "!WINDOW_TITLE!" >nul

    if !errorlevel! equ 0 (
        echo Server %%S is online
    ) else (
        echo Server %%S is offline
    )
)

endlocal