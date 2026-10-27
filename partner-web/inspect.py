import os
path = r'c:\Users\ireol\OneDrive\Documents\Pulse\pulse\partner-web\src\lib\api.ts'
with open(path, 'rb') as f:
    data = f.read()
print('File size:', len(data))
print('Null bytes:', data.count(0))
print('First 200 bytes:', data[:200])