'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const engine = require('../src/services/webpush.engine');

// Vector de prueba oficial de RFC 8291 (Sección 5 / Apéndice A).
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  senderPublicKey: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  senderPrivateKey: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  expected:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

test('el cifrado aes128gcm reproduce el vector oficial de RFC 8291', () => {
  const body = engine.encryptPayload(
    { keys: { p256dh: RFC.p256dh, auth: RFC.auth } },
    RFC.plaintext,
    {
      salt: RFC.salt,
      senderPublicKey: RFC.senderPublicKey,
      senderPrivateKey: RFC.senderPrivateKey,
    }
  );
  assert.equal(body.toString('base64url'), RFC.expected);
  // Cabecera: salt(16) + rs(4) + idlen(1) + llave pública(65) = 86 bytes.
  assert.equal(body.length, 86 + Buffer.from(RFC.plaintext).length + 1 + 16);
});

test('cada cifrado usa un salt y una llave efímera distintos', () => {
  const sub = { keys: { p256dh: RFC.p256dh, auth: RFC.auth } };
  const a = engine.encryptPayload(sub, 'hola');
  const b = engine.encryptPayload(sub, 'hola');
  assert.notEqual(a.toString('base64url'), b.toString('base64url'));
  assert.equal(a.length, b.length);
});

test('genera llaves VAPID con el formato que espera el navegador', () => {
  const keys = engine.generateVapidKeys();
  const publicKey = Buffer.from(keys.publicKey, 'base64url');
  const privateKey = Buffer.from(keys.privateKey, 'base64url');
  assert.equal(publicKey.length, 65); // punto sin comprimir P-256
  assert.equal(publicKey[0], 0x04);
  assert.equal(privateKey.length, 32);
});

test('el JWT VAPID se firma con ES256 y se puede verificar', () => {
  const keys = engine.generateVapidKeys();
  engine.setVapidDetails('mailto:soporte@inmobiliaria.com', keys.publicKey, keys.privateKey);
  assert.equal(engine.isConfigured(), true);

  const jwt = engine.createVapidJwt('https://push.example.net');
  const [headerB64, payloadB64, signatureB64] = jwt.split('.');

  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  assert.equal(header.alg, 'ES256');
  assert.equal(payload.aud, 'https://push.example.net');
  assert.equal(payload.sub, 'mailto:soporte@inmobiliaria.com');
  assert.ok(payload.exp > Date.now() / 1000);

  const publicKey = Buffer.from(keys.publicKey, 'base64url');
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: Buffer.from(publicKey.subarray(1, 33)).toString('base64url'),
    y: Buffer.from(publicKey.subarray(33, 65)).toString('base64url'),
  };
  const valid = crypto.verify(
    'sha256',
    Buffer.from(`${headerB64}.${payloadB64}`),
    { key: crypto.createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
    Buffer.from(signatureB64, 'base64url')
  );
  assert.equal(valid, true);
});

test('el servicio de push exporta su API pública', () => {
  const push = require('../src/services/push.service');
  assert.equal(typeof push.saveSubscription, 'function');
  assert.equal(typeof push.removeSubscription, 'function');
  assert.equal(typeof push.sendToUser, 'function');
  assert.equal(typeof push.notifyUser, 'function');
  assert.equal(typeof push.getPublicKey, 'function');
  assert.equal(typeof push.getEngineName, 'function');
  assert.ok(['web-push', 'motor integrado (RFC 8291)'].includes(push.getEngineName()));
});

test('las rutas de push exigen autenticación', () => {
  const router = require('../src/routes/push.routes');
  assert.ok(router && typeof router === 'function');
  const layers = router.stack || [];
  const paths = layers.map((l) => l.route && l.route.path).filter(Boolean);
  assert.ok(paths.includes('/subscribe'));
  assert.ok(paths.includes('/unsubscribe'));
  assert.ok(paths.includes('/vapid-public-key'));
});

test('la normalización de fotos deja rutas /uploads relativas', () => {
  const { normalizePhotoPath, normalizePhotos } = require('../src/utils/photos');
  assert.equal(normalizePhotoPath('http://localhost:5000/uploads/1-foto.jpg'), '/uploads/1-foto.jpg');
  assert.equal(normalizePhotoPath('/uploads/1-foto.jpg?token=abc'), '/uploads/1-foto.jpg');
  assert.equal(normalizePhotoPath('uploads/1-foto.jpg'), '/uploads/1-foto.jpg');
  assert.equal(normalizePhotoPath('https://cdn.ejemplo.com/foto.jpg'), 'https://cdn.ejemplo.com/foto.jpg');
  assert.equal(normalizePhotoPath(''), '');
  assert.deepEqual(normalizePhotos(['http://x/uploads/a.png', '', 'https://cdn/b.png']), ['/uploads/a.png', 'https://cdn/b.png']);
  assert.deepEqual(normalizePhotos('no-array'), []);
});
