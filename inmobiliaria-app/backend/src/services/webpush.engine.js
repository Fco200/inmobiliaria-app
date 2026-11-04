'use strict';

/**
 * Motor de Web Push sin dependencias externas (RFC 8291 "aes128gcm" + VAPID).
 *
 * El registro de npm está bloqueado en este entorno (403), así que este módulo
 * implementa el cifrado de los mensajes push con el módulo `crypto` de Node:
 *
 *   - VAPID: JWT firmado con ES256 (P-256) enviado en el header Authorization.
 *   - Payload: cifrado AES-128-GCM con llaves derivadas por HKDF/HMAC tal como
 *     describe RFC 8291 §3.4 (verificado contra el vector del Apéndice A en
 *     tests/webpush.test.js).
 *
 * Expone la MISMA interfaz que el paquete `web-push`
 * (setVapidDetails / sendNotification / generateVapidKeys), de modo que
 * push.service.js usa el paquete real si está instalado
 * (`npm install web-push`) y este motor como respaldo.
 */

const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const VAPID_JWT_TTL_SECONDS = 12 * 60 * 60;

let vapid = null;

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function fromB64url(value) {
  return Buffer.from(String(value || ''), 'base64url');
}

function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

// Punto sin comprimir (0x04 || X || Y) -> JWK de la curva P-256.
function publicKeyJwk(rawUncompressed) {
  if (!Buffer.isBuffer(rawUncompressed) || rawUncompressed.length !== 65 || rawUncompressed[0] !== 0x04) {
    throw new Error('Llave P-256 inválida: se espera un punto sin comprimir de 65 bytes.');
  }
  return {
    kty: 'EC',
    crv: 'P-256',
    x: b64url(rawUncompressed.subarray(1, 33)),
    y: b64url(rawUncompressed.subarray(33, 65)),
  };
}

function uncompressedPoint(keyObject) {
  const jwk = keyObject.export({ format: 'jwk' });
  return Buffer.concat([Buffer.from([0x04]), fromB64url(jwk.x), fromB64url(jwk.y)]);
}

function uint32be(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value, 0);
  return buffer;
}

// Llaves VAPID en el formato que usa `web-push`:
//   publicKey  = punto sin comprimir (65 bytes) en base64url
//   privateKey = escalar d (32 bytes) en base64url
function generateVapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return {
    publicKey: uncompressedPoint(publicKey).toString('base64url'),
    privateKey: privateKey.export({ format: 'jwk' }).d,
  };
}

function setVapidDetails(subject, publicKey, privateKey) {
  if (!subject || !publicKey || !privateKey) {
    throw new Error('VAPID requiere subject, publicKey y privateKey.');
  }
  const pubJwk = publicKeyJwk(fromB64url(publicKey));
  const privJwk = { ...pubJwk, d: String(privateKey) };

  // Importar las llaves valida que el punto pertenezca a la curva P-256.
  const privKeyObject = crypto.createPrivateKey({ key: privJwk, format: 'jwk' });
  const pubKeyObject = crypto.createPublicKey({ key: pubJwk, format: 'jwk' });

  vapid = {
    subject: String(subject),
    publicKey: String(publicKey),
    privateKey: String(privateKey),
    privKeyObject,
    pubKeyObject,
  };
}

function isConfigured() {
  return Boolean(vapid);
}

function audienceFor(endpoint) {
  const url = new URL(endpoint);
  return `${url.protocol}//${url.host}`;
}

// JWT ES256 firmado con la llave privada VAPID. La firma debe ir en formato
// compacto r||s (dsaEncoding "ieee-p1363"), no DER, porque JWS exige 64 bytes.
function createVapidJwt(audience) {
  if (!vapid) throw new Error('VAPID no está configurado (setVapidDetails).');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64url(JSON.stringify({ aud: audience, exp: now + VAPID_JWT_TTL_SECONDS, sub: vapid.subject }));
  const data = `${header}.${payload}`;
  const signature = crypto.sign('sha256', Buffer.from(data), {
    key: vapid.privKeyObject,
    dsaEncoding: 'ieee-p1363',
  });
  return `${data}.${b64url(signature)}`;
}

/**
 * Cifra el payload según RFC 8291 y devuelve el cuerpo completo
 * (cabecera aes128gcm + texto cifrado + tag) listo para enviarse.
 *
 * `options` solo se usa para pruebas con valores fijos del Apéndice A del RFC:
 *   options.salt             -> salt (Buffer o base64url)
 *   options.senderPublicKey  -> llave pública del emisor (base64url)
 *   options.senderPrivateKey -> llave privada del emisor (base64url)
 */
