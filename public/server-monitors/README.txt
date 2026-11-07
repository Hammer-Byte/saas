HammerByte Windows agents (Server 2012+)
========================================

DO NOT use supervisor.exe / agent.exe / drive-sync.exe on Server 2012.
Those Bun builds need Windows 10 / Server 2016+ (ClosePseudoConsole error).

Install on the TARGET/CHILD machine
-----------------------------------
1. Download from https://hammerbyte.co.in/app/servers :
   - install-monitor.cmd
   - install-drive-sync.cmd
   (optional) supervisor.ps1, agent.ps1, drive-sync.ps1 into the SAME folder

2. Right-click install-monitor.cmd -> Run as administrator
3. Right-click install-drive-sync.cmd -> Run as administrator and answer setup prompts

Offline install
---------------
Copy these files into one folder, then run the .cmd as Administrator:
  install-monitor.cmd + supervisor.ps1 + agent.ps1
  install-drive-sync.cmd + drive-sync.ps1

Install locations
-----------------
  Monitor:    %ProgramData%\HammerByte\ServerMonitor
  Drive sync: %ProgramData%\HammerByte\DriveSync

Tasks
-----
  HammerByteServerMonitor
  HammerByteDriveSync

If download fails
-----------------
Enable TLS 1.2 (Server 2012), or use the offline copy method above.
PowerShell check:  $PSVersionTable.PSVersion
Should be 3.0 or higher (Server 2012 default is 3.0).
