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

  whatsappLink(phone, countryCode = '52') {
    const digits = Format.digits(phone);
    if (!digits) return null;
    return `https://wa.me/${countryCode}${digits}`;
  },

  telLink(phone) {
    const digits = Format.digits(phone);
    if (!digits) return null;
    return `tel:${digits}`;
  },
};
