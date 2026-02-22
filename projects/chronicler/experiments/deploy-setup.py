"""Deploy Chronicler one-time setup script to HomeServer Desktop."""
import io
from impacket.smbconnection import SMBConnection

HOST = '192.168.4.194'
USER = 'Nathaniel'
PASS = 'DwarfF0rtress'
SHARE = 'Users'

conn = SMBConnection(HOST, HOST, sess_port=445, timeout=10)
conn.login(USER, PASS, domain='')

# One-time setup script — run as Administrator on HomeServer
# Does three things:
#   1. Adds firewall rule for port 8888 (HTTP bridge)
#   2. Adds script-paths line to onMapLoad.init
#   3. Adds repeat bridge command to onMapLoad.init
#   4. Adds 'show' to dfhack.init

setup_script = (
    '# Chronicler One-Time Setup\r\n'
    '# Right-click -> Run as Administrator\r\n'
    '#\r\n'
    '# This script:\r\n'
    '#   1. Opens firewall port 8888 for the HTTP bridge\r\n'
    '#   2. Configures DFHack to auto-load Chronicler bridge on fort load\r\n'
    '#   3. Adds "show" command to dfhack.init\r\n\r\n'
    '$ErrorActionPreference = "Continue"\r\n\r\n'
    '# Paths\r\n'
    '$dfDir = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Dwarf Fortress"\r\n'
    '$dfhackInit = Join-Path $dfDir "dfhack.init"\r\n'
    '$onMapLoad = Join-Path $dfDir "dfhack-config\\init\\onMapLoad.init"\r\n'
    '$scriptPaths = Join-Path $dfDir "dfhack-config\\script-paths.txt"\r\n\r\n'
    'Write-Host "=== Chronicler Setup ===" -ForegroundColor Cyan\r\n\r\n'
    '# 1. Firewall rule for port 8888\r\n'
    'Write-Host "1. Adding firewall rule for port 8888..." -ForegroundColor Yellow\r\n'
    '$existing = Get-NetFirewallRule -DisplayName "Chronicler HTTP" -ErrorAction SilentlyContinue\r\n'
    'if ($existing) {\r\n'
    '    Write-Host "   Already exists, skipping." -ForegroundColor Green\r\n'
    '} else {\r\n'
    '    New-NetFirewallRule -DisplayName "Chronicler HTTP" -Direction Inbound -Protocol TCP -LocalPort 8888 -Action Allow | Out-Null\r\n'
    '    Write-Host "   Created firewall rule: Chronicler HTTP (TCP 8888 inbound)" -ForegroundColor Green\r\n'
    '}\r\n\r\n'
    '# 2. Add script-paths entry\r\n'
    'Write-Host "2. Adding script path..." -ForegroundColor Yellow\r\n'
    '$spContent = ""\r\n'
    'if (Test-Path $scriptPaths) { $spContent = Get-Content $scriptPaths -Raw }\r\n'
    '$spLine = "+C:\\Users\\Nathaniel\\dfhack-scripts"\r\n'
    'if ($spContent -and $spContent.Contains($spLine)) {\r\n'
    '    Write-Host "   Already in script-paths.txt, skipping." -ForegroundColor Green\r\n'
    '} else {\r\n'
    '    Add-Content -Path $scriptPaths -Value "`r`n$spLine"\r\n'
    '    Write-Host "   Added to script-paths.txt: $spLine" -ForegroundColor Green\r\n'
    '}\r\n\r\n'
    '# 3. Add bridge repeat to onMapLoad.init\r\n'
    'Write-Host "3. Adding bridge to onMapLoad.init..." -ForegroundColor Yellow\r\n'
    '$omlContent = ""\r\n'
    'if (Test-Path $onMapLoad) { $omlContent = Get-Content $onMapLoad -Raw }\r\n'
    '$bridgeLine = "repeat --name chronicler --time 100 --timeUnits ticks --command [ chronicler-bridge ]"\r\n'
    'if ($omlContent -and $omlContent.Contains("chronicler")) {\r\n'
    '    Write-Host "   Already in onMapLoad.init, skipping." -ForegroundColor Green\r\n'
    '} else {\r\n'
    '    $block = "`r`n`r`n# Chronicler bridge - writes game state to JSON for remote polling`r`n$bridgeLine"\r\n'
    '    Add-Content -Path $onMapLoad -Value $block\r\n'
    '    Write-Host "   Added bridge repeat to onMapLoad.init" -ForegroundColor Green\r\n'
    '}\r\n\r\n'
    '# 4. Add "show" to dfhack.init\r\n'
    'Write-Host "4. Adding show to dfhack.init..." -ForegroundColor Yellow\r\n'
    '$diContent = ""\r\n'
    'if (Test-Path $dfhackInit) { $diContent = Get-Content $dfhackInit -Raw }\r\n'
    'if ($diContent -and $diContent.Contains("`nshow")) {\r\n'
    '    Write-Host "   Already in dfhack.init, skipping." -ForegroundColor Green\r\n'
    '} else {\r\n'
    '    Add-Content -Path $dfhackInit -Value "`r`n`r`n# Auto-show DFHack console`r`nshow"\r\n'
    '    Write-Host "   Added show to dfhack.init" -ForegroundColor Green\r\n'
    '}\r\n\r\n'
    'Write-Host "" \r\n'
    'Write-Host "=== Setup Complete ===" -ForegroundColor Cyan\r\n'
    'Write-Host "Next: restart DF/DFHack, load a fort, then run start-http-server.ps1" -ForegroundColor White\r\n'
    'Write-Host "Verify from Mac: curl http://192.168.4.194:8888/chronicler-state.json" -ForegroundColor White\r\n'
    'Write-Host "" \r\n'
    'Read-Host "Press Enter to close"\r\n'
)

conn.putFile(SHARE, 'Nathaniel/Desktop/chronicler-setup.ps1',
             io.BytesIO(setup_script.encode('utf-8')).read)
print('Uploaded chronicler-setup.ps1 to Desktop')

# Verify
files = conn.listPath(SHARE, 'Nathaniel/Desktop/*')
for f in files:
    name = f.get_longname()
    if 'chronicler' in name.lower() or 'http' in name.lower():
        print('  %10d  %s' % (f.get_filesize(), name))

conn.logoff()
print('Done.')
