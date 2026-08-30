'use strict';

const { isProduction } = require('../config/env');

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Error interno del servidor';

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
