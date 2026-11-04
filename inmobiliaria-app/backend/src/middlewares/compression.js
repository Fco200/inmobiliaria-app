'use strict';

/*
 * Compresión HTTP (gzip) sin dependencias externas.
 *
 * Los listados del CRM devuelven JSON muy repetitivo (nombres, estados,
 * correos). Sin compresión, cada respuesta ocupa varias veces más de lo
 * necesario: con 50+ usuarios navegando al mismo tiempo eso se traduce en
 * mucha más banda y en la app "travándose" por culpa de la red.
 *
 * Se implementa con el módulo zlib de Node (sin instalar nada) y solo se
 * comprimen las respuestas de texto: JSON, HTML, CSS, JS, XML y SVG. Los
 * binarios (fotos, PDF) ya vienen comprimidos y no se tocan.
 *
 * IMPORTANTE: cada respuesta se comprime por separado con gzipSync (nunca se
 * comparte un stream entre respuestas, porque se intercalarían los datos).
 * Express ya entrega JSON/HTML/CSS completos en un solo res.end(), así que
 * el tamaño en memoria es el mismo que antes de comprimir.
 *
 * El tipo de contenido se decide al FINALIZAR la respuesta, no al recibirla:
 * en ese momento Express ya fijó el Content-Type definitivo y así las fotos
 * servidas desde /uploads nunca se intentan comprimir.
 */

const zlib = require('zlib');

const COMPRESSIBLE = /^(?:text\/|application\/(?:json|javascript|xml|xhtml\+xml|manifest\+json)|image\/svg\+xml)/i;
const MIN_BYTES = 1024;               // no comprimir payloads diminutos (no aporta y cuesta CPU)
const MAX_BYTES = 8 * 1024 * 1024;   // por encima de esto se deja sin comprimir

function compression(options = {}) {
  const threshold = Number(options.threshold || MIN_BYTES);
  // Z_BEST_SPEED: comprime ~4-5x con muy poco coste de CPU. Para una app con
  // 50+ usuarios concurrentes en una sola instancia, la CPU es el recurso
  // escaso: preferimos velocidad antes que el último byte.
  const level = Number(options.level || zlib.constants.Z_BEST_SPEED);

  return function compressionMiddleware(req, res, next) {
    if (req.method === 'HEAD') return next();

    const accept = String(req.headers['accept-encoding'] || '');
    if (!/\bgzip\b/.test(accept)) return next();

    // Si ya hay un Content-Encoding (p. ej. lo puso un proxy), no se toca.
    if (res.getHeader('Content-Encoding')) return next();

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    const originalSetHeader = res.setHeader.bind(res);
    const originalRemoveHeader = res.removeHeader.bind(res);

    let chunks = [];
    let bytes = 0;
    let overflow = false;
    // Se activa cuando la respuesta NO es de texto (fotos, PDF...): a partir de
    // ese momento se escribe directo, sin acumular el archivo en memoria.
    let passthrough = false;

    res.write = function write(chunk, encoding, callback) {
      const enc = typeof encoding === 'function' ? undefined : encoding;
      const cb = typeof encoding === 'function' ? encoding : callback;
      if (passthrough) return originalWrite(chunk, enc, cb);

      // El tipo de contenido ya está definido (send/static lo fijan antes de
      // empezar a escribir): si no es texto, no hay nada que comprimir.
      const type = String(res.getHeader('Content-Type') || '');
      if (type && !COMPRESSIBLE.test(type)) {
        passthrough = true;
        if (chunks.length) {
          const pending = Buffer.concat(chunks);
          chunks = [];
          originalWrite(pending);
        }
        return originalWrite(chunk, enc, cb);
      }

      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), enc || 'utf8');
      chunks.push(buf);
      bytes += buf.length;
      if (bytes > MAX_BYTES) {
        // Se aborta la compresión: se devuelve lo acumulado tal cual.
        overflow = true;
        const pending = Buffer.concat(chunks);
        chunks = [];
        originalWrite(pending);
      }
      if (cb) cb();
      return true;
    };

    res.end = function end(chunk, encoding, callback) {
      const enc = typeof encoding === 'function' ? undefined : encoding;
      const cb = typeof encoding === 'function' ? encoding : callback;

      if (passthrough) {
        if (chunk) originalWrite(chunk, enc);
        return originalEnd(cb);
      }

      if (overflow) {
        if (chunk) originalWrite(chunk, enc);
        return originalEnd(cb);
      }

      if (chunk) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), enc || 'utf8');
        chunks.push(buf);
        bytes += buf.length;
      }

      const body = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
      chunks = [];

      // Respuesta vacía: se manda tal cual.
      if (!body.length) return originalEnd(cb);

      // El Content-Type definitivo ya está puesto por Express (res.send,
      // res.sendFile, etc.). Si no es de texto, se entrega sin comprimir.
      const contentType = String(res.getHeader('Content-Type') || '');
      if (!COMPRESSIBLE.test(contentType)) return originalEnd(body, enc, cb);

      // Respuesta muy pequeña: comprimirla no aporta nada y gasta CPU.
      // Se marca igualmente Vary para que una caché compartida no sirva la
      // versión comprimida a un cliente que no la entiende.
      if (bytes < threshold) {
        originalSetHeader('Vary', 'Accept-Encoding');
        return originalEnd(body, enc, cb);
      }

      let gzipped;
      try {
        gzipped = zlib.gzipSync(body, { level });
      } catch (error) {
        return originalEnd(body, enc, cb);
      }

      // Solo se usa la versión comprimida si realmente es más pequeña.
      if (gzipped.length >= body.length) return originalEnd(body, enc, cb);

      originalSetHeader('Content-Encoding', 'gzip');
      originalSetHeader('Vary', 'Accept-Encoding');
      // El Content-Length original ya no corresponde al cuerpo enviado.
      originalRemoveHeader('Content-Length');
      originalSetHeader('Content-Length', String(gzipped.length));
      return originalEnd(gzipped, enc, cb);
    };

    next();
  };
}

module.exports = { compression };