function encryptPayload(subscription, payloadString, options = {}) {
  const keys = (subscription && subscription.keys) || {};
  const uaPublicRaw = fromB64url(keys.p256dh);
  const authSecret = fromB64url(keys.auth);

  if (uaPublicRaw.length !== 65 || uaPublicRaw[0] !== 0x04) {
    throw new Error('Suscripción inválida: keys.p256dh no es una llave P-256 válida.');
  }
  if (authSecret.length < 16) {
    throw new Error('Suscripción inválida: keys.auth debe tener al menos 16 bytes.');
  }

  const uaPublicKey = crypto.createPublicKey({ key: publicKeyJwk(uaPublicRaw), format: 'jwk' });

  let sender;
  let asPublicRaw;
  if (options.senderPublicKey && options.senderPrivateKey) {
    asPublicRaw = fromB64url(options.senderPublicKey);
    const jwk = {
      ...publicKeyJwk(asPublicRaw),
      d: String(options.senderPrivateKey),
    };
    sender = { privateKey: crypto.createPrivateKey({ key: jwk, format: 'jwk' }) };
  } else {
    sender = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    asPublicRaw = uncompressedPoint(sender.publicKey);
  }

  const ecdhSecret = crypto.diffieHellman({ privateKey: sender.privateKey, publicKey: uaPublicKey });

  // PRK_key = HMAC-SHA-256(auth_secret, ecdh_secret)
  const prkKey = hmacSha256(authSecret, ecdhSecret);
  // IKM = HMAC-SHA-256(PRK_key, "WebPush: info" || 0x00 || ua_public || as_public || 0x01)
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info', 'utf8'),
    Buffer.from([0x00]),
    uaPublicRaw,
    asPublicRaw,
  ]);
  const ikm = hmacSha256(prkKey, Buffer.concat([keyInfo, Buffer.from([0x01])]));

  const salt = options.salt
    ? (Buffer.isBuffer(options.salt) ? options.salt : fromB64url(options.salt))
    : crypto.randomBytes(16);
  const prk = hmacSha256(salt, ikm);
  // HKDF-Expand(PRK, "Content-Encoding: aes128gcm" || 0x00, 16)
  const cek = hmacSha256(
    prk,
    Buffer.concat([Buffer.from('Content-Encoding: aes128gcm', 'utf8'), Buffer.from([0x00, 0x01])])
  ).subarray(0, 16);
  // HKDF-Expand(PRK, "Content-Encoding: nonce" || 0x00, 12)
  const nonce = hmacSha256(
    prk,
    Buffer.concat([Buffer.from('Content-Encoding: nonce', 'utf8'), Buffer.from([0x00, 0x01])])
  ).subarray(0, 12);

  const plaintext = Buffer.from(String(payloadString), 'utf8');
  // rs debe superar plaintext + delimitador (1) + tag AES-GCM (16).
  const recordSize = Math.max(4096, plaintext.length + 18);

  const headerBody = Buffer.concat([
    salt,
    uint32be(recordSize),
    Buffer.from([asPublicRaw.length]),
    asPublicRaw,
  ]);

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.concat([plaintext, Buffer.from([0x02])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  return Buffer.concat([headerBody, ciphertext]);
}

/**
 * Envía una notificación a la suscripción indicada.
 * Resuelve { statusCode } en éxito; rechaza con un error que lleva
 * `statusCode` (404/410 = suscripción caducada), igual que `web-push`.
 */
function sendNotification(subscription, payload, options = {}) {
  return new Promise((resolve, reject) => {
    let body;
    let authorization;
    try {
      body = encryptPayload(subscription, typeof payload === 'string' ? payload : JSON.stringify(payload));
      if (!vapid) throw new Error('VAPID no está configurado (setVapidDetails).');
      authorization = `vapid t=${createVapidJwt(audienceFor(subscription.endpoint))}, k=${vapid.publicKey}`;
    } catch (error) {
      reject(error);
      return;
    }

    const url = new URL(subscription.endpoint);
    const transport = url.protocol === 'http:' ? http : https;
    const headers = {
      Authorization: authorization,
      TTL: String(options.TTL != null ? options.TTL : 86400),
      Urgency: options.urgency || 'normal',
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(body.length),
    };

    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => { if (chunks.length < 8) chunks.push(chunk); });
        res.on('end', () => {
          const status = res.statusCode || 0;
          if (status >= 200 && status < 300) {
            resolve({ statusCode: status });
            return;
          }
          const error = new Error(`Web Push falló con el servicio push (${status})`);
          error.statusCode = status;
          error.body = Buffer.concat(chunks).toString('utf8');
          reject(error);
        });
      }
    );
    req.on('error', (error) => reject(error));
    req.setTimeout(15000, () => req.destroy(new Error('Tiempo de espera agotado al enviar la notificación push')));
    req.end(body);
  });
}

module.exports = {
  generateVapidKeys,
  setVapidDetails,
  isConfigured,
  createVapidJwt,
  encryptPayload,
  sendNotification,
};
