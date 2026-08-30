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
    cb(null, `${Date.now()}-${safe}`);
  },
});

// Extensiones permitidas (SVG e ICO bloqueados: vectores de XSS / contenido activo).
const ALLOWED_EXTS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv',
  'jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp', 'png', 'gif',
  'webp', 'bmp', 'avif', 'tiff', 'tif', 'heic', 'heif',
]);

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').slice(1).toLowerCase();
  cb(null, ALLOWED_EXTS.has(ext));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
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

/**
 * Middleware que se coloca DESPUÉS de multer: lee los primeros bytes del
 * archivo ya guardado y verifica que coincidan con la extensión declarada.
 * Si no coinciden elimina el archivo y rechaza la petición con 400.
 */
function verifyUpload(req, res, next) {
  if (!req.file) return next();

  const ext = path.extname(req.file.originalname || '').slice(1).toLowerCase();
  let ok = false;

  try {
    const fd = fs.openSync(req.file.path, 'r');
    const buf = Buffer.alloc(16);
    const read = fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    buf.fill(0, read);

    if (ext === 'txt' || ext === 'csv') {
      ok = looksLikeText(buf.subarray(0, read));
    } else {
      const sig = SIGNATURES.find((s) => s.exts.includes(ext));
      ok = sig ? sig.test(buf) : false;
    }
  } catch (error) {
    ok = false;
  }

  if (!ok) {
    fs.unlink(req.file.path, () => {});
    delete req.file;
    return res.status(400).json({
      success: false,
      message: 'El contenido del archivo no coincide con su extensión o el formato no está permitido.',
    });
  }
  return next();
}

module.exports = { upload, verifyUpload, ALLOWED_EXTS };
