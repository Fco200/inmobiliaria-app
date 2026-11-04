'use strict';

/**
 * Envuelve un controlador async para propagar errores al middleware de errores.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
