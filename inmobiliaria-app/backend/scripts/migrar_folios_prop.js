'use strict';

// Normaliza los folios de las propiedades al formato `YYYY-###`, convierte los
// estados heredados y ajusta las etapas viejas de los negocios.
//
// Es IDEMPOTENTE: se puede ejecutar las veces que haga falta. El servidor
// también lo corre automáticamente al arrancar, pero este script permite
// lanzarlo a mano (por ejemplo, después de restaurar un respaldo).
//
// Uso:  npm run migrate:folios
//   o: node scripts/migrar_folios_prop.js

const connectDB = require('../src/config/db');
const { runDataMigrations } = require('../src/services/migration.service');

async function migrar() {
  const conn = await connectDB();
  if (!conn) {
    console.error('No hay conexión con MongoDB: no se pudo ejecutar la migración.');
    return false;
  }

  const result = await runDataMigrations({ log: true });
  const folios = result.folios || {};
  const statuses = result.statuses || {};
  const stages = result.stages || {};

  console.log('[Migración] Folios:', folios.error || `${folios.updated || 0} actualizado(s) de ${folios.total || 0}.`);
  console.log('[Migración] Estados:', statuses.error || `${statuses.updated || 0} actualizado(s).`);
  console.log('[Migración] Etapas:', stages.error || `${stages.businesses || 0} negocio(s) y ${stages.stageRecords || 0} registro(s) de bitácora.`);

  await conn.close();
  return !folios.error && !statuses.error && !stages.error;
}

if (require.main === module) {
  migrar()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((error) => {
      console.error('[Migración] Error:', error.message);
      process.exit(1);
    });
}

module.exports = { migrar };
