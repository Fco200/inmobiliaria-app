'use strict';

// Gestor único de los PDFs de formatos. Lo usan Formatos (/api/formatos) y el
// panel de Soporte (/api/soporte/plantillas), así que ambos ven y modifican los
// mismos archivos.
//
// Hay dos orígenes:
//  - "disco": la carpeta ./plantillas del repositorio (formatos base y, en modo
//    local, los subidos).
//  - "nube": PDFs subidos en el almacenamiento persistente (GridFS), con la
//    clave plantillas/<archivo>. Sobreviven a reinicios y despliegues.

const fs = require('fs');
const path = require('path');
const storage = require('./storage.service');

const PLANTILLAS_DIR = path.join(__dirname, '../../../plantillas');
const PREFIX = storage.SHARED_PREFIX;

if (!fs.existsSync(PLANTILLAS_DIR)) {
  fs.mkdirSync(PLANTILLAS_DIR, { recursive: true });
}

const isPdf = (name) => /\.pdf$/i.test(String(name || ''));

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// Lista todos los PDFs (disco + nube) sin repetir nombres.
async function listAll() {
  const items = new Map();

  if (fs.existsSync(PLANTILLAS_DIR)) {
    fs.readdirSync(PLANTILLAS_DIR).filter(isPdf).forEach((archivo) => {
      const stat = fs.statSync(path.join(PLANTILLAS_DIR, archivo));
      items.set(archivo, {
        archivo,
        tamaño: stat.size,
        modificado: stat.mtime,
        origen: 'disco',
      });
    });
  }

  let remote = [];
  try {
    remote = await storage.listFilesByPrefix(PREFIX);
  } catch (error) {
    console.warn('[Plantillas] No se pudieron listar los PDFs en la nube:', error.message);
  }
  remote.forEach((file) => {
    const archivo = file.filename.slice(PREFIX.length);
    if (!isPdf(archivo) || items.has(archivo)) return;
    items.set(archivo, {
      archivo,
      tamaño: file.length || 0,
      modificado: file.uploadDate,
      origen: 'nube',
    });
  });

  return Array.from(items.values());
}

// Busca un PDF por su nombre exacto de archivo.
async function findByArchivo(archivo) {
  const safe = path.basename(String(archivo || ''));
  if (!isPdf(safe)) return null;

  const diskPath = path.join(PLANTILLAS_DIR, safe);
  if (fs.existsSync(diskPath)) {
    return { origen: 'disco', archivo: safe, path: diskPath };
  }
  if (await storage.fileExists(PREFIX + safe).catch(() => false)) {
    return { origen: 'nube', archivo: safe, key: PREFIX + safe };
  }
  return null;
}

// Busca un PDF por el identificador de la plantilla (nombre sin extensión,
// comparado en NFC para no depender del sistema de archivos).
async function findById(id, normalize = (s) => String(s).normalize('NFC')) {
  const target = normalize(id);
  const items = await listAll();
  const found = items.find((item) => normalize(item.archivo.replace(/\.pdf$/i, '')) === target);
  return found ? findByArchivo(found.archivo) : null;
}

// Envía el PDF al cliente (descarga como adjunto).
async function send(req, res, found, downloadName) {
  if (found.origen === 'disco') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName || found.archivo)}"`);
    return res.sendFile(found.path);
  }
  return storage.serveKey(req, res, found.key);
}

// Guarda un PDF recién subido (multer lo deja en la carpeta de plantillas).
// Si ya existe con ese nombre en la nube, se descarta y se responde 409.
async function saveUpload(file) {
  const archivo = path.basename(file.filename);
  const key = PREFIX + archivo;

  if (await storage.fileExists(key).catch(() => false)) {
    try { fs.unlinkSync(file.path); } catch (e) { /* ya no existe */ }
    throw httpError(409, 'Ya existe una plantilla con ese nombre. Cambia el nombre del archivo y vuelve a subirlo.');
  }

  await storage.putFile(key, file.path, 'application/pdf');
  // Con almacenamiento persistente (GridFS o R2) el PDF ya quedó guardado; la
  // copia del disco se quita porque se pierde en cada despliegue.
  if (storage.getMode() !== 'local') {
    try { fs.unlinkSync(file.path); } catch (e) { /* ya no existe */ }
  }
  return archivo;
}

// Elimina el PDF de todos los lugares donde exista.
async function remove(found) {
  if (found.origen === 'disco') {
    fs.unlinkSync(found.path);
  }
  await storage.deleteFile(PREFIX + found.archivo);
}

// Renombra el PDF en todos los lugares donde exista.
async function rename(found, nuevoArchivo) {
  const destinoDisco = path.join(PLANTILLAS_DIR, nuevoArchivo);
  if (found.origen === 'disco') {
    fs.renameSync(found.path, destinoDisco);
  }

  const oldKey = PREFIX + found.archivo;
  const newKey = PREFIX + nuevoArchivo;
  if (found.origen === 'nube' || await storage.fileExists(oldKey).catch(() => false)) {
    const buffer = await storage.readFileBuffer(oldKey);
    if (buffer) {
      await storage.putBuffer(newKey, buffer, 'application/pdf');
      await storage.deleteFile(oldKey);
    }
  }
}

// Comprueba que un nombre nuevo esté libre (ni en disco ni en la nube).
async function nameIsFree(archivo) {
  return !(await findByArchivo(archivo));
}

module.exports = {
  PLANTILLAS_DIR,
  listAll,
  findByArchivo,
  findById,
  send,
  saveUpload,
  remove,
  rename,
  nameIsFree,
  httpError,
};
