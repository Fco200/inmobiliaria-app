'use strict';

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = String(file.originalname || 'archivo').replace(/[^a-zA-Z0-9.\-_]/g, '_');
    // En móviles algunas fotos llegan SIN extensión en el nombre: se completa
    // con la que corresponda al MIME para que el navegador pueda mostrarla.
    const hasExt = Boolean(path.extname(safe));
    const suffix = hasExt ? '' : `.${extFromMime(file.mimetype) || 'bin'}`;
    cb(null, `${Date.now()}-${safe}${suffix}`);
  },
});

// Extensiones permitidas (SVG e ICO bloqueados: vectores de XSS / contenido activo).
const ALLOWED_EXTS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv',
  'jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp', 'png', 'gif',
  'webp', 'bmp', 'avif', 'tiff', 'tif', 'heic', 'heif',
]);

// Extensiones de imagen (fotos de propiedades, avatares, etc.).
const IMAGE_EXTS = new Set([
  'jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp', 'png', 'gif',
  'webp', 'bmp', 'avif', 'tiff', 'tif', 'heic', 'heif',
]);

// MIME → extensión, para archivos que llegan sin extensión en el nombre.
const MIME_EXTS = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'image/tiff': 'tiff',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

function extFromMime(mime) {
  return MIME_EXTS[String(mime || '').toLowerCase()] || '';
}

// Extensión real del archivo: la del nombre si es válida; si no, la que
// indique el MIME (caso típico de fotos tomadas con el celular).
function effectiveExt(file) {
  const raw = path.extname(file.originalname || '').slice(1).toLowerCase();
  if (raw && ALLOWED_EXTS.has(raw)) return raw;
  return extFromMime(file.mimetype) || raw;
}

const fileFilter = (req, file, cb) => {
  cb(null, ALLOWED_EXTS.has(effectiveExt(file)));
};

const upload = multer({
  storage,
  fileFilter,
  // `files: 10` para poder subir varias fotos en una sola petición
  // (POST /properties/:id/photos usa upload.array('photos', 10)).
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
});

// ── Validación de contenido real (magic bytes) ──────────────────────────────
const SIGNATURES = [
  { exts: ['pdf'], test: (b) => b.slice(0, 4).toString('ascii') === '%PDF' },
  { exts: ['png'], test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { exts: ['jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp'], test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { exts: ['gif'], test: (b) => b.slice(0, 4).toString('ascii') === 'GIF8' },
  { exts: ['webp'], test: (b) => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP' },
  { exts: ['bmp'], test: (b) => b[0] === 0x42 && b[1] === 0x4d },
  { exts: ['tiff', 'tif'], test: (b) => b.slice(0, 2).toString('ascii') === 'II' || b.slice(0, 2).toString('ascii') === 'MM' },
  {
    exts: ['avif', 'heic', 'heif'],
    test: (b) =>
      b.length >= 12 &&
      b.slice(4, 8).toString('ascii') === 'ftyp' &&
      /^(avif|avis|heic|heix|hevc|hevx|mif1|msf1)/.test(b.slice(8, 12).toString('ascii')),
  },
  { exts: ['doc', 'xls'], test: (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 },
  { exts: ['docx', 'xlsx'], test: (b) => b[0] === 0x50 && b[1] === 0x4b },
];

function looksLikeText(buf) {
  for (let i = 0; i < buf.length; i += 1) {
    const c = buf[i];
    // NUL u otros bytes de control (excepto \t \n \r) ⇒ no es texto plano.
    if (c === 0 || (c < 9) || (c > 13 && c < 32)) return false;
  }
  return true;
}

// Verifica el contenido real (magic bytes) de un archivo ya guardado por multer.
function verifyFile(file) {
  const ext = effectiveExt(file);
  try {
    const fd = fs.openSync(file.path, 'r');
    const buf = Buffer.alloc(16);
    const read = fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    buf.fill(0, read);

    if (ext === 'txt' || ext === 'csv') {
      return looksLikeText(buf.subarray(0, read));
    }
    const sig = SIGNATURES.find((s) => s.exts.includes(ext));
    return sig ? sig.test(buf) : false;
  } catch (error) {
    return false;
  }
}

function rejectFile(req, res) {
  if (req.file) fs.unlink(req.file.path, () => {});
  (req.files || []).forEach((f) => fs.unlink(f.path, () => {}));
  delete req.file;
  delete req.files;
  return res.status(400).json({
    success: false,
    message: 'El contenido del archivo no coincide con su extensión o el formato no está permitido.',
  });
}

/**
 * Middleware que se coloca DESPUÉS de multer (un solo archivo en req.file):
 * lee los primeros bytes del archivo ya guardado y verifica que coincidan con
 * la extensión declarada. Si no coinciden elimina el archivo y responde 400.
 */
function verifyUpload(req, res, next) {
  if (!req.file) return next();
  if (verifyFile(req.file)) return next();
  return rejectFile(req, res);
}

/**
 * Igual que verifyUpload pero para peticiones multiparte con VARIOS archivos
 * (multer.array → req.files). Si cualquiera no coincide, borra todos.
 */
function verifyUploads(req, res, next) {
  const files = req.files || [];
  if (!files.length) return next();
  const bad = files.find((f) => !verifyFile(f));
  if (bad) return rejectFile(req, res);
  return next();
}

// Convierte errores de multer (archivo demasiado grande, etc.) en respuestas claras.
function uploadErrorHandler(err, req, res, next) {
  if (!err) return next();
  const multer = require('multer');
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'El archivo supera el límite de 15 MB' });
    }
    return res.status(400).json({ success: false, message: `No se pudo subir el archivo: ${err.code}` });
  }
  return next(err);
}

module.exports = { upload, verifyUpload, verifyUploads, uploadErrorHandler, ALLOWED_EXTS, IMAGE_EXTS, MIME_EXTS, effectiveExt };
