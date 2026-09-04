'use strict';

/*
 * MIGRACIÓN: archivos de /uploads (disco local) → MongoDB/Atlas (GridFS).
 *
 * Sube a la base de datos (colecciones uploads.files/uploads.chunks) todos los
 * archivos que estén guardados en backend/uploads del disco local, para que las
 * fotos/documentos ya existentes sobrevivan a un redespliegue sin depender de
 * otro servicio.
 *
 * Uso (desde la raíz del proyecto o desde backend/):
 *   node backend/scripts/migrar-uploads-a-gridfs.js
 *
 * Opciones:
 *   --borrar   Borra el archivo local después de subirlo con éxito.
 *   --dry      Solo muestra qué se subiría, sin escribir nada.
 *
 * Notas:
 *   - Requiere conexión a MongoDB/Atlas (backend/.env → MONGODB_URI).
 *   - Salta los archivos que ya existen en GridFS (re-ejecutable).
 *   - No borra el origen por defecto (usa --borrar si quieres limpiar el disco).
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Activa el modo mongodb ANTES de cargar el servicio de almacenamiento.
process.env.STORAGE_DRIVER = 'mongodb';

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const UPLOADS_DIR = path.resolve(__dirname, '../uploads');
const connectDB = require(path.resolve(__dirname, '../src/config/db'));
const storage = require(path.resolve(__dirname, '../src/services/storage.service'));

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', pjpeg: 'image/jpeg', pjp: 'image/jpeg',
  png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif',
  heic: 'image/heic', heif: 'image/heif', tiff: 'image/tiff', tif: 'image/tiff',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain', csv: 'text/csv',
};

function contentTypeFor(fileName) {
  const ext = path.extname(fileName || '').slice(1).toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

function listFiles(dir) {
  try {
    return fs.readdirSync(dir);
  } catch (error) {
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dontTouch = args.includes('--dry');
  const deleteLocal = args.includes('--borrar') && !dontTouch;

  console.log('Conectando a MongoDB...');
  const conn = await connectDB();
  if (!conn) {
    console.error('ERROR: no se pudo conectar a MongoDB. Revisa MONGODB_URI en backend/.env');
    process.exit(1);
  }
  if (storage.getMode() === 'local') {
    console.error('ERROR: el modo de almacenamiento es "local", no "mongodb". No se migra nada.');
    await mongoose.disconnect();
    process.exit(1);
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    console.log(`No existe ${UPLOADS_DIR}: no hay nada que migrar.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  const names = listFiles(UPLOADS_DIR).filter((n) => fs.statSync(path.join(UPLOADS_DIR, n)).isFile());

  console.log(`\nModo almacenamiento: ${storage.getMode()}`);
  console.log(`Archivos encontrados en disco: ${names.length}${dontTouch ? '  (simulación --dry)' : ''}\n`);

  let subidos = 0;
  let omitidos = 0;
  let fallidos = 0;

  for (const name of names) {
    const localPath = path.join(UPLOADS_DIR, name);
    const yaExiste = await storage.fileExists(name);
    if (yaExiste) {
      console.log(`↬ ya en GridFS   ${name}`);
      omitidos += 1;
      continue;
    }
    if (dontTouch) {
      console.log(`· se subiría    ${name}`);
      continue;
    }
    try {
      await storage.putFile(name, localPath, contentTypeFor(name));
      subidos += 1;
      console.log(`✔ subido        ${name}`);
      if (deleteLocal) {
        try { fs.unlinkSync(localPath); console.log(`  └ borrado local ${name}`); } catch (e) { /* ignorar */ }
      }
    } catch (error) {
      fallidos += 1;
      console.error(`✖ fallo         ${name}: ${error.message}`);
    }
  }

  console.log('\nResumen:');
  console.log(`  subidos : ${subidos}`);
  console.log(`  ya en BD: ${omitidos}`);
  console.log(`  fallidos: ${fallidos}`);
  if (dontTouch) console.log('  (modo --dry: no se escribió nada)');

  await mongoose.disconnect();
  process.exit(fallidos ? 1 : 0);
}

main().catch((e) => {
  console.error('Error inesperado:', e);
  process.exit(1);
});