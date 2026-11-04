const fs = require('fs');
const p = 'C:/Users/oralia/OneDrive/Escritorio/paginas/INMOBILIARIA/frontend/pages/clients/clients.js';
let c = fs.readFileSync(p, 'utf8');
c = c.replace("          input.style.display = show ? 'block' : 'none';\n          input.required = show && requiredWhen.includes(select.value) && select.required;",
  "          input.style.display = 'block';\n          input.required = show && requiredWhen.includes(select.value) && select.required;");
c = c.replace("          if (!show) input.value = '';",
  "          // Permitir escribir en ambas opciones, no limpiar");
fs.writeFileSync(p, c);
console.log('done');
