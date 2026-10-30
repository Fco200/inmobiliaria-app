'use strict';

// Escapa un valor para un CSV: si contiene comas, comillas o saltos de línea,
// se envuelve entre comillas duplicando las internas (RFC 4180).
function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Convierte un arreglo de registros a texto CSV.
// columns: [{ key, label }] o [{ label, get(record) }].
function toCsv(rows, columns) {
  const header = columns.map((c) => csvEscape(c.label)).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => csvEscape(typeof c.get === 'function' ? c.get(row) : row[c.key])).join(',')
  );
  return `\uFEFF${[header, ...lines].join('\r\n')}`;
}

// Envía el CSV como descarga con nombre seguro.
function sendCsv(res, filename, csv) {
  const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.send(csv);
}

module.exports = { toCsv, sendCsv };