@echo off
setlocal EnableExtensions
REM HammerByte Drive Sync installer - Windows Server 2012+
REM Double-click or Run as administrator.
REM Preserves existing config.json on upgrade (only runs -Setup when missing).

cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting Administrator...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

set "INSTALL_DIR=%ProgramData%\HammerByte\DriveSync"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%" (
  echo Failed to create %INSTALL_DIR%
  pause
  exit /b 1
)

echo.
echo HammerByte Drive Sync installer
echo Install dir: %INSTALL_DIR%
echo.

if exist "%~dp0drive-sync.ps1" (
  echo Copying local drive-sync.ps1...
  copy /Y "%~dp0drive-sync.ps1" "%INSTALL_DIR%\drive-sync.ps1" >nul
) else (
  echo Downloading drive-sync.ps1 from hammerbyte.co.in ...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $ErrorActionPreference='Stop'; try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { [Net.ServicePointManager]::SecurityProtocol = [Enum]::ToObject([Net.SecurityProtocolType], 3072) }; $d='%INSTALL_DIR%'; $w=New-Object System.Net.WebClient; $w.DownloadFile('https://hammerbyte.co.in/public/server-monitors/drive-sync.ps1', (Join-Path $d 'drive-sync.ps1')); Write-Host 'Download OK' } catch { Write-Host ('DOWNLOAD ERROR: ' + $_.Exception.Message); exit 1 }"
  if errorlevel 1 (
    echo.
    echo Download failed. Check internet / TLS 1.2 on this server.
    echo Or copy drive-sync.ps1 into the same folder as this installer and run again.
    pause
    exit /b 1
  )
)

if not exist "%INSTALL_DIR%\drive-sync.ps1" (
  echo drive-sync.ps1 missing in %INSTALL_DIR%
  pause
  exit /b 1
)

echo.
echo Banner should say 0.2.3-ps-stable
if exist "%INSTALL_DIR%\config.json" (
  echo Existing config.json found - preserving credentials/pairs ^(upgrade mode^).
  echo Starting drive sync WITHOUT -Setup...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_DIR%\drive-sync.ps1"
) else (
  echo No config.json - starting first-time setup...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_DIR%\drive-sync.ps1" -Setup
)
set "ERR=%ERRORLEVEL%"
echo.
echo Drive sync exited with code %ERR%
pause
exit /b %ERR%
