'use strict';

// Job de LIMPIEZA DE ARCHIVOS HUÉRFANOS.
//
// Las fotos se suben al almacenamiento ANTES de guardar el registro que las
// referencia. Si ese registro nunca se crea (el usuario cancela, hay un error
// al guardar, se reintenta la captura), el archivo queda huérfano y ocupa
// espacio para siempre.
//
// Con un Atlas del nivel gratuito (512 MB de cuota) eso fue suficiente para
// llenar la base de datos con ~265 MB de fotos repetidas y dejar la aplicación
// SIN ESCRITURAS: no se podían crear propiedades, avisos ni sesiones.
//
// Este job corre cada 2 horas y borra los archivos que:
//   - nadie referencia (ninguna propiedad, documento, inventario... los usa) y
//   - tienen más de 6 horas (para no tocar una subida que acaba de hacerse
//     y que el controlador va a referenciar en unos segundos).
//
// También limpia los trozos de GridFS que se quedaron sin su archivo
// (subidas interrumpidas).

const storageService = require('../services/storage.service');
const logger = require('../services/logger.service');

const CLEANUP_INTERVAL_MS = 2 * 60 * 60 * 1000; // cada 2 horas
const MIN_AGE_MS = 6 * 60 * 60 * 1000; // archivos con más de 6 horas

let timer = null;
let running = false;

async function runStorageCleanup() {
  if (running) return null; // nunca se solapan dos limpiezas
  running = true;
  try {
    const result = await storageService.cleanupOrphans({ minAgeMs: MIN_AGE_MS });
    if (result.deleted || result.orphanChunks) {
      console.log(
        `[Storage] Limpieza de archivos huérfanos: ${result.deleted} archivos ` +
        `(${(result.freed / 1048576).toFixed(1)} MB) y ${result.orphanChunks} trozos huérfanos.`
      );
      logger.info('Limpieza de archivos huérfanos', result, 'storage');
    }

    // Aviso de espacio: la cuota gratuita de Atlas (512 MB) se llena sin avisar
    // y deja la base de datos sin escrituras. Avisar a tiempo evita la sorpresa.
    // Se usa el tamaño de los DATOS (no el disco reservado, que Atlas mantiene
    // alto por la compresión y el espacio reutilizable).
    const usage = await storageService.usageStats();
    if (usage) {
      if (usage.dataMB > 400) {
        console.warn(`[Storage] ATENCIÓN: los datos ocupan ${usage.dataMB} MB de los 512 MB de la cuota gratuita de Atlas. Revisa las fotos o amplía el plan.`);
        logger.warn('Almacenamiento casi lleno', usage, 'storage');
      } else {
        logger.info('Espacio de almacenamiento en uso', usage, 'storage');
      }
    }

    return result;
  } catch (error) {
    logger.warn('Error en la limpieza de archivos huérfanos', { error: error.message }, 'storage');
    return null;
  } finally {
    running = false;
  }
}

function startStorageJob() {
  if (timer) return;
  // Primera limpieza pasados 10 minutos (la app acaba de arrancar: mejor
  // dejar que termine las peticiones que ya están en vuelo).
  timer = setInterval(runStorageCleanup, CLEANUP_INTERVAL_MS);
  timer.unref();
  setTimeout(runStorageCleanup, 10 * 60 * 1000).unref();
  console.log('[Job] Programado: limpieza de archivos huérfanos.');
}

function stopStorageJob() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startStorageJob, stopStorageJob, runStorageCleanup };
