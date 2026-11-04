const fs = require('fs');
const p = 'C:/Users/oralia/OneDrive/Escritorio/paginas/INMOBILIARIA/frontend/js/appVersion.js';
let c = fs.readFileSync(p, 'utf8');
const old = '<p style="margin-top:0;">Hola <strong>${UI.escapeHtml((window.ApiClient && ApiClient.getStoredUser() && ApiClient.getStoredUser().name) || \'\')}</strong>, tu CRM se acaba de actualizar. Estas son algunas de las novedades:</p>';
const neu = '<p style="margin-top:0;">Hola <strong>${UI.escapeHtml((window.ApiClient && ApiClient.getStoredUser() && ApiClient.getStoredUser().name) || \'\')}</strong>, hay una nueva actualización disponible. <strong>Puntos de la actualización:</strong></p>';
if (c.includes(old)) {
  c = c.replace(old, neu);
  fs.writeFileSync(p, c);
  console.log('done');
} else {
  console.log('skip');
}
