'use strict';

/*
 * DESBLOQUEO MANUAL DEL MANTENIMIENTO (emergencia).
 *
 * Conecta a la base de datos usando tu .env local y apaga el modo
 * mantenimiento directamente a nivel de datos (equivalente al botón
 * "Apagar" del panel de soporte, pero sin entrar por la web, que está
 * bloqueada).
 *
 * Uso:
 *   node backend/scripts/desbloquear-mantenimiento.js
 *
 * Esto pone activo=false y limpia hasta/fechaProgramada/cuenta regresiva,
 * por lo que la app se desbloquea de inmediato.
 */

const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const connectDB = require(path.resolve(__dirname, '../src/config/db'));
const maintenanceService = require(path.resolve(__dirname, '../src/services/maintenance.service'));

async function main() {
  console.log('Conectando a la base de datos...');
  const conn = await connectDB();
  if (!conn) {
    console.error('ERROR: no se pudo conectar a MongoDB. Revisa MONGODB_URI en backend/.env');
    process.exit(1);
  }

  const antes = await maintenanceService.getState();
  console.log('\nEstado ANTES:');
  console.log('  mantenimientoActivo :', antes.mantenimientoActivo);
  console.log('  enCuentaRegresiva   :', antes.enCuentaRegresiva);
  console.log('  hasta               :', antes.hasta);
  console.log('  fechaProgramada     :', antes.fechaProgramada);
  console.log('  mensaje             :', antes.mensaje || '(vacío)');

  await maintenanceService.disable();

  const despues = await maintenanceService.getState();
  console.log('\nEstado DESPUÉS:');
  console.log('  mantenimientoActivo :', despues.mantenimientoActivo);
  console.log('  enCuentaRegresiva   :', despues.enCuentaRegresiva);
  console.log('  hasta               :', despues.hasta);
  console.log('  fechaProgramada     :', despues.fechaProgramada);
  console.log('  mensaje             :', despues.mensaje || '(vacío)');

  if (despues.mantenimientoActivo === false && despues.enCuentaRegresiva === false) {
    console.log('\n✅ MANTENIMIENTO DESACTIVADO. La app quedó desbloqueada.');
  } else {
    console.log('\n⚠️  El mantenimiento sigue activo. Revisa el diagnóstico.');
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error('Error inesperado:', e);
  process.exit(1);
});
