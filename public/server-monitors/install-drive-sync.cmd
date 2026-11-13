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

set "HB_ROOT=%ProgramData%\HammerByte"
set "INSTALL_DIR=%HB_ROOT%\DriveSync"
if not exist "%HB_ROOT%" mkdir "%HB_ROOT%"
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
echo Adding Windows Defender exclusions for %HB_ROOT% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $root=$env:ProgramData+'\HammerByte'; $paths=@($root, (Join-Path $root 'ServerMonitor'), (Join-Path $root 'DriveSync')); foreach($p in $paths){ if(-not (Test-Path $p)){ New-Item -ItemType Directory -Path $p -Force | Out-Null } }; try { Import-Module Defender -ErrorAction SilentlyContinue | Out-Null } catch {}; if(Get-Command Add-MpPreference -EA SilentlyContinue){ foreach($p in $paths){ try { Add-MpPreference -ExclusionPath $p -EA Stop } catch {} } }; foreach($reg in @('HKLM:\SOFTWARE\Microsoft\Windows Defender\Exclusions\Paths','HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender\Exclusions\Paths')){ try { if(-not (Test-Path $reg)){ New-Item -Path $reg -Force | Out-Null }; foreach($p in $paths){ New-ItemProperty -Path $reg -Name (($p.TrimEnd('\'))+'\') -Value 0 -PropertyType DWord -Force -EA Stop | Out-Null } } catch {} }; Write-Host 'Defender allowlist applied' } catch { Write-Host ('allowlist warn: '+$_.Exception.Message) }"

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

powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%INSTALL_DIR%' -Filter *.ps1 -EA SilentlyContinue | ForEach-Object { try { Unblock-File -LiteralPath $_.FullName -EA SilentlyContinue } catch {}; try { $ads=$_.FullName+':Zone.Identifier'; if(Test-Path -LiteralPath $ads){ Remove-Item -LiteralPath $ads -Force -EA SilentlyContinue } } catch {} }"

echo.
echo Banner should say 0.2.4-ps-stable
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
