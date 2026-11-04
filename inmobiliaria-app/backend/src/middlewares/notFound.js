'use strict';

const notFound = (req, res, next) => {
  const error = new Error(`No encontrado - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

module.exports = notFound;
