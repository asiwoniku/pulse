import os
path = r'c:\Users\ireol\OneDrive\Documents\Pulse\pulse\partner-web\src\lib\api.ts'
with open(path, 'rb') as f:
    data = f.read()
clean = bytes(b for b in data if b != 0x00)
with open(path, 'wb') as f:
    f.write(clean)
print('Fixed: removed', len(data) - len(clean), 'null bytes')