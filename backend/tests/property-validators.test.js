'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validationResult } = require('express-validator');
const { propertyRules, propertyUpdateRules } = require('../src/validators/property.validators');

// Ejecuta las cadenas de express-validator sin levantar Express. El último
// elemento de cada arreglo es el middleware `validate`, que no tiene .run().
async function mensajes(rules, body) {
  const req = { body };
  for (const rule of rules) {
    if (typeof rule.run === 'function') await rule.run(req);
  }
  return validationResult(req).array().map((e) => e.msg);
}

test('crear una propiedad sigue exigiendo tipo y operación', async () => {
  const msgs = await mensajes(propertyRules, {});
  assert.ok(msgs.includes('El tipo de inmueble es obligatorio'));
  assert.ok(msgs.includes('El tipo de operación es obligatorio'));
});

test('editar solo la dirección no exige tipo ni operación', async () => {
  const msgs = await mensajes(propertyUpdateRules, { address: 'Calle 1, Col. Centro' });
  assert.deepEqual(msgs, []);
});

test('editar con el tipo vacío sí marca el error', async () => {
  const msgs = await mensajes(propertyUpdateRules, { type: '', operationType: 'venta' });
  assert.ok(msgs.includes('El tipo de inmueble es obligatorio'));
});
