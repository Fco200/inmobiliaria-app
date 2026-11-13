'use strict';

const Format = {
  currency(value) {
    const number = Number(value || 0);
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 0,
    }).format(number);
  },

  date(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('es-MX', { timeZone: 'America/Hermosillo', day: '2-digit', month: 'short', year: 'numeric' });
  },

  dateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('es-MX', { timeZone: 'America/Hermosillo', 
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  },

  percent(value) {
    const number = Number(value || 0);
    return `${number.toFixed(1)}%`;
  },

  // La app trabaja siempre en hora de Hermosillo, sin importar la zona del
  // dispositivo. Antes se usaba getFullYear()/getHours() (zona del navegador):
  // un evento guardado a las 12:20 se mostraba a otra hora y al editar se
  // movía la cita. Estas funciones convierten explícitamente.
  APP_TIME_ZONE: 'America/Hermosillo',
  // Sonora no aplica horario de verano: UTC-7 todo el año.
  APP_UTC_OFFSET: '-07:00',

  zoneParts(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Hermosillo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const parts = {};
    formatter.formatToParts(date).forEach((part) => {
      if (part.type !== 'literal') parts[part.type] = part.value;
    });
    return parts;
  },

  // Valor para <input type="datetime-local"> en hora de Hermosillo.
  toLocalInput(value) {
    const parts = Format.zoneParts(value);
    if (!parts) return '';
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  },

  // Valor para <input type="date"> en hora de Hermosillo.
  toDateInput(value) {
    const parts = Format.zoneParts(value);
    return parts ? `${parts.year}-${parts.month}-${parts.day}` : '';
  },

  // Convierte lo que captura el usuario (hora de Hermosillo) a ISO/UTC.
  fromLocalInput(value) {
    const text = String(value == null ? '' : value).trim();
    if (!text) return null;
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if (!match) {
      const parsed = new Date(text);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    const hour = match[4] || '00';
    const minute = match[5] || '00';
    const date = new Date(`${match[1]}-${match[2]}-${match[3]}T${hour}:${minute}:00${Format.APP_UTC_OFFSET}`);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  },

  // Fecha sin hora: se guarda al mediodía de Hermosillo para que nunca cambie
  // de día al mostrarse en otra zona.
  fromDateInput(value) {
    const text = String(value == null ? '' : value).trim();
    if (!text) return null;
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00${Format.APP_UTC_OFFSET}`);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  },

  time(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleTimeString('es-MX', { timeZone: 'America/Hermosillo', hour: '2-digit', minute: '2-digit' });
  },

  plural(count, singular, plural) {
    return count === 1 ? singular : (plural || `${singular}s`);
  },

  digits(value) {
    return String(value || '').replace(/\D/g, '');
  },

  // Normaliza un teléfono a la forma que necesita wa.me: sólo dígitos y con la
  // lada del país UNA sola vez. Evita los enlaces duplicados tipo 5252662… que
  // salían al pegar "+52 1 662 318 8580" o "0052…" tal cual.
  waNumber(value, countryCode = '52') {
    let d = Format.digits(value);
    if (!d) return '';
    const cc = String(countryCode);
    if (d.indexOf('00') === 0) d = d.slice(2);
    // Prefijo del país repetido (5252…).
    if (d.indexOf(cc + cc) === 0) d = d.slice(cc.length);
    // Lada local con cero inicial (0 + 10 dígitos).
    if (d.length > 10 && d.charAt(0) === '0') d = d.replace(/^0+/, '');
    // 52 + 1 + 10 dígitos (la "1" de la red móvil mexicana).
    if (d.length === cc.length + 11 && d.indexOf(`${cc}1`) === 0) d = cc + d.slice(cc.length + 1);
    // 10 dígitos locales → se agrega la lada.
    if (d.length === 10) d = cc + d;
    return d;
  },

  whatsappLink(phone, countryCode = '52') {
    const digits = Format.waNumber(phone, countryCode);
    if (!digits) return null;
    return `https://wa.me/${digits}`;
  },

  telLink(phone) {
    const digits = Format.digits(phone);
    if (!digits) return null;
    return `tel:${digits}`;
  },
};
