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

    // Los índices se construyen solos al conectar. Si alguno falla, mongoose solo
    // emite un evento 'index' en el modelo y el arranque continúa en silencio,
    // lo que dejaría la base sin una garantía importante. Con este aviso sí se
    // ve: el caso típico es el índice único de negocios, que necesita haber
    // corrido antes `npm run migrate:negocios` si quedaran clientes repetidos.
    mongoose.modelNames().forEach((nombre) => {
      mongoose.model(nombre).on('index', (err) => {
        console.error(`No se pudo crear un índice de ${nombre}:`, err);
        //console.error(`No se pudo crear un índice de ${nombre}: ${err.message}`);
      });
    });

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
