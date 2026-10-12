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

function storeBufferToGridFS(key, buffer, contentType) {
  const gfs = gridfsBucket();
  return new Promise((resolve, reject) => {
    const stream = gfs.openUploadStream(key, { contentType: contentType || 'application/octet-stream' });
    stream.on('error', reject);
    stream.on('finish', () => resolve({ id: stream.id, key }));
    stream.end(buffer);
  });
}

function storeFileToGridFS(key, localPath, contentType) {
  const gfs = gridfsBucket();
  return new Promise((resolve, reject) => {
    const source = fs.createReadStream(localPath);
    const stream = gfs.openUploadStream(key, { contentType: contentType || 'application/octet-stream' });
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
      if (mode === 'local') {
        const diskPath = path.join(uploadsDir, key);
        fs.mkdirSync(path.dirname(diskPath), { recursive: true });
        fs.writeFileSync(diskPath, file.buffer);
      } else {
        await putBuffer(key, file.buffer, contentType);
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
async function putBuffer(key, buffer, contentType) {
  const cleanKey = String(key).replace(/^\/+/, '');
  if (mode === 'mongodb') {
    await storeBufferToGridFS(cleanKey, buffer, contentType);
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
  fileExists,
  serveStatic,
};