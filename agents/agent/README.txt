HammerByte Agent __HB_VERSION__
==============================

Supported: Windows Server 2012 / 2012 R2 / 2016 / 2019 / 2022 / 2025, Windows 10 / 11.
Requires Windows PowerShell 3.0 or newer (built into every supported version).

INSTALL
  1. Extract the whole zip into any folder.
  2. Right-click install-agent.cmd and choose "Run as administrator".
  3. On HammerByte > Servers, approve the new machine (it shows as "Pending approval").
  4. Open the server, enable Monitoring and/or Drive Sync on their tabs and save the configuration.
     The agent picks up changes within about 10 seconds.

WHAT THE INSTALLER DOES
  - Copies the agent to C:\ProgramData\HammerByte\agent\agent.ps1 (folder readable by
    Administrators and SYSTEM only).
  - Adds a Microsoft Defender exclusion for C:\ProgramData\HammerByte.
  - Reuses the existing server tag (C:\ProgramData\HammerByte\.server-tag) or creates one.
  - Removes the old HammerByteServerMonitor / HammerByteDriveSync tasks and folders.
  - Registers the scheduled task "HammerByteAgent" (SYSTEM, at boot, watchdog every 5 minutes,
    restarts on failure).

HOW IT WORKS
  The agent asks HammerByte every 10 seconds what should run. Each enabled service runs as its own
  PowerShell process. When a configuration or script version changes, the agent stops that service
  immediately and starts it again with the new settings. The agent updates itself and rolls back
  automatically if a new version does not start.

LOGS (IST timestamps, kept 14 days)
  C:\ProgramData\HammerByte\logs\agent-YYYY-MM-DD.log
  C:\ProgramData\HammerByte\logs\monitor-YYYY-MM-DD.log
  C:\ProgramData\HammerByte\logs\drivesync-YYYY-MM-DD.log

USEFUL COMMANDS (elevated PowerShell)
  Status:     powershell -ExecutionPolicy Bypass -File C:\ProgramData\HammerByte\agent\agent.ps1 -Status
  Stop now:   schtasks /End /TN HammerByteAgent
  Start:      schtasks /Run /TN HammerByteAgent
  Uninstall:  powershell -ExecutionPolicy Bypass -File C:\ProgramData\HammerByte\agent\agent.ps1 -Uninstall

  To stop services without touching the machine, pause the agent or disable the service on the
  HammerByte server page.

DRIVE SYNC
  Pull-only mirror. Each pair copies \\<source host>\<share> onto a local folder. The source is
  only read, never changed. Files that no longer exist at the source are deleted from the LOCAL
  folder so it stays an exact copy. Unchanged files (same size and timestamp) are skipped.
  A pair is refused if the source is unreachable, if the source is empty while the local folder
  is not, or if the local folder is the system drive root or a Windows / Program Files folder.
