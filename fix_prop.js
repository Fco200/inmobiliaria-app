const fs = require('fs');
const p = 'C:/Users/oralia/OneDrive/Escritorio/paginas/INMOBILIARIA/backend/src/controllers/property.controller.js';
let c = fs.readFileSync(p, 'utf8');
// Force responsibleUser from session
if (c.includes("body.responsibleUser = req.user._id;")) {
  // Make sure it's set after merge
  c = c.replace("  body.responsibleUser = req.user._id;\n\n  const requestedFolio",
    "  // Forzar siempre el asesor de la sesión\n  body.responsibleUser = req.user._id;\n\n  const requestedFolio");
  fs.writeFileSync(p, c);
  console.log('done');
} else {
  console.log('skip');
}
