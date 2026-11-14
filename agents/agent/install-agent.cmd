@echo off
setlocal
title HammerByte Agent installer

net session >nul 2>&1
if errorlevel 1 (
    echo.
    echo  Please right-click install-agent.cmd and choose "Run as administrator".
    echo.
    pause
    exit /b 1
)

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if exist "%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe" set "PS=%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe"

if not exist "%~dp0agent.ps1" (
    echo  agent.ps1 was not found next to this file. Extract the whole zip first.
    pause
    exit /b 1
)

"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0agent.ps1" -Install
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
    echo  Done.
) else (
    echo  Install failed with exit code %RC%. See %ProgramData%\HammerByte\logs
)
pause
exit /b %RC%
