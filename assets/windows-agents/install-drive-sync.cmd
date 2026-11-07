@echo off
REM HammerByte Drive Sync installer (Windows Server 2012+)
REM Right-click -> Run as administrator, or double-click (will elevate).

net session >nul 2>&1
if %errorLevel% NEQ 0 (
  echo Requesting Administrator...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "INSTALL_DIR=%ProgramData%\HammerByte\DriveSync"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

echo Downloading HammerByte drive-sync script...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; ^
   Invoke-WebRequest -Uri 'https://hammerbyte.co.in/public/server-monitors/drive-sync.ps1' -OutFile '%INSTALL_DIR%\drive-sync.ps1' -UseBasicParsing"

if not exist "%INSTALL_DIR%\drive-sync.ps1" (
  echo Download failed.
  pause
  exit /b 1
)

echo Starting drive sync setup...
powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_DIR%\drive-sync.ps1" -Setup
pause
