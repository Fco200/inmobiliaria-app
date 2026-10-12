'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// NOTA: session.service requiere el modelo Session (mongoose), pero estos
// tests solo usan funciones puras y una sesión falsa: no tocan la base de
// datos, así que corren sin conexión.

const sessionService = require('../src/services/session.service');

test('hashToken es determinista y distinto por token', () => {
  const a = sessionService.hashToken('token-a');
  const b = sessionService.hashToken('token-a');
  const c = sessionService.hashToken('token-b');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(typeof a, 'string');
  assert.ok(a.length >= 60); // sha256 hex
});

test('sessionRoom construye la sala por hash de sesión', () => {
  assert.equal(sessionService.sessionRoom('abc123'), 'session:abc123');
  assert.equal(sessionService.sessionRoom(''), 'session:');
});

test('revokeReasonMessage traduce cada motivo y tiene fallback', () => {
  const known = [
    'SELF_REVOKED',
    'SELF_LOGOUT_OTHERS',
    'ADMIN_REVOKED',
    'USER_DEACTIVATED',
    'PASSWORD_CHANGED',
    'PASSWORD_RESET',
    'MAINTENANCE',
  ];
  known.forEach((reason) => {
    const msg = sessionService.revokeReasonMessage(reason);
    assert.equal(typeof msg, 'string');
    assert.ok(msg.length > 5);
  });
  assert.equal(
    sessionService.revokeReasonMessage('MOTIVO_DESCONOCIDO'),
    'Tu sesión fue cerrada. Inicia sesión de nuevo.'
  );
});

test('revokeSession borra la sesión y avisa a esa sala y al usuario', async () => {
  const emitted = [];
  const sentinels = [];
  const io = {
    to(room) {
      return {
        emit(ev, payload) { emitted.push({ room, ev, payload }); },
      };
    },
    in(room) {
      return {
        fetchSockets() {
          sentinels.push(room);
          return Promise.resolve([{ disconnect() { /* noop */ } }]);
        },
      };
    },
  };

  sessionService.setIo(io);

  let deleted = false;
  const fakeSession = {
    _id: 's-1',
    tokenHash: 'hash-dispositivo-1',
    user: { _id: 'u-1' },
    deleteOne() { deleted = true; },
  };

  const result = await sessionService.revokeSession(fakeSession, 'ADMIN_REVOKED');
  assert.equal(result.ok, true);
  assert.equal(deleted, true);

  const revokedEvent = emitted.find((e) => e.ev === 'session-revoked');
  assert.ok(revokedEvent, 'debe emitir session-revoked');
  assert.equal(revokedEvent.room, 'session:hash-dispositivo-1');
  assert.equal(revokedEvent.payload.reason, 'ADMIN_REVOKED');
  assert.ok(revokedEvent.payload.message && revokedEvent.payload.message.length > 0);

  const changedEvent = emitted.find((e) => e.ev === 'sessions-changed');
  assert.ok(changedEvent, 'debe emitir sessions-changed');
  assert.equal(changedEvent.room, 'user:u-1');

  assert.ok(sentinels.includes('session:hash-dispositivo-1'), 'debe desconectar sockets de la sala');

  sessionService.setIo(null);
});

test('revokeSession tolera sesiones nulas sin romper', async () => {
  sessionService.setIo({
    to() { return { emit() {} }; },
    in() { return { fetchSockets: () => Promise.resolve([]) }; },
  });
  const result = await sessionService.revokeSession(null, 'ADMIN_REVOKED');
  assert.equal(result.ok, false);
  sessionService.setIo(null);
});

test('revokeReasonMessage nunca devuelve vacío sin io', async () => {
  // Sin io configurado, revokeSession no debe lanzar.
  sessionService.setIo(null);
  let deleted = false;
  const result = await sessionService.revokeSession(
    { _id: 'x', tokenHash: 'h', user: { _id: 'u1' }, deleteOne() { deleted = true; } },
    'ADMIN_REVOKED'
  );
  assert.equal(result.ok, true);
  assert.equal(deleted, true);
});

test('el servicio exporta las funciones esperadas', () => {
  ['setIo', 'hashToken', 'sessionRoom', 'revokeReasonMessage', 'createSession',
    'touchSession', 'revokeSessionByToken', 'revokeSession', 'revokeSessionById',
    'revokeUserSessions', 'revokeUserSessionsExcept'].forEach((fn) => {
    assert.equal(typeof sessionService[fn], 'function', `debe exportar ${fn}`);
  });
});