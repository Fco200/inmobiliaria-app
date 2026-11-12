'use strict';

// Zona horaria en la que se muestran fechas y horas en textos generados por el
// servidor (avisos, recordatorios, correos). Sin ella, el servidor usa su propia
// zona (p. ej. UTC) y una cita de las 10:00 a. m. aparece con otra hora.
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Hermosillo';

const toDate = (value) => (value instanceof Date ? value : new Date(value));

function formatHora(value) {
  return toDate(value).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: APP_TIMEZONE });
}

function formatFecha(value) {
  return toDate(value).toLocaleDateString('es-MX', { timeZone: APP_TIMEZONE });
}

function formatFechaHora(value) {
  return toDate(value).toLocaleString('es-MX', { timeZone: APP_TIMEZONE });
}

module.exports = { APP_TIMEZONE, formatHora, formatFecha, formatFechaHora };
