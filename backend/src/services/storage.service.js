'use strict';

/**
 * Almacenamiento de archivos subidos (fotos de perfil, propiedades, documentos).
 *
 * Soporta tres modos (variable STORAGE_DRIVER del .env):
 *
 *   local   -> disco local del servidor en /uploads
 *              (default cuando no se configura nada más)
 *   r2      -> Cloudflare R2 (compatible con S3). Las fotos sobreviven a
 *              cualquier redespliegue. Requiere las credenciales R2_* del .env.
 *   mongodb -> guarda los archivos en la PROPIA base de datos MongoDB/Atlas
 *              usando GridFS. No requiere ningún servicio extra y las fotos
 *              también sobreviven a los redespliegues (la base va con la app).
 *
 * Si STORAGE_DRIVER queda vacío: se usa r2 si hay credenciales R2_* configuradas
 * y, en cualquier otro caso, mongodb (GridFS). NUNCA se cae a "local" por
 * defecto: el disco de Render es efímero y borraría las fotos en cada deploy.
 * Para usar el disco local hay que pedirlo explícitamente con STORAGE_DRIVER=local.
 *
 * En los modos nube/BD, multer sigue escribiendo primero en /uploads (temporal)
 * y luego el archivo se copia al destino persistente y se borra el temporal, así
 * los controladores no cambian en nada.
 *
 * El cliente S3 de R2 está implementado con Node puro (firma SigV4 de AWS) sin
 * dependencias externas; GridFS usa el driver nativo de mongodb que ya viene con
 * mongoose.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { Readable } = require('stream');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ── Configuración R2 (S3-compatible) ────────────────────────────────────────
const accountId = (process.env.R2_ACCOUNT_ID || '').trim();
const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim();
const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
const bucket = (process.env.R2_BUCKET || '').trim();
const region = (process.env.R2_REGION || 'auto').trim();
const overrideEndpoint = (process.env.R2_ENDPOINT || '').trim();

const r2Configured = Boolean(accountId && accessKeyId && secretAccessKey && bucket);

// ── Modo de almacenamiento ───────────────────────────────────────────────────
// mongodb | r2 | local (vacío = automático: r2 si hay credenciales, si no local).
const requestedDriver = (process.env.STORAGE_DRIVER || '').trim().toLowerCase();

function resolveMode() {
  if (requestedDriver === 'mongodb' || requestedDriver === 'mongo' || requestedDriver === 'db') {
    return 'mongodb';
  }
  if (requestedDriver === 'r2' || requestedDriver === 's3') {
    return 'r2';
  }
  if (requestedDriver === 'local' || requestedDriver === 'disk') {
    return 'local';
  }
  if (r2Configured) return 'r2';
  // Sin configuración explícita se usa SIEMPRE GridFS (MongoDB), nunca el disco
  // local: el disco de Render es efímero y borraría las fotos en cada
  // despliegue. MongoDB siempre está configurado (MONGODB_URI), así que este
  // default es persistente y no depende de NODE_ENV ni de variables extra.
  // El modo "local" queda reservado para cuando se solicita explícitamente
  // (STORAGE_DRIVER=local), p. ej. en desarrollo sin base de datos.
  return 'mongodb';
}

const mode = resolveMode();

function getMode() {
  return mode;
}

function isConfigured() {
  return mode !== 'local';
}

// ── GridFS (MongoDB) ─────────────────────────────────────────────────────────
const GRIDFS_BUCKET = 'uploads';

function gridfsBucket() {
  const db = mongoose.connection && mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB no está conectado (modo de almacenamiento "mongodb")');
  }
  return new GridFSBucket(db, { bucketName: GRIDFS_BUCKET });
}

function storeBufferToGridFS(key, buffer, contentType, metadata) {
  const gfs = gridfsBucket();
  return new Promise((resolve, reject) => {
    const stream = gfs.openUploadStream(key, { contentType: contentType || 'application/octet-stream', metadata: metadata || undefined });
    stream.on('error', reject);
    stream.on('finish', () => resolve({ id: stream.id, key }));
    stream.end(buffer);
  });
}

function storeFileToGridFS(key, localPath, contentType, metadata) {
  const gfs = gridfsBucket();
  return new Promise((resolve, reject) => {
    const source = fs.createReadStream(localPath);
    const stream = gfs.openUploadStream(key, { contentType: contentType || 'application/octet-stream', metadata: metadata || undefined });
    source.on('error', reject);
    stream.on('error', reject);
    stream.on('finish', () => resolve({ id: stream.id, key }));
    source.pipe(stream);
  });
}

function deleteGridFSByFilename(key) {
  const gfs = gridfsBucket();
  return gfs.find({ filename: key }).toArray().then((files) =>
    Promise.all(files.map((f) => gfs.delete(f._id).catch(() => {})))
  );
}

// ── Firmas SigV4 (AWS) ───────────────────────────────────────────────────────
function sha256hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function signingKey(dateStamp) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

// Codifica cada segmento de la ruta (S3 conserva las "/" como separadores).
function encodePath(key) {
  return String(key)
    .split('/')
    .map((seg) => encodeURIComponent(seg).replace(/%2F/gi, '/'))
    .join('/');
}

function canonicalQuery(query) {
  if (!query) return '';
  return Object.keys(query)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
    .join('&');
}

// Firma una petición y devuelve cabeceras de autorización listas para usar.
function authHeaders(method, key, query, payloadHash, amzDate) {
  const dateStamp = amzDate.slice(0, 8);
  const uri = `/${encodeURIComponent(bucket)}${encodePath(key) ? `/${encodePath(key)}` : ''}`;
  const host = hostname();
  const headers = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const signedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaders.map((h) => `${h}:${headers[h]}`).join('\n') + '\n';
  const canonicalRequest = [
    method,
    uri,
    canonicalQuery(query),
    canonicalHeaders,
    signedHeaders.join(';'),
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256hex(canonicalRequest),
  ].join('\n');

  const signature = hmac(signingKey(dateStamp), stringToSign).toString('hex');
  return {
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders.join(';')}, Signature=${signature}`,
    'X-Amz-Content-Sha256': payloadHash,
    'X-Amz-Date': amzDate,
  };
}

function amzNow() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Host del endpoint (el endpoint por defecto es el de Cloudflare R2).
function hostname() {
  if (overrideEndpoint) {
    return String(overrideEndpoint).replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }
  return `${accountId}.r2.cloudflarestorage.com`;
}

function endpointBase() {
  return `${(overrideEndpoint || `https://${accountId}.r2.cloudflarestorage.com`).replace(/\/+$/, '')}/${bucket}`;
}

// Realiza una petición HTTPS contra el bucket. Devuelve una promesa que
// resuelve { statusCode, headers, stream } cuando recibe los headers de
// respuesta. El cuerpo se consume manualmente por el llamador.
function request(method, key, { query = {}, headers = {}, payloadHash = null, readable = null, rawPath = null } = {}) {
  return new Promise((resolve, reject) => {
    const date = amzNow();
    const bodyHash = payloadHash || sha256hex(Buffer.alloc(0));
    const host = hostname();

    const pathname = rawPath || `/${encodeURIComponent(bucket)}${encodePath(key) ? `/${encodePath(key)}` : ''}`;
    const qs = canonicalQuery(query);
    const fullPath = qs ? `${pathname}?${qs}` : pathname;

    const auth = authHeaders(method, key, query, bodyHash, date);

    const reqOptions = {
      method,
      host,
      path: fullPath,
      headers: {
        ...auth,
        ...headers,
        Host: host,
      },
    };

    const req = https.request(reqOptions, (res) => {
      resolve({ statusCode: res.statusCode, headers: res.headers, stream: res });
    });
    req.on('error', reject);

    if (readable) {
      readable.on('error', reject);
      readable.pipe(req);
    } else {
      req.end();
    }
  });
}

// Lee el cuerpo completo de un stream (para errores / respuestas pequeñas).
function readAll(stream, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    stream.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        stream.destroy();
        return reject(new Error('Respuesta del almacenamiento demasiado grande'));
      }
      chunks.push(c);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// ── Operaciones públicas ────────────────────────────────────────────────────

// ── Referencias y limpieza de archivos huérfanos ──────────────────────────────
//
// Un archivo subido se guarda en el almacenamiento y DESPUÉS se referencia desde
// un registro (propiedad, documento, inventario...). Si ese paso falla (el
// usuario cancela, la creación del registro da error, se reintenta la captura),
// el archivo queda huérfano y ocupa espacio para siempre. Con un Atlas del
// nivel gratuito (512 MB) unos cuantos huérfanos de fotos de celular (5-8 MB)
// dejan la base de datos SIN ESPACIO y bloquean TODAS las escrituras.
//
// Por eso:
//   1) se deduplican los archivos idénticos (mismo contenido -> una sola copia),
//   2) se puede borrar un archivo solo si NINGÚN registro lo referencia,
//   3) hay una limpieza programada que borra los huérfanos antiguos.

// Campos de texto largo: no se recorren al buscar referencias (solo buscamos
// archivos, no datos) y son los que más memoria consumen al escanear.
const SCAN_SKIP_FIELDS = ['text', 'body', 'message', 'description', 'observations', 'notes', 'content'];

// Devuelve el nombre del archivo SOLO si la cadena apunta a nuestro almacén
// ("/uploads/x.jpg", "https://host/uploads/x.jpg?t=1", "uploads/x.jpg").
// Las URLs externas (otro dominio) devuelven '': nunca se confunden con un
// archivo propio ni se intentan borrar del almacén.
function fileKeyFromUrl(url) {
  if (!url) return '';
  const raw = String(url).trim();
  if (!raw || /^(data|blob):/i.test(raw)) return '';
  const marker = '/uploads/';
  const idx = raw.toLowerCase().indexOf(marker);
  if (idx < 0) {
    // Acepta la forma relativa sin barra inicial ("uploads/x.jpg").
    if (!/^uploads\//i.test(raw)) return '';
    return path.basename(raw.slice('uploads/'.length).split('?')[0].split('#')[0]);
  }
  return path.basename(raw.slice(idx + marker.length).split('?')[0].split('#')[0]);
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Recorre todas las colecciones y devuelve el conjunto de nombres de archivo
// que siguen en uso por algún registro.
//
// La base del CRM es pequeña (miles de documentos): recorrerla entera cada 2
// horas es barato y evita tener que mantener una lista de campos "con archivos"
// que se desincronizaría con el código. Aun así se limita el número de
// documentos leídos por colección para que un crecimiento inesperado no
// convierta la limpieza en una consulta gigantesca.
const SCAN_MAX_DOCS_PER_COLLECTION = 20000;

async function collectReferencedKeys() {
  const refs = new Set();
  const db = mongoose.connection && mongoose.connection.db;
  if (!db) return refs;
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  for (const c of collections) {
    if (c.name.startsWith('uploads.')) continue;
    const projection = {};
    for (const field of SCAN_SKIP_FIELDS) projection[field] = 0;
    let docs = [];
    try {
      docs = await db.collection(c.name).find({}, projection).limit(SCAN_MAX_DOCS_PER_COLLECTION).toArray();
    } catch (e) {
      continue;
    }
    const walk = (value) => {
      if (typeof value === 'string') {
        if (value.length > 400) return;
        const key = fileKeyFromUrl(value);
        if (key && /\.[a-z0-9]{2,5}$/i.test(key)) refs.add(key);
      } else if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach(walk);
      }
    };
    docs.forEach(walk);
  }
  return refs;
}

// ¿Sigue en uso este archivo? (lo referencia algún registro)
async function isFileReferenced(key) {
  if (!key) return false;
  const refs = await collectReferencedKeys();
  return refs.has(key);
}

// Borra un archivo SOLO si ningún registro lo referencia. Se usa al eliminar
// una propiedad o un documento: si otra ficha comparte la foto, se conserva.
// Ante cualquier duda (error al escanear) NO se borra: perder una foto de una
// ficha activa es mucho peor que dejar un archivo de más.
async function deleteFileIfUnused(key) {
  const cleanKey = fileKeyFromUrl(key) || key;
  // Solo se borran archivos con un nombre "de subida" (los que genera el
  // sistema). Un valor raro (URL externa, data:) nunca se toca.
  if (!cleanKey || !/^[A-Za-z0-9._-]+\.[a-z0-9]{2,5}$/i.test(cleanKey)) return false;
  try {
    const used = await isFileReferenced(cleanKey);
    if (used) return false;
  } catch (error) {
    console.warn('[Storage] No se pudo comprobar si el archivo está en uso:', error.message);
    return false;
  }
  await deleteFile(cleanKey);
  return true;
}

// Limpieza programada: borra los archivos huérfanos (sin referencia) que
// llevan un tiempo sin usarse, y los trozos de GridFS sin archivo.
async function cleanupOrphans({ minAgeMs = 6 * 60 * 60 * 1000 } = {}) {
  const result = { deleted: 0, freed: 0, orphanChunks: 0 };
  if (mode !== 'mongodb') return result;
  const db = mongoose.connection && mongoose.connection.db;
  if (!db) return result;

  try {
    const refs = await collectReferencedKeys();
    const cutoff = new Date(Date.now() - minAgeMs);
    const files = await db.collection('uploads.files').find({ uploadDate: { $lt: cutoff } }).toArray();
    for (const file of files) {
      if (refs.has(file.filename)) continue;
      await db.collection('uploads.files').deleteOne({ _id: file._id });
      await db.collection('uploads.chunks').deleteMany({ files_id: file._id });
      result.deleted += 1;
      result.freed += file.length || 0;
    }

    // Trozos (chunks) que se quedaron sin su archivo (subidas interrumpidas).
    const orphanChunks = await db.collection('uploads.chunks').aggregate([
      { $group: { _id: '$files_id' } },
      { $lookup: { from: 'uploads.files', localField: '_id', foreignField: '_id', as: 'file' } },
      { $match: { file: { $size: 0 } } },
    ]).toArray();
    for (const c of orphanChunks) {
      const res = await db.collection('uploads.chunks').deleteMany({ files_id: c._id });
      result.orphanChunks += res.deletedCount || 0;
    }
  } catch (error) {
    console.warn('[Storage] Error en la limpieza de archivos huérfanos:', error.message);
  }
  return result;
}

// Uso actual del almacenamiento (solo en modo MongoDB). Sirve para avisar a
// tiempo: la cuota gratuita de Atlas (512 MB) se llena sin avisar y deja la
// base de datos sin escrituras.
//
// IMPORTANTE: se informa del tamaño de los DATOS, no de `storageSize`. Atlas
// reserva disco con mucha holgura para WiredTiger (compresión y espacio
// reutilizable): tras borrar 265 MB de fotos huérfanas `storageSize` seguía
// marcando 632 MB aunque los datos reales son ~97 MB. Avisar con storageSize
// daría falsas alarmas para siempre.
async function usageStats() {
  if (mode !== 'mongodb') return null;
  const db = mongoose.connection && mongoose.connection.db;
  if (!db) return null;
  try {
    const stats = await db.command({ dbStats: 1, scale: 1048576 });
    const chunkStats = await db.command({ collStats: 'uploads.chunks', scale: 1048576 }).catch(() => null);
    return {
      dataMB: Math.round(Number(stats.dataSize || 0)),
      uploadsMB: chunkStats ? Math.round(Number(chunkStats.size || 0)) : null,
    };
  } catch (error) {
    return null;
  }
}

// Genera un nombre único y seguro para el archivo subido (multer en memoria no
// asigna `filename`, a diferencia de diskStorage). Se completa la extensión con
// el MIME cuando el nombre original no la trae (fotos tomadas con el celular).
const MIME_TO_EXT = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/pjpeg': 'jpg',
  'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/bmp': 'bmp', 'image/avif': 'avif', 'image/tiff': 'tiff',
  'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf',
};

function buildKey(file) {
  const safe = String(file.originalname || 'archivo').replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const hasExt = Boolean(path.extname(safe));
  const suffix = hasExt ? '' : `.${MIME_TO_EXT[String(file.mimetype || '').toLowerCase()] || 'bin'}`;
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${unique}-${safe}${suffix}`;
}

// Busca un archivo ya guardado con EXACTAMENTE el mismo contenido (mismo
// hash). Sirve para no guardar cinco veces la misma foto: el usuario que
// reintenta la captura subía el mismo juego de fotos y cada intento dejaba
// una copia huérfana de 5-8 MB.
async function findByHash(hash) {
  if (!hash || mode !== 'mongodb') return null;
  try {
    const gfs = gridfsBucket();
    return await gfs.find({ 'metadata.sha256': hash }).sort({ uploadDate: -1 }).limit(1).next();
  } catch (error) {
    return null;
  }
}

// Persiste un archivo subido por multer (que ahora llega EN MEMORIA) al
// almacenamiento definitivo: GridFS/R2 (persistente) o disco local (solo si se
// pidió explícitamente con STORAGE_DRIVER=local). NUNCA deja el archivo en el
// disco efímero del servidor cuando el modo es persistente.
async function persistFile(file) {
  if (!file) return;

  // Asigna un filename estable (usado luego para construir /uploads/<nombre>).
  if (!file.filename) file.filename = buildKey(file);
  const key = path.basename(file.filename);
  file.filename = key;
  const contentType = file.mimetype || 'application/octet-stream';

  try {
    // Caso normal: multer.memoryStorage → el archivo viene en file.buffer.
    if (file.buffer) {
      // Deduplicación: si el mismo contenido ya está guardado, se reutiliza el
      // archivo existente en lugar de guardar otra copia idéntica.
      const hash = sha256Hex(file.buffer);
      const existing = await findByHash(hash);
      if (existing && existing.filename) {
        file.filename = existing.filename;
        file.reused = true;
        delete file.buffer; // libera la memoria del proceso
        return;
      }

      if (mode === 'local') {
        const diskPath = path.join(uploadsDir, key);
        fs.mkdirSync(path.dirname(diskPath), { recursive: true });
        fs.writeFileSync(diskPath, file.buffer);
      } else {
        await putBuffer(key, file.buffer, contentType, { sha256: hash });
      }
      delete file.buffer; // libera la memoria del proceso
      return;
    }

    // Compatibilidad: si algún día vuelve a llegar una ruta temporal en disco.
    if (file.path) {
      if (mode === 'local') return;
      await putFile(key, file.path, contentType);
      try { fs.unlinkSync(file.path); } catch (e) { /* ignorar */ }
    }
  } catch (error) {
    console.warn('[Storage] No se pudo persistir el archivo:', error.message);
    throw error;
  }
}

