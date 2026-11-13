'use strict';

// Zona horaria en la que se muestran fechas y horas en textos generados por el
// servidor (avisos, recordatorios, correos). Sin ella, el servidor usa su propia
// zona (p. ej. UTC) y una cita de las 10:00 a. m. aparece con otra hora.
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Hermosillo';
// Sonora no cambia de horario: UTC-7 todo el año. Se usa para interpretar las
// fechas/horas que llegan SIN zona (p. ej. el formulario público de visitas).
const APP_UTC_OFFSET = '-07:00';

const toDate = (value) => (value instanceof Date ? value : new Date(value));

// Interpreta una fecha/hora de la app (Hermosillo) aunque el servidor corra en
// UTC. Si el texto ya trae zona (Z o ±hh:mm) se respeta tal cual.
function parseLocalDateTime(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  if (!text) return null;
  if (/(?:z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const hour = match[4] || '00';
  const minute = match[5] || '00';
  const second = match[6] || '00';
  const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T${hour}:${minute}:${second}${APP_UTC_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatHora(value) {
  return toDate(value).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: APP_TIMEZONE });
}

function formatFecha(value) {
  return toDate(value).toLocaleDateString('es-MX', { timeZone: APP_TIMEZONE });
}

function formatFechaHora(value) {
  return toDate(value).toLocaleString('es-MX', { timeZone: APP_TIMEZONE });
}

module.exports = { APP_TIMEZONE, APP_UTC_OFFSET, parseLocalDateTime, formatHora, formatFecha, formatFechaHora };
