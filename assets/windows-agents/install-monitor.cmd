@echo off
REM HammerByte Server Monitor installer (Windows Server 2012+)
REM Right-click -> Run as administrator, or double-click (will elevate).

net session >nul 2>&1
if %errorLevel% NEQ 0 (
  echo Requesting Administrator...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "INSTALL_DIR=%ProgramData%\HammerByte\ServerMonitor"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

echo Downloading HammerByte monitor scripts...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; ^
   Invoke-WebRequest -Uri 'https://hammerbyte.co.in/public/server-monitors/supervisor.ps1' -OutFile '%INSTALL_DIR%\supervisor.ps1' -UseBasicParsing; ^
   Invoke-WebRequest -Uri 'https://hammerbyte.co.in/public/server-monitors/agent.ps1' -OutFile '%INSTALL_DIR%\agent.ps1' -UseBasicParsing"

if not exist "%INSTALL_DIR%\supervisor.ps1" (
  echo Download failed.
  pause
  exit /b 1
)

echo Starting supervisor...
powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_DIR%\supervisor.ps1" -Install
pause