// Sube varios archivos a la vez (cada uno se escribe una sola vez en el
// almacenamiento persistente). Si alguno falla se propaga el error.
async function persistFiles(files) {
  const list = files || [];
  for (const file of list) {
    await persistFile(file);
  }
}

// Sube un buffer (p. ej. un PDF generado) al destino persistente.
async function putBuffer(key, buffer, contentType, metadata) {
  const cleanKey = String(key).replace(/^\/+/, '');
  if (mode === 'mongodb') {
    await storeBufferToGridFS(cleanKey, buffer, contentType, metadata);
    return { key: cleanKey, stored: 'mongodb' };
  }
  if (mode === 'local') {
    const diskPath = path.join(uploadsDir, cleanKey);
    fs.mkdirSync(path.dirname(diskPath), { recursive: true });
    fs.writeFileSync(diskPath, buffer);
    return { key: cleanKey, stored: 'local' };
  }

  const payloadHash = 'UNSIGNED-PAYLOAD';
  const res = await request('PUT', cleanKey, {
    headers: { 'Content-Type': contentType || 'application/octet-stream' },
    payloadHash,
    readable: Readable.from([buffer]),
  });
  if (res.statusCode > 299) {
    const body = await readAll(res.stream);
    throw new Error(`No se pudo subir al almacenamiento (${res.statusCode}): ${body.toString('utf8').slice(0, 300)}`);
  }
  res.stream.resume();
  return { key: cleanKey, stored: 'r2' };
}

// Sube un archivo existente en disco local al destino persistente.
async function putFile(key, localPath, contentType) {
  const cleanKey = String(key).replace(/^\/+/, '');
  if (mode === 'mongodb') {
    await storeFileToGridFS(cleanKey, localPath, contentType);
    return { key: cleanKey, stored: 'mongodb' };
  }
  if (mode === 'local') {
    return { key: cleanKey, stored: 'local' };
  }

  const stat = fs.statSync(localPath);
  const res = await request('PUT', cleanKey, {
    headers: { 'Content-Type': contentType || 'application/octet-stream', 'Content-Length': String(stat.size) },
    payloadHash: 'UNSIGNED-PAYLOAD',
    readable: fs.createReadStream(localPath),
  });
  if (res.statusCode > 299) {
    const body = await readAll(res.stream);
    throw new Error(`No se pudo subir al almacenamiento (${res.statusCode}): ${body.toString('utf8').slice(0, 300)}`);
  }
  res.stream.resume();
  return { key: cleanKey, stored: 'r2' };
}

// Elimina un archivo del destino persistente (según el modo activo).
async function deleteFile(key) {
  if (!key) return;
  const cleanKey = String(key).replace(/^\/+/, '');
  if (mode === 'mongodb') {
    try { await deleteGridFSByFilename(cleanKey); } catch (error) {
      console.warn('[Storage] No se pudo eliminar de MongoDB:', error.message);
    }
    return;
  }
  if (mode === 'local') {
    const diskPath = path.join(uploadsDir, cleanKey);
    try { fs.unlinkSync(diskPath); } catch (e) { /* no existe */ }
    return;
  }
  try {
    const res = await request('DELETE', cleanKey);
    res.stream.resume();
    if (res.statusCode > 299) {
      const body = await readAll(res.stream);
      throw new Error(`No se pudo eliminar del almacenamiento (${res.statusCode}): ${body.toString('utf8').slice(0, 300)}`);
    }
  } catch (error) {
    console.warn('[Storage] No se pudo eliminar:', error.message);
  }
}

