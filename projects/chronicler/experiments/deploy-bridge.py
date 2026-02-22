"""Deploy Chronicler bridge files to HomeServer via SMB."""
import io
from impacket.smbconnection import SMBConnection

HOST = '192.168.4.194'
USER = 'Nathaniel'
PASS = 'DwarfF0rtress'
SHARE = 'Users'

conn = SMBConnection(HOST, HOST, sess_port=445, timeout=10)
conn.login(USER, PASS, domain='')

# 1. README on Desktop
readme = (
    "Chronicler Bridge Setup Instructions\r\n"
    "=====================================\r\n\r\n"
    "Files deployed to: C:\\Users\\Nathaniel\\dfhack-scripts\\\r\n\r\n"
    "Step 1: In DFHack console, run this ONE TIME to add the script path:\r\n"
    "  script-paths add C:\\Users\\Nathaniel\\dfhack-scripts\r\n\r\n"
    "Step 2: Start the bridge (run in DFHack console each time you load a fort):\r\n"
    "  repeat --name chronicler --time 100 --timeUnits ticks --command [ chronicler-bridge ]\r\n\r\n"
    "Step 3: Start PowerShell HTTP server — right-click start-http-server.ps1 on Desktop,\r\n"
    "  select 'Run with PowerShell'.\r\n\r\n"
    "To verify: curl http://192.168.4.194:8888/chronicler-state.json from Mac.\r\n"
)
conn.putFile(SHARE, 'Nathaniel/Desktop/CHRONICLER-SETUP.txt',
             io.BytesIO(readme.encode('utf-8')).read)
print('Uploaded CHRONICLER-SETUP.txt to Desktop')

