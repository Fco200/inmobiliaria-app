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
const { execFile } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const CANDIDATE_PATHS = [
  path.join(__dirname, '..', '..', 'version.json'), // backend/version.json
  path.join(REPO_ROOT, 'version.json'), // raíz del repositorio
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

async function build() {
  const meta = readMeta();

  const hash = (await git(['log', '-1', '--format=%h'])) || '';
  const commitDate = (await git(['log', '-1', '--format=%cI'])) || '';
  const rawSubjects = await git(['log', '-15', '--format=%s']);
  const commits = rawSubjects ? rawSubjects.split('\n').map((s) => s.trim()).filter(Boolean) : [];

  const notes = Array.isArray(meta.notes) && meta.notes.length
    ? meta.notes.map((n) => String(n)).filter(Boolean)
    : commits;

  // Identificador de versión: el hash del commit manda (cambia en cada
  // commit). Si git no está disponible se usa la versión de version.json.
  const version = meta.version ? String(meta.version) : (hash || 'dev');

  // Clave de detección de cambios para el FRONTEND: se combina la versión
  // publicada (version.json) con el hash del commit. Así un salto de versión
  // (p. ej. 2.12 → 2.13) dispara el aviso "nueva versión disponible" en
  // todas las sesiones aunque no se haya hecho un commit nuevo.
  const detectionHash = [meta.version ? String(meta.version) : '', hash || '']
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