// Comprueba la existencia de una clave en el destino persistente.
async function fileExists(key) {
  if (!key) return false;
  const cleanKey = String(key).replace(/^\/+/, '');
  if (mode === 'mongodb') {
    try {
      const gfs = gridfsBucket();
      const doc = await gfs.find({ filename: cleanKey }).limit(1).next();
      return Boolean(doc);
    } catch (error) {
      return false;
    }
  }
  if (mode === 'local') {
    return fs.existsSync(path.join(uploadsDir, cleanKey));
  }
  try {
    const res = await request('HEAD', cleanKey);
    res.stream.resume();
    return res.statusCode === 200;
  } catch (error) {
    return false;
  }
}

// Middleware Express que sirve un archivo de /uploads/:key según el modo:
// local -> express.static; r2 -> proxy al bucket; mongodb -> stream desde GridFS.
function serveStatic() {
  const express = require('express');
  const localStatic = express.static(uploadsDir, { fallthrough: true });

  return (req, res, next) => {
    const key = String(req.path || '').replace(/^\/+/, '');
    if (mode === 'local') return localStatic(req, res, next);
    if (!key) return next();

    if (mode === 'r2') {
      const headers = {};
      if (req.headers.range) headers.Range = req.headers.range;

      request('GET', key, { headers })
        .then(async ({ statusCode, headers, stream }) => {
          if (statusCode === 404 || statusCode === 403) {
            stream.resume();
            return res.status(404).json({ success: false, message: 'Archivo no encontrado' });
          }
          if (statusCode > 299) {
            stream.resume();
            return res.status(statusCode).end();
          }
          res.status(statusCode);
          if (headers['content-type']) res.setHeader('Content-Type', headers['content-type']);
          if (headers['content-length']) res.setHeader('Content-Length', headers['content-length']);
          if (headers['last-modified']) res.setHeader('Last-Modified', headers['last-modified']);
          if (headers['etag']) res.setHeader('ETag', headers['etag']);
          if (headers['accept-ranges']) res.setHeader('Accept-Ranges', headers['accept-ranges']);
          if (headers['content-range']) res.setHeader('Content-Range', headers['content-range']);
          stream.pipe(res);
        })
        .catch((error) => {
          console.error('[Storage] Error sirviendo archivo:', error.message);
          res.status(500).json({ success: false, message: 'No se pudo leer el archivo' });
        });
      return;
    }

    // mode === 'mongodb'
    serveFromGridFS(req, res, key).catch((error) => {
      console.error('[Storage] Error leyendo archivo de MongoDB:', error.message);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'No se pudo leer el archivo' });
      } else {
        res.destroy();
      }
    });
  };
}

