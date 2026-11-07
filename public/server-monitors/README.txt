HammerByte Windows agents (Server 2012+)
========================================
Stable build: 0.2.1-ps-stable (drive-sync) / 0.3.1-ps-stable (monitor)

DO NOT use supervisor.exe / agent.exe / drive-sync.exe on Server 2012.
Those Bun builds need Windows 10 / Server 2016+ (ClosePseudoConsole error).

ONE-TIME install on the TARGET/CHILD machine
--------------------------------------------
1. Download from https://hammerbyte.co.in/app/servers (or /public/server-monitors/):
     install-monitor.cmd
     install-drive-sync.cmd
   Optional offline: also put supervisor.ps1, agent.ps1, drive-sync.ps1 in the SAME folder.

2. Right-click install-monitor.cmd -> Run as administrator

3. Right-click install-drive-sync.cmd -> Run as administrator
   Banner must say: 0.2.0-ps-stable
   Installer deletes old config.json automatically.

4. Drive-sync prompts (example for \\192.168.0.6 shares g and h):
     Source host: 192.168.0.6
     Username / password for the shares
     How many drive pairs: 2
     Pair 1: share g  ->  G:\
     Pair 2: share h  ->  H:\
     Interval: 900 (or whatever you want)

After that, Task Scheduler runs it at boot. No need to redeploy unless the host
publishes a new VERSION.txt.

SOURCE SAFETY (live production)
-------------------------------
Drive sync is PULL ONLY: robocopy SOURCE UNC -> LOCAL disk on the child.
- Production/source files are never modified or deleted.
- /PURGE only removes extras on the LOCAL destination.
- Destination must be a local fixed/removable drive letter (not a network map).
- Prefer a READ-ONLY share account on the production server.

INCREMENTAL COPY
----------------
Robocopy does NOT re-copy every file every cycle.
- First run: copies everything missing on the child (can take a long time).
- Later runs: only NEW or CHANGED files (size/timestamp) transfer; unchanged are skipped.
- Extras on the LOCAL destination only may be deleted to match source (/PURGE).

Offline install
---------------
Copy these files into one folder, then run the .cmd as Administrator:
  install-monitor.cmd + supervisor.ps1 + agent.ps1
  install-drive-sync.cmd + drive-sync.ps1

Install locations
-----------------
  Monitor:    %ProgramData%\HammerByte\ServerMonitor
  Drive sync: %ProgramData%\HammerByte\DriveSync
  Logs:       drive-sync.log / agent.log / supervisor.log in those folders

Tasks
-----
  HammerByteServerMonitor
  HammerByteDriveSync

If download fails
-----------------
Enable TLS 1.2 (Server 2012), or use the offline copy method above.
PowerShell check:  $PSVersionTable.PSVersion
Should be 3.0 or higher (Server 2012 default is 3.0).
