const fs = require('fs');
const p = 'C:/Users/oralia/OneDrive/Escritorio/paginas/INMOBILIARIA/frontend/manifest.json';
let c = fs.readFileSync(p, 'utf8');
c = c.replace(/"icons":\s*\[[\s\S]*?\]/, '"icons": [\n    { "src": "LOGOICONO.jpeg", "sizes": "192x192", "type": "image/jpeg", "purpose": "any" },\n    { "src": "LOGOICONO.jpeg", "sizes": "512x512", "type": "image/jpeg", "purpose": "any maskable" }\n  ]');
fs.writeFileSync(p, c);
console.log('done');
