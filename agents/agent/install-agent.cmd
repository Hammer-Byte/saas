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

set "HBROOT=%ProgramData%\HammerByte"
set "HBAGENT=%HBROOT%\agent\agent.ps1"

echo.
echo  Preparing %HBROOT% ...
mkdir "%HBROOT%\agent" 2>nul
mkdir "%HBROOT%\logs" 2>nul
mkdir "%HBROOT%\run" 2>nul
mkdir "%HBROOT%\services" 2>nul
mkdir "%HBROOT%\cache" 2>nul

rem Antivirus (Defender AMSI) blocks agent.ps1 when run from Downloads.
rem Add the install folder exclusion FIRST, then copy and run from there.
echo  Adding Microsoft Defender exclusion for %HBROOT% ...
"%PS%" -NoProfile -ExecutionPolicy Bypass -Command "try { Add-MpPreference -ExclusionPath $env:ProgramData\HammerByte -ErrorAction Stop; Write-Output 'Defender exclusion OK' } catch { Write-Output ('Add-MpPreference: ' + $_.Exception.Message) }"
reg add "HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\Paths" /v "%HBROOT%" /t REG_DWORD /d 0 /f >nul 2>&1

copy /Y "%~dp0agent.ps1" "%HBAGENT%" >nul
if errorlevel 1 (
    echo  Could not copy agent.ps1 to %HBAGENT%
    pause
    exit /b 1
)

"%PS%" -NoProfile -ExecutionPolicy Bypass -Command "try { Unblock-File -LiteralPath (Join-Path $env:ProgramData 'HammerByte\agent\agent.ps1') -ErrorAction Stop } catch {}"

echo  Installing from %HBAGENT% ...
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%HBAGENT%" -Install
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
    echo  Done.
) else (
    echo  Install failed with exit code %RC%.
    echo  If antivirus still blocked the script:
    echo    1. Add an exclusion for %HBROOT%
    echo    2. Re-run this installer as Administrator
    echo  Logs: %HBROOT%\logs
)
pause
exit /b %RC%
