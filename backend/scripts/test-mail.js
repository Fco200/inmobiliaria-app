'use strict';

// Prueba manual del correo saliente.
// Uso (desde la carpeta backend):
//   node scripts/test-mail.js destino@correo.com
// Sirve para comprobar el proveedor configurado y ver el error exacto si falla.

require('dotenv').config();

const { sendMailDetailed, mailStatus } = require('../src/services/mail.service');

async function main() {
  const to = String(process.argv[2] || process.env.MAIL_TEST_TO || process.env.SMTP_USER || '').trim();
  if (!to) {
    console.error('Uso: node scripts/test-mail.js destino@correo.com');
    process.exit(1);
  }

  const status = mailStatus();
  console.log('Configuracion de correo:');
  console.log(JSON.stringify(status, null, 2));
  if (!status.configured) {
    console.error('\nNo hay proveedor configurado: el correo se simulara y NO llegara.');
  }

  console.log(`\nEnviando prueba a ${to}...`);
  const result = await sendMailDetailed({
    to,
    subject: 'Prueba de correo de INMOBLES',
    text: 'Este es un correo de prueba del CRM INMOBLES. Si lo recibes, el envio funciona.',
    html: `<!doctype html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#2d1048;">
  <h2 style="margin:0 0 12px;">Prueba de correo</h2>
  <p style="font-size:14px;line-height:1.6;">Este es un correo de prueba del <strong>CRM INMOBLES</strong>.</p>
  <p style="font-size:14px;line-height:1.6;">Si lo recibes, el envio de correo funciona correctamente.</p>
</body></html>`,
  });

  console.log('\nResultado:');
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.sent ? 0 : 1);
}

main().catch((error) => {
  console.error('Error inesperado:', error);
  process.exit(1);
});
