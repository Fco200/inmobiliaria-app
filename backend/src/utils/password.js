'use strict';

const crypto = require('crypto');

const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*?';
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

function pick(chars) {
  return chars.charAt(crypto.randomInt(0, chars.length));
}

// Genera una contraseña temporal que cumple la política del sistema: al menos
// una minúscula, una mayúscula y un número. Se usa al aprobar solicitudes de
// acceso para que la cuenta pueda crearse sin intervención manual.
function generatePassword(length = 10) {
  const size = Math.max(8, Number(length) || 10);
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS)];
  const rest = Array.from({ length: Math.max(0, size - required.length) }, () => pick(ALL));
  const chars = required.concat(rest);

  // Mezcla los caracteres para que los obligatorios no queden siempre al inicio.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

module.exports = { generatePassword };
