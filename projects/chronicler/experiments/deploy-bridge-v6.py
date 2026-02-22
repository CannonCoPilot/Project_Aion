"""Deploy chronicler-bridge.lua v6 to HomeServer via SMB."""
import io
from impacket.smbconnection import SMBConnection

HOST = '192.168.4.194'
USER = 'Nathaniel'
PASS = 'DwarfF0rtress'
SHARE = 'Users'

BRIDGE_SRC = '/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/dfhack/scripts/chronicler-bridge.lua'
BRIDGE_DST = 'Nathaniel/dfhack-scripts/chronicler-bridge.lua'

conn = SMBConnection(HOST, HOST, sess_port=445, timeout=10)
conn.login(USER, PASS, domain='')

# Upload bridge Lua script
with open(BRIDGE_SRC, 'rb') as f:
    data = f.read()

conn.putFile(SHARE, BRIDGE_DST, io.BytesIO(data).read)
print(f'Uploaded chronicler-bridge.lua ({len(data)} bytes) to dfhack-scripts/')

# Verify
files = conn.listPath(SHARE, 'Nathaniel/dfhack-scripts/*')
for f in files:
    name = f.get_longname()
    if not name.startswith('.'):
        print(f'  {f.get_filesize():>10}  {name}')

conn.logoff()
print('\nDone. Bridge v6 deployed. Restart repeat job in DFHack:')
print('  repeat --cancel chronicler')
print('  repeat --name chronicler --time 100 --timeUnits ticks --command [ chronicler-bridge ]')
