'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

test('el usuario autenticado expone _id además de id', () => {
  const auth = read('backend', 'src', 'controllers', 'auth.controller.js');
  assert.match(auth, /_id:\s*user\._id/, 'auth debe devolver _id para los módulos que lo usan');
  assert.match(auth, /id:\s*user\._id/, 'auth debe conservar id por compatibilidad');
});

test('las citas toman el asesor de la sesión cuando no llega en el formulario', () => {
  const validator = read('backend', 'src', 'validators', 'appointment.validators.js');
  const controller = read('backend', 'src', 'controllers', 'appointment.controller.js');

  assert.match(validator, /body\('user'\)\.optional\(\{ values: 'falsy' \}\)/, 'el usuario no debe ser obligatorio en el body');
  assert.match(controller, /beforeCreate:\s*\(body, req\)/, 'la cita debe tener un hook beforeCreate');
  assert.match(controller, /body\.user = req\.user\._id/, 'la cita debe asignar el usuario de la sesión');
});

test('el campo "quién te recomendó" no lo oculta el manejador genérico de Otros', () => {
  const ui = read('frontend', 'js', 'components', 'ui.js');
  const clients = read('frontend', 'pages', 'clients', 'clients.js');

  assert.match(ui, /select\.dataset\.otroInput\) return/, 'toggleOtros debe respetar los selects de clientes');
  assert.match(clients, /Array\.isArray\(fallback\)/, 'parseWhen debe soportar las etiquetas por opción');
  assert.match(clients, /function focusOtro/, 'debe enfocar el campo cuando falta el texto');
});

test('los botones de Negocios tienen respaldo directo para documentos, notas y checklist', () => {
  const page = read('frontend', 'pages', 'businesses', 'businesses.js');
  assert.match(page, /const documentsApi =/, 'debe existir un respaldo para documentos');
  assert.match(page, /const notesApi =/, 'debe existir un respaldo para notas');
  assert.match(page, /const checklistApi =/, 'debe existir un respaldo para checklist');
  assert.doesNotMatch(page, /await\s+API\.businesses\.documents/, 'ningún botón debe depender del bundle viejo');
});

test('los catálogos de selección se ordenan alfabéticamente', () => {
  const ui = read('frontend', 'js', 'components', 'ui.js');
  const clients = read('frontend', 'pages', 'clients', 'clients.js');
  const appointments = read('frontend', 'pages', 'appointments', 'appointments.js');
  const businesses = read('frontend', 'pages', 'businesses', 'businesses.js');

  assert.match(ui, /function sortByLabel/, 'debe existir el ordenador compartido');
  assert.match(clients, /UI\.sortByLabel\(users/, 'los asesores del cliente deben ordenarse');
  assert.match(appointments, /UI\.sortByLabel\(properties/, 'las propiedades de citas deben ordenarse');
  assert.match(businesses, /UI\.sortByLabel\(properties/, 'las propiedades de negocios deben ordenarse');
});
