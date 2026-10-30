'use strict';

const mongoose = require('mongoose');

const health = async (req, res) => {
  const dbState = mongoose.connection.readyState;
  const states = ['desconectado', 'conectado', 'conectando', 'desconectando'];

  res.status(200).json({
    success: true,
    message: 'API del CRM Inmobiliario operativa',
    data: {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: states[dbState] || 'desconocido',
    },
  });
};

module.exports = { health };
