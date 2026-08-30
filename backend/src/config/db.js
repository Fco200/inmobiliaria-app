'use strict';

const mongoose = require('mongoose');
const { mongodbUri, isProduction } = require('./env');

async function connectDB() {
  try {
    mongoose.set('strictQuery', true);
    const conn = await mongoose.connect(mongodbUri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`MongoDB conectado: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    if (isProduction) {
      console.error(`Error al conectar a MongoDB: ${error.message}`);
      process.exit(1);
    }
    console.warn(`No se pudo conectar a MongoDB: ${error.message}`);
    console.warn('El servidor se iniciará sin base de datos (solo desarrollo).');
    return null;
  }
}

module.exports = connectDB;
