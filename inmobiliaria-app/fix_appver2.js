const fs = require('fs');
const p = 'C:/Users/oralia/OneDrive/Escritorio/paginas/INMOBILIARIA/frontend/js/appVersion.js';
let c = fs.readFileSync(p, 'utf8');
c = c.replace('<ul style="margin:0;padding-left:18px;display:grid;gap:8px;">',
  '<ul style="margin:0;padding-left:18px;display:grid;gap:8px;list-style-type:disc;">');
fs.writeFileSync(p, c);
console.log('ok');
