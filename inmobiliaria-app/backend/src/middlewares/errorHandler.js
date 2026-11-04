'use strict';

const { isProduction } = require('../config/env');
const logger = require('../services/logger.service');

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Error interno del servidor';

  if (statusCode >= 500) {
    logger.error(message, {
      method: req.method,
      path: req.originalUrl,
      ip: req.ip || '',
      stack: isProduction ? undefined : err.stack,
    }, 'errorHandler');
  }

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  }

  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 400;
    message = 'Identificador no válido';
  }

  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'campo';
    message = `Ya existe un registro con ese ${field}`;
  }

  res.status(statusCode).json({
    success: false,
    message,
    stack: isProduction ? undefined : err.stack,
  });
};

module.exports = errorHandler;