# 2. PowerShell HTTP server script (hardened v2 — survives client disconnects)
ps_script = (
    '# Chronicler HTTP Server v2 (Hardened)\r\n'
    '# Serves files from Dwarf Fortress directory on port 8888\r\n'
    '# Right-click -> Run with PowerShell (or run as Admin)\r\n'
    '#\r\n'
    '# v2 changes:\r\n'
    '#   - Per-request try/catch: client disconnects do not kill the server\r\n'
    '#   - Auto-restart: if listener dies, wait 3s and restart\r\n'
    '#   - StatusCode set before Write to avoid header-after-body errors\r\n'
    '#   - Request counter and uptime tracking\r\n\r\n'
    '$dfPath = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Dwarf Fortress"\r\n'
    '$port = 8888\r\n'
    '$requestCount = 0\r\n'
    '$errorCount = 0\r\n'
    '$startTime = Get-Date\r\n\r\n'
    'Write-Host "=== Chronicler HTTP Server v2 ===" -ForegroundColor Cyan\r\n'
    'Write-Host "Serving: $dfPath" -ForegroundColor Cyan\r\n'
    'Write-Host "Port:    $port" -ForegroundColor Cyan\r\n'
    'Write-Host "" \r\n\r\n'
    '# Outer restart loop — if listener crashes, restart after 3s\r\n'
    'while ($true) {\r\n'
    '    $listener = $null\r\n'
    '    try {\r\n'
    '        $listener = [System.Net.HttpListener]::new()\r\n'
    '        $listener.Prefixes.Add("http://+:${port}/")\r\n'
    '        $listener.Start()\r\n'
    '        Write-Host "[$(Get-Date -Format HH:mm:ss)] Listening on port $port... (Ctrl+C to stop)" -ForegroundColor Green\r\n\r\n'
    '        while ($listener.IsListening) {\r\n'
    '            $ctx = $listener.GetContext()\r\n'
    '            $requestCount++\r\n\r\n'
    '            # Per-request error handling — a single bad request never kills the server\r\n'
    '            try {\r\n'
    '                $file = $ctx.Request.Url.AbsolutePath.TrimStart("/")\r\n'
    '                if ([string]::IsNullOrEmpty($file)) { $file = "chronicler-state.json" }\r\n'
    '                $path = Join-Path $dfPath $file\r\n\r\n'
    '                if (Test-Path $path) {\r\n'
    '                    $bytes = [System.IO.File]::ReadAllBytes($path)\r\n'
    '                    $ctx.Response.StatusCode = 200\r\n'
    '                    $ctx.Response.ContentType = "application/json"\r\n'
    '                    $ctx.Response.ContentLength64 = $bytes.Length\r\n'
    '                    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)\r\n'
    '                    Write-Host "[$(Get-Date -Format HH:mm:ss)] 200 /$file ($($bytes.Length) bytes) [#$requestCount]" -ForegroundColor Green\r\n'
    '                } else {\r\n'
    '                    $msg = [System.Text.Encoding]::UTF8.GetBytes("Not found: $file")\r\n'
    '                    $ctx.Response.StatusCode = 404\r\n'
    '                    $ctx.Response.ContentLength64 = $msg.Length\r\n'
    '                    $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)\r\n'
    '                    Write-Host "[$(Get-Date -Format HH:mm:ss)] 404 /$file [#$requestCount]" -ForegroundColor Red\r\n'
    '                }\r\n'
    '            } catch {\r\n'
    '                # Client disconnected mid-response, file locked, or other I/O error\r\n'
    '                $errorCount++\r\n'
    '                Write-Host "[$(Get-Date -Format HH:mm:ss)] ERR /$file - $($_.Exception.Message) [errors: $errorCount]" -ForegroundColor Yellow\r\n'
    '            } finally {\r\n'
    '                # Always close the response stream, even on error\r\n'
    '                try { $ctx.Response.OutputStream.Close() } catch { }\r\n'
    '                try { $ctx.Response.Close() } catch { }\r\n'
    '            }\r\n'
    '        }\r\n\r\n'
    '    } catch [System.Net.HttpListenerException] {\r\n'
    '        Write-Host "[$(Get-Date -Format HH:mm:ss)] Listener error: $($_.Exception.Message)" -ForegroundColor Red\r\n'
    '        Write-Host "  Restarting in 3 seconds..." -ForegroundColor Yellow\r\n'
    '    } catch {\r\n'
    '        Write-Host "[$(Get-Date -Format HH:mm:ss)] Unexpected error: $($_.Exception.Message)" -ForegroundColor Red\r\n'
    '        Write-Host "  Restarting in 3 seconds..." -ForegroundColor Yellow\r\n'
    '    } finally {\r\n'
    '        if ($listener) {\r\n'
    '            try { $listener.Stop() } catch { }\r\n'
    '            try { $listener.Close() } catch { }\r\n'
    '        }\r\n'
    '    }\r\n\r\n'
    '    # Brief pause before restart to avoid tight error loops\r\n'
    '    $uptime = (Get-Date) - $startTime\r\n'
    '    Write-Host "[$(Get-Date -Format HH:mm:ss)] Server recycling (uptime: $($uptime.ToString(\"hh\\:mm\\:ss\")), requests: $requestCount, errors: $errorCount)" -ForegroundColor Cyan\r\n'
    '    Start-Sleep -Seconds 3\r\n'
    '}\r\n'
)
conn.putFile(SHARE, 'Nathaniel/Desktop/start-http-server.ps1',
             io.BytesIO(ps_script.encode('utf-8')).read)
print('Uploaded start-http-server.ps1 to Desktop')

# 3. Verify all files
print('\nDesktop files:')
files = conn.listPath(SHARE, 'Nathaniel/Desktop/*')
for f in files:
    name = f.get_longname()
    if 'CHRONICLER' in name.upper() or 'http-server' in name or 'dfhack' in name:
        print('  %10d  %s' % (f.get_filesize(), name))

print('\ndfhack-scripts:')
files = conn.listPath(SHARE, 'Nathaniel/dfhack-scripts/*')
for f in files:
    name = f.get_longname()
    if not name.startswith('.'):
        print('  %10d  %s' % (f.get_filesize(), name))

conn.logoff()
print('\nDone. All files deployed to HomeServer.')
