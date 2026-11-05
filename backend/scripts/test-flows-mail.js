'use strict';

// Comprueba los correos reales de cada flujo (no solo el generico).
// Uso (desde backend):
//   node scripts/test-flows-mail.js destino@correo.com

require('dotenv').config();

const {
  sendMailDetailed,
  mailStatus,
  mailPasswordResetCode,
  mailAccessRequestApproved,
  mailWelcome,
  mailNewsletterCampaign,
} = require('../src/services/mail.service');

async function main() {
  const to = String(process.argv[2] || process.env.MAIL_TEST_TO || process.env.SMTP_USER || '').trim();
  if (!to) {
    console.error('Uso: node scripts/test-flows-mail.js destino@correo.com');
    process.exit(1);
  }

  const status = mailStatus();
  console.log('Proveedor:', status.provider, '| Configurado:', status.configured);
  if (!status.configured) {
    console.error('No hay proveedor configurado: los correos se simularan y NO llegaran.');
  }

  const samples = [
    ['Codigo de recuperacion', mailPasswordResetCode({ name: 'Prueba', email: to, code: '123456' })],
    ['Credenciales de acceso', mailAccessRequestApproved({
      name: 'Prueba',
      email: to,
      username: 'prueba.asesor',
      password: 'Temporal2026!',
    })],
    ['Bienvenida al boletin', mailWelcome(to, 'Prueba')],
    ['Campana del boletin', mailNewsletterCampaign({
      email: to,
      name: 'Prueba',
      subject: 'Novedades de INMOBLES',
      intro: 'Este es un ejemplo de campana del boletin.',
      message: 'Contenido de ejemplo para comprobar el envio de campanas.\n\nSaludos del equipo de INMOBLES.',
    })],
  ];

  let failures = 0;
  for (const [label, mail] of samples) {
    const result = await sendMailDetailed({ ...mail, subject: `[PRUEBA] ${mail.subject}` });
    if (!result.sent) failures += 1;
    console.log(`${result.sent ? 'OK  ' : 'FALLO'} ${label} -> ${to}${result.error ? ` (${result.error})` : ''}`);
  }

  console.log(`\nResumen: ${samples.length - failures}/${samples.length} correos enviados.`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error('Error inesperado:', error);
  process.exit(1);
});
