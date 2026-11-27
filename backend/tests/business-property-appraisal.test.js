'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

test('todas las operaciones de propiedad están disponibles también en negocios', () => {
  const properties = read('frontend', 'pages', 'properties', 'properties.js');
  const inventory = read('frontend', 'pages', 'inventory', 'inventory.js');
  const businesses = read('frontend', 'pages', 'businesses', 'businesses.js');
  const pdf = read('frontend', 'js', 'components', 'propertyPdf.js');

  ['avaluo', 'gestion_infonavit'].forEach((value) => {
    assert.match(properties, new RegExp(`${value}: '`), `falta ${value} en Propiedades`);
    assert.match(inventory, new RegExp(`\\['${value}', '`), `falta ${value} en Inventario`);
    assert.match(pdf, new RegExp(`${value}: '`), `falta ${value} en el PDF`);
  });
  assert.match(businesses, /BUSINESS_OPERATION_LABELS = \{[\s\S]*avaluo[\s\S]*gestion_infonavit/);
  assert.match(businesses, /BUSINESS_OPERATION_OPTIONS = \[/);
  assert.match(businesses, /name: 'operationType'/);
});

test('todo negocio con propiedad guarda la operación y muestra el botón de Avalúo', () => {
  const model = read('backend', 'src', 'models', 'business.model.js');
  const validators = read('backend', 'src', 'validators', 'business.validators.js');
  const controller = read('backend', 'src', 'controllers', 'business.controller.js');
  const businesses = read('frontend', 'pages', 'businesses', 'businesses.js');

  assert.match(model, /operationType: \{ type: String, trim: true, default: '' \}/);
  assert.match(validators, /body\('operationType'\)\.optional/);
  assert.match(controller, /select\('owner ownerName operationType'\)/);
  assert.match(controller, /if \(prop\.operationType && !body\.operationType\)/, 'se copia la operación al crear');
  assert.match(controller, /if \(body\.operationType === undefined && business\.property\)/, 'se completa al editar negocios antiguos');
  assert.match(businesses, /\$\{\(record\.property \|\| record\.operationType\) \?/, 'Avalúo aparece para cualquier negocio con propiedad');
  assert.doesNotMatch(businesses, /AVALUO_OPERATIONS/, 'ya no se limita a venta/compra localizada');
  assert.match(businesses, /propertyId = prop\._id \|\| \(typeof prop === 'string' \? prop : ''\)/);
});

test('el inventario crea negocios con la operación y puede iniciar avalúo directo', () => {
  const inventory = read('frontend', 'pages', 'inventory', 'inventory.js');
  assert.match(inventory, /operationType: prop\.operationType \|\| ''/);
  assert.match(inventory, /data-appraisal/);
  assert.match(inventory, /avaluoPropiedad/);
  assert.match(inventory, /window\.location\.href = 'avaluo\.html'/);
});