async function serveFromGridFS(req, res, key) {
  const gfs = gridfsBucket();
  const file = await gfs.find({ filename: key }).sort({ uploadDate: -1 }).limit(1).next();
  if (!file) {
    return res.status(404).json({ success: false, message: 'Archivo no encontrado' });
  }

  const headers = {
    'Content-Type': file.contentType || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    // El nombre del archivo es único por contenido (incluye un prefijo con
    // fecha + aleatorio): una vez subido nunca cambia, así que el navegador
    // puede guardar las fotos en caché y no volver a bajarlas en cada visita.
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
  let status = 200;
  let start = 0;
  let end = file.length - 1;

  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(range));
    if (m && (m[1] || m[2])) {
      const s = m[1] === '' ? 0 : parseInt(m[1], 10);
      const e = m[2] === '' ? file.length - 1 : parseInt(m[2], 10);
      if (!Number.isNaN(s) && s <= e && s < file.length) {
        start = s;
        end = Math.min(e, file.length - 1);
        status = 206;
      }
    }
  }

  if (status === 206) {
    headers['Content-Range'] = `bytes ${start}-${end}/${file.length}`;
    headers['Content-Length'] = String(end - start + 1);
  } else {
    headers['Content-Length'] = String(file.length);
  }

  res.status(status);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  const download = gfs.openDownloadStream(file._id, { start, end: end + 1 });
  download.on('error', (error) => {
    if (!res.headersSent) res.status(500).end();
    else res.destroy(error);
  });
  download.pipe(res);
}

module.exports = {
  getMode,
  isConfigured,
  uploadsDir,
  persistFile,
  persistFiles,
  putBuffer,
  putFile,
  deleteFile,
  fileKeyFromUrl,
  isFileReferenced,
  deleteFileIfUnused,
  cleanupOrphans,
  usageStats,
  fileExists,
  serveStatic,
};