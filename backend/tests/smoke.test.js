'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('la app carga sin errores', () => {
  assert.doesNotThrow(() => require('../src/app'));
});

test('el servicio de avisos exporta sus funciones', () => {
  const service = require('../src/services/notification.service');
  assert.equal(typeof service.generateForUser, 'function');
  assert.equal(typeof service.generateForAllUsers, 'function');
});

test('los jobs programados exportan startJobs y stopJobs', () => {
  const jobs = require('../src/jobs/notification.job');
  assert.equal(typeof jobs.startJobs, 'function');
  assert.equal(typeof jobs.stopJobs, 'function');
});
