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
    return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  dateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('es-MX', {
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

  toLocalInput(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },

  time(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
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
