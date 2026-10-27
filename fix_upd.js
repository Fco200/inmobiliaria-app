const fs = require('fs');
const p = 'C:/Users/oralia/OneDrive/Escritorio/paginas/INMOBILIARIA/frontend/pages/updates/updates.js';
let c = fs.readFileSync(p, 'utf8');
c = c.replace('<ol class="updates-changelog">',
  '<ol class="updates-changelog" style="list-style-type:disc;padding-left:20px;">');
fs.writeFileSync(p, c);
console.log('ok');
