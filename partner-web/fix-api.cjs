const fs = require('fs');
const path = 'c:\\Users\\ireol\\OneDrive\\Documents\\Pulse\\pulse\\partner-web\\src\\lib\\api.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(/\x00/g, '');
fs.writeFileSync(path, content);
console.log('Fixed api.ts - removed null bytes');