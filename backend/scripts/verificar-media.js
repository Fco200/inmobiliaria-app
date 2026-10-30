'use strict';

/*
 * VERIFICACIÓN DE MEDIA: busca fotos/documentos que están referenciados en la
 * base de datos (Property.photos, User.photo y demás campos /uploads/...) pero
 * cuyo archivo físico NO existe en el almacenamiento (GridFS, R2 o disco).
 *
 * Estas referencias "huérfanas" se ven como imágenes rotas (placeholder "Sin
 * foto") y este script te dice exactamente dónde están para que puedas
 * re-subirlas desde el módulo correspondiente (Propiedades → Fotos).
 *
 * Uso (desde backend/):
 *   node scripts/verificar-media.js
 *
 * Opciones:
 *   --dry   Solo modo lectura (no modifica nada) [por defecto].
 *   Sin flags extra no borra nada jamás: es solo un reporte.
 *
 * Cobertura: properties.photos, users.photo. Salta URLs externas (https://…)
 * y data:/blob: (QR local, avatares), que no viven en el almacenamiento.
 */

const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const connectDB = require(path.resolve(__dirname, '../src/config/db'));
const storage = require(path.resolve(__dirname, '../src/services/storage.service'));
const { Property, User } = require(path.resolve(__dirname, '../src/models'));

function cleanKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(data|blob):/i.test(raw)) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  // En la BD las rutas se guardan como "/uploads/<archivo>", pero en el
  // almacenamiento (GridFS/R2) y en el disco la clave es solo "<archivo>"
  // (la ruta /uploads se monta en Express y no forma parte del nombre). Se
  // quita el prefijo para que la comprobación de existencia coincida.
  return raw.replace(/^\/+/, '').replace(/^uploads\//i, '');
}

function isRemote(raw) {
  return /^https?:\/\//i.test(String(raw || '').trim());
}

async function main() {
  console.log('Conectando a MongoDB...');
  const conn = await connectDB();
  if (!conn) {
    console.error('ERROR: no se pudo conectar a MongoDB. Revisa MONGODB_URI en backend/.env');
    process.exit(1);
  }

  const mode = storage.getMode();
  console.log(`\nModo de almacenamiento: ${mode}\n`);

  const references = []; // { entity, id, label, file }

  const properties = await Property.find({
    $or: [{ photos: { $exists: true, $ne: [] } }],
  }).select('photos folio type operationType zone city address').lean();

  for (const p of properties) {
    const label = [p.folio, p.type, p.operationType, [p.zone, p.city].filter(Boolean).join(', ')]
      .filter(Boolean)
      .join(' · ');
    for (const photo of p.photos || []) {
      if (photo) references.push({ entity: 'Propiedad', id: p._id, label, file: photo });
    }
  }

  const users = await User.find({ photo: { $exists: true, $ne: null, $ne: '' } })
    .select('photo name email')
    .lean();
  for (const u of users) {
    const label = [u.name, u.email].filter(Boolean).join(' · ');
    if (u.photo) references.push({ entity: 'Usuario', id: u._id, label, file: u.photo });
  }

  // Deduplicar por archivo referenciado (un archivo cuenta una sola vez).
  const seen = new Map(); // file key -> { count, refs: [] }
  for (const ref of references) {
    const key = cleanKey(ref.file);
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, { count: 0, refs: [] });
    const entry = seen.get(key);
    entry.count += 1;
    entry.refs.push(ref);
  }

  const problems = [];
  let checked = 0;

  for (const [key, entry] of seen) {
    if (isRemote(key)) continue; // URL externa: no se puede comprobar localmente
    checked += 1;
    const ok = await storage.fileExists(key);
    if (!ok) {
      problems.push({ file: key, refs: entry.refs });
    }
  }

  console.log(`Referencias locales comprobadas: ${checked}`);
  console.log(`Archivos FALTANTES en el almacenamiento: ${problems.length}\n`);

  problems.forEach((p) => {
    console.log(`✖ FALTA: ${p.file}`);
    p.refs.forEach((r) => console.log(`    ↳ ${r.entity} "${r.label}" (id: ${r.id})`));
  });

  if (!problems.length) {
    console.log('✔ Todo el media referenciado existe en el almacenamiento.');
  } else {
    console.log('\nPara recuperar estas imágenes: re-súbelas desde el módulo de');
    console.log('Propiedades (botón Fotos) o desde Mi perfil, y se guardarán de nuevo.');
  }

  await mongoose.disconnect();
  process.exit(problems.length ? 1 : 0);
}

main().catch((e) => {
  console.error('Error inesperado:', e);
  process.exit(1);
});