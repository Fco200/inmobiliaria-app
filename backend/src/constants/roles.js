'use strict';

// Códigos internos de los seis roles oficiales del CRM. El nombre solicitado
// por la inmobiliaria (ADMINISTRACIÓN) se guarda internamente como `admin` para
// no duplicar el rol que ya existía; el resto conserva su código histórico.
const ROLE_CODES = Object.freeze({
  DIRECCION: 'direccion',
  ADMINISTRACION: 'admin',
  GERENCIA: 'gerencia',
  ASISTENCIA: 'asistencia',
  ESCRITURACION: 'escrituracion',
  ASESOR: 'asesor',
});

// Orden oficial para selectores, tablas y etiquetas.
const ROLE_ORDER = Object.freeze([
  ROLE_CODES.DIRECCION,
  ROLE_CODES.ADMINISTRACION,
  ROLE_CODES.GERENCIA,
  ROLE_CODES.ASISTENCIA,
  ROLE_CODES.ESCRITURACION,
  ROLE_CODES.ASESOR,
]);

const ROLE_LABELS = Object.freeze({
  [ROLE_CODES.DIRECCION]: 'Dirección',
  [ROLE_CODES.ADMINISTRACION]: 'Administración',
  [ROLE_CODES.GERENCIA]: 'Gerencia',
  [ROLE_CODES.ASISTENCIA]: 'Asistencia',
  [ROLE_CODES.ESCRITURACION]: 'Escrituración',
  [ROLE_CODES.ASESOR]: 'Asesor',
});

// Roles que se pueden solicitar desde el login y asignar/crear desde
// Configuración > Usuarios y desde el panel de solicitudes. `superadmin` queda
// fuera a propósito: es la credencial interna de soporte técnico.
const PUBLIC_ROLE_CODES = ROLE_ORDER;
const ASSIGNABLE_ROLE_CODES = ROLE_ORDER;

// Roles de alto privilegio que exigen la clave secreta de registro cuando se
// eligen desde el acceso público (Google / registro).
const KEY_PROTECTED_ROLE_CODES = Object.freeze([
  ROLE_CODES.DIRECCION,
  ROLE_CODES.ADMINISTRACION,
  ROLE_CODES.GERENCIA,
]);

// Quién puede abrir/editar negocios. El asesor trabaja los negocios que ya
// tiene asignados, pero no puede crear ni editar sus datos base.
const BUSINESS_CREATOR_ROLES = Object.freeze([
  ROLE_CODES.DIRECCION,
  ROLE_CODES.ADMINISTRACION,
  ROLE_CODES.GERENCIA,
  ROLE_CODES.ASISTENCIA,
]);

// Normaliza cualquier variante (mayúsculas, acentos, nombre visible o código
// histórico) al código interno. Devuelve '' si no corresponde a un rol oficial.
const ROLE_ALIASES = Object.freeze({
  direccion: ROLE_CODES.DIRECCION,
  director: ROLE_CODES.DIRECCION,
  administracion: ROLE_CODES.ADMINISTRACION,
  administrador: ROLE_CODES.ADMINISTRACION,
  admin: ROLE_CODES.ADMINISTRACION,
  gerencia: ROLE_CODES.GERENCIA,
  gerente: ROLE_CODES.GERENCIA,
  asistencia: ROLE_CODES.ASISTENCIA,
  asistente: ROLE_CODES.ASISTENCIA,
  escrituracion: ROLE_CODES.ESCRITURACION,
  escritor: ROLE_CODES.ESCRITURACION,
  asesor: ROLE_CODES.ASESOR,
});

function normalizeToken(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function normalizeRoleCode(value) {
  if (value == null) return '';
  const token = normalizeToken(value);
  return ROLE_ALIASES[token] || '';
}

function isAssignableRoleCode(value) {
  return ASSIGNABLE_ROLE_CODES.includes(normalizeRoleCode(value));
}

function roleLabel(code) {
  const normalized = normalizeRoleCode(code) || String(code || '');
  return ROLE_LABELS[normalized] || normalized;
}

function roleLabelUpper(code) {
  return roleLabel(code).toUpperCase();
}

module.exports = {
  ROLE_CODES,
  ROLE_ORDER,
  ROLE_LABELS,
  PUBLIC_ROLE_CODES,
  ASSIGNABLE_ROLE_CODES,
  KEY_PROTECTED_ROLE_CODES,
  BUSINESS_CREATOR_ROLES,
  normalizeRoleCode,
  isAssignableRoleCode,
  roleLabel,
  roleLabelUpper,
};
