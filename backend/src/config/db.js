'use strict';

const mongoose = require('mongoose');
const { mongodbUri, isProduction } = require('./env');

async function connectDB() {
  try {
    mongoose.set('strictQuery', true);
    const conn = await mongoose.connect(mongodbUri, {
      serverSelectionTimeoutMS: 5000,
      // Tamaño del pool de conexiones a MongoDB. Por defecto el driver abre
      // hasta 100 conexiones, pero en una instancia de Render (1 vCPU) cada
      // conexión abierta consume memoria y CPU. Con 50+ usuarios simultáneos
      // se dimensiona un pool acotado y con espera máxima corta: si se
      // agota, la petición espera un momento en vez de quedarse colgada
      // indefinidamente (que era lo que producía la app "travada").
      maxPoolSize: Number(process.env.MONGO_MAX_POOL || 20),
      minPoolSize: Number(process.env.MONGO_MIN_POOL || 2),
      maxIdleTimeMS: Number(process.env.MONGO_MAX_IDLE_MS || 60000),
      waitQueueTimeoutMS: Number(process.env.MONGO_WAIT_QUEUE_MS || 10000),
      // Recupera rápido ante un corte de red de MongoDB (Render reinicia la
      // base en los planes gratuitos) en lugar de quedarse colgado 30 s.
      heartbeatFrequencyMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log(`MongoDB conectado: ${conn.connection.host}`);

    // Los índices se construyen solos al conectar. Si alguno falla, mongoose solo
    // emite un evento 'index' en el modelo y el arranque continúa en silencio,
    // lo que dejaría la base sin una garantía importante. Con este aviso sí se
    // ve: el caso típico es el índice único de negocios, que necesita haber
    // corrido antes `npm run migrate:negocios` si quedaran clientes repetidos.
    mongoose.modelNames().forEach((nombre) => {
      mongoose.model(nombre).on('index', (err) => {
        // mongoose emite 'index' con `err` vacío en cada índice creado con
        // éxito: solo interesa registrar el error real.
        if (err) console.error(`No se pudo crear un índice de ${nombre}:`, err);
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
