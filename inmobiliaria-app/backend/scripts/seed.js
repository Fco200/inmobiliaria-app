'use strict';

const connectDB = require('../src/config/db');
const seed = require('../src/services/seed.service');

async function main() {
  const connection = await connectDB();
  if (!connection) {
    console.error('No se pudo conectar a MongoDB. Revisa MONGODB_URI en .env');
    process.exit(1);
  }
  await seed();
  console.log('Seed completado.');
  await connection.close();
  process.exit(0);
}

main();
