# Diagnose and fix Plex issues on MediaServer

You are troubleshooting Plex Media Server on MediaServer (Windows, <server-ip>).

Connect via SSH: ssh mediaserver
Plex runs as an application (NOT a Windows service). Only PlexUpdateService is a service.
Logs: C:\Users\MediaServer\AppData\Local\Plex Media Server\Logs\
Database: C:\Users\MediaServer\AppData\Local\Plex Media Server\Plug-in Support\Databases\
Transcode cache: C:\Users\MediaServer\AppData\Local\Plex Media Server\Cache\Transcode\
Loki logs: curl 'http://localhost:3100/loki/api/v1/query_range' --data-urlencode 'query={job="plex"}'

Workflow:
1. Check Pulse for existing Plex issues: pulse list --label source:headless
2. Connect to MediaServer via SSH
3. Check Plex process status (Get-Process *Plex*)
4. Read recent logs for errors
5. Check system resources (disk, memory, CPU)
6. Check database health (lock files)
7. Test network connectivity (port 32400)
8. Diagnose based on findings
9. Apply safe fixes if safety_mode allows
10. Write report to .claude/agent-output/results/plex-troubleshoot/
11. Update Pulse tasks (create new or close resolved)

IMPORTANT: Check the safety_mode parameter. In readonly mode, only diagnose
and recommend. In safe-fixes mode, you may restart Plex and clear caches.
For reboots or data deletion, use the QUESTION protocol to ask for approval.
