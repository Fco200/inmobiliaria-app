'use strict';

// Servicio de versión de la aplicación.
//
// Devuelve la versión "actual" del despliegue. La clave de detección de
// cambios es el hash corto del último commit de git: cada vez que se hace un
// commit nuevo, el hash cambia y el frontend entiende que hay una versión
// nueva que mostrar en el módulo de Actualizaciones.
//
// El changelog (las "mejoras" que se listan al usuario) se toma de
// `version.json` si existe; si no, se usan los mensajes de los últimos
// commits. Así funciona tanto si se mantiene el archivo a mano como si solo
// se hace `git commit`.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const CANDIDATE_PATHS = [
  path.join(__dirname, '..', '..', 'version.json'), // backend/version.json
  path.join(REPO_ROOT, 'version.json'), // raíz del repositorio
];

// Archivos cuyo contenido se usa como "huella" de la versión cuando git no
// está disponible (por ejemplo, en despliegues de Render que no suben la
// carpeta .git). Con la huella por contenido, cualquier cambio de código
// sigue generando un aviso de "nueva versión disponible".
const FINGERPRINT_DIRS = [
  path.join(REPO_ROOT, 'backend', 'src'),
  path.join(REPO_ROOT, 'frontend', 'js'),
  path.join(REPO_ROOT, 'frontend', 'css'),
  path.join(REPO_ROOT, 'frontend', 'pages'),
];
const FINGERPRINT_FILES = [
  path.join(REPO_ROOT, 'frontend', 'sw.js'),
  path.join(REPO_ROOT, 'frontend', 'index.html'),
];

let cache = null;
let cachedAt = 0;
const TTL_MS = 30 * 1000;

function readMeta() {
  for (const file of CANDIDATE_PATHS) {
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (error) {
      // Archivo mal formado: continuar con el siguiente candidato.
    }
  }
  return {};
}

function git(args) {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd: REPO_ROOT, timeout: 4000, windowsHide: true },
      (error, stdout) => resolve(error ? '' : String(stdout || '').trim())
    );
  });
}

// Huella del código fuente (hash del contenido de los archivos). Se usa como
// clave de detección de versiones cuando no hay repositorio git disponible.
// Se calcula una sola vez por proceso y se cachea en memoria.
let fingerprintCache = null;

function sourceFingerprint() {
  if (fingerprintCache !== null) return fingerprintCache;
  try {
    const files = [];
    const walk = (dir) => {
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (error) {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|css|html|json|webp|png|jpe?g|svg)$/i.test(entry.name)) files.push(full);
      }
    };
    FINGERPRINT_DIRS.forEach(walk);
    FINGERPRINT_FILES.forEach((file) => {
      try { if (fs.existsSync(file)) files.push(file); } catch (error) { /* ignore */ }
    });
    if (!files.length) {
      fingerprintCache = '';
      return fingerprintCache;
    }
    const hash = crypto.createHash('sha1');
    files.sort().forEach((file) => {
      hash.update(path.relative(REPO_ROOT, file));
      try {
        hash.update(fs.readFileSync(file));
      } catch (error) {
        hash.update('missing');
      }
    });
    fingerprintCache = hash.digest('hex').slice(0, 7);
  } catch (error) {
    fingerprintCache = '';
  }
  return fingerprintCache;
}

async function build() {
  const meta = readMeta();

  const hash = (await git(['log', '-1', '--format=%h'])) || '';
  const commitDate = (await git(['log', '-1', '--format=%cI'])) || '';
  const rawSubjects = await git(['log', '-15', '--format=%s']);
  const commits = rawSubjects ? rawSubjects.split('\n').map((s) => s.trim()).filter(Boolean) : [];

  // Si git no está disponible (despliegues sin la carpeta .git), se usa la
  // huella del contenido de los archivos fuente: así el aviso de "nueva
  // versión disponible" sigue apareciendo en cada publicación.
  const buildId = hash || sourceFingerprint();

  const notes = Array.isArray(meta.notes) && meta.notes.length
    ? meta.notes.map((n) => String(n)).filter(Boolean)
    : commits;

  // Identificador de versión: el hash del commit manda (cambia en cada
  // commit). Si git no está disponible se usa la versión de version.json.
  const version = meta.version ? String(meta.version) : (buildId || 'dev');

  // Clave de detección de cambios para el FRONTEND: se combina la versión
  // publicada (version.json) con el identificador de build. Así un salto de
  // versión (p. ej. 2.15 → 2.16) dispara el aviso "nueva versión disponible" en
  // todas las sesiones aunque no se haya hecho un commit nuevo.
  const detectionHash = [meta.version ? String(meta.version) : '', buildId]
    .filter(Boolean)
    .join('-') || 'dev';

  return {
    version,
    hash: detectionHash,
    channel: meta.channel ? String(meta.channel) : 'estable',
    title: meta.title ? String(meta.title) : 'Nueva versión disponible',
    date: meta.date ? String(meta.date) : (commitDate || null),
    buildDate: commitDate || null,
    notes,
    commits,
  };
}

async function getVersion() {
  const now = Date.now();
  if (cache && now - cachedAt < TTL_MS) return cache;
  try {
    cache = await build();
  } catch (error) {
    cache = {
      version: 'dev',
      hash: 'dev',
      channel: 'estable',
      title: 'Nueva versión disponible',
      date: null,
      buildDate: null,
      notes: [],
      commits: [],
    };
  }
  cachedAt = now;
  return cache;
}

module.exports = { getVersion };
