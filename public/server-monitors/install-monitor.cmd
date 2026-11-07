@echo off
setlocal EnableExtensions
REM HammerByte Server Monitor installer — Windows Server 2012+
REM Double-click or Run as administrator.

cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting Administrator...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

set "INSTALL_DIR=%ProgramData%\HammerByte\ServerMonitor"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%" (
  echo Failed to create %INSTALL_DIR%
  pause
  exit /b 1
)

echo.
echo HammerByte Server Monitor installer
echo Install dir: %INSTALL_DIR%
echo.

REM Prefer local scripts if present next to this .cmd (offline / USB copy).
if exist "%~dp0supervisor.ps1" if exist "%~dp0agent.ps1" (
  echo Copying local scripts...
  copy /Y "%~dp0supervisor.ps1" "%INSTALL_DIR%\supervisor.ps1" >nul
  copy /Y "%~dp0agent.ps1" "%INSTALL_DIR%\agent.ps1" >nul
) else (
  echo Downloading scripts from hammerbyte.co.in ...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $ErrorActionPreference='Stop'; try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { [Net.ServicePointManager]::SecurityProtocol = [Enum]::ToObject([Net.SecurityProtocolType], 3072) }; $d=$env:INSTALL_DIR; if (-not $d) { $d='%INSTALL_DIR%' }; $w=New-Object System.Net.WebClient; $w.DownloadFile('https://hammerbyte.co.in/public/server-monitors/supervisor.ps1', (Join-Path $d 'supervisor.ps1')); $w.DownloadFile('https://hammerbyte.co.in/public/server-monitors/agent.ps1', (Join-Path $d 'agent.ps1')); Write-Host 'Download OK' } catch { Write-Host ('DOWNLOAD ERROR: ' + $_.Exception.Message); exit 1 }"
  if errorlevel 1 (
    echo.
    echo Download failed. Check internet / TLS 1.2 on this server.
    echo Or copy supervisor.ps1 and agent.ps1 into the same folder as this installer and run again.
    pause
    exit /b 1
  )
)

if not exist "%INSTALL_DIR%\supervisor.ps1" (
  echo supervisor.ps1 missing in %INSTALL_DIR%
  pause
  exit /b 1
)
if not exist "%INSTALL_DIR%\agent.ps1" (
  echo agent.ps1 missing in %INSTALL_DIR%
  pause
  exit /b 1
)

echo.
echo Starting supervisor...
powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_DIR%\supervisor.ps1" -Install
set "ERR=%ERRORLEVEL%"
echo.
echo Supervisor exited with code %ERR%
pause
exit /b %ERR%
