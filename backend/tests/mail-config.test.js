'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Config = require('../src/models/config.model');
const mailConfig = require('../src/services/mailConfig.service');

// Estas pruebas no tocan MongoDB: se sustituyen las operaciones del modelo
// Config por una copia en memoria para verificar cifrado, lectura y borrado.
function stubConfig() {
  let stored = null;
  const original = {
    findOne: Config.findOne,
    findOneAndUpdate: Config.findOneAndUpdate,
    deleteOne: Config.deleteOne,
  };

  Config.findOne = () => ({
    lean: async () => (stored ? { key: mailConfig.CONFIG_KEY, value: stored } : null),
  });
  Config.findOneAndUpdate = async (filter, update) => {
    stored = update.value;
    return { key: filter.key, value: stored };
  };
  Config.deleteOne = async () => {
    stored = null;
    return { deletedCount: 1 };
  };

  return {
    get stored() { return stored; },
    restore() {
      Config.findOne = original.findOne;
      Config.findOneAndUpdate = original.findOneAndUpdate;
      Config.deleteOne = original.deleteOne;
    },
  };
}

test('la clave del proveedor se guarda cifrada y se puede recargar', async () => {
  const stub = stubConfig();
  mailConfig.setRuntime(null);

  try {
    const described = await mailConfig.save(
      {
        provider: 'brevo',
        apiKey: 'xkeysib-clave-secreta-1234',
        senderEmail: 'No-Responder@Inmobles.com',
        senderName: 'INMOBLES',
        replyTo: 'contacto@inmobles.com',
      },
      { _id: '507f1f77bcf86cd799439011' }
    );

    assert.equal(described.provider, 'brevo');
    assert.equal(described.senderEmail, 'no-responder@inmobles.com');
    assert.equal(described.active, true);
    assert.equal(described.hasApiKey, true);
    assert.match(described.apiKeyPreview, /1234$/);
    assert.equal(described.replyTo, 'contacto@inmobles.com');

    // El valor persistido no contiene la clave en claro.
    assert.ok(stub.stored);
    assert.ok(stub.stored.apiKey);
    assert.equal(String(stub.stored.apiKey).includes('xkeysib-clave-secreta-1234'), false);

    // Al reiniciar, load() descifra la clave para poder enviar.
    mailConfig.setRuntime(null);
    await mailConfig.load();
    const runtime = mailConfig.get();
    assert.equal(runtime.provider, 'brevo');
    assert.equal(runtime.apiKey, 'xkeysib-clave-secreta-1234');
    assert.equal(runtime.senderName, 'INMOBLES');
    assert.equal(mailConfig.isActive(), true);
  } finally {
    stub.restore();
    mailConfig.setRuntime(null);
  }
});

test('sin configuración guardada el envío usa el entorno', async () => {
  const stub = stubConfig();
  mailConfig.setRuntime(null);

  try {
    await mailConfig.load();
    assert.equal(mailConfig.get(), null);
    assert.equal(mailConfig.isActive(), false);

    const described = mailConfig.describe();
    assert.equal(described.source, 'env');
    assert.equal(described.active, false);
    assert.equal(described.hasApiKey, false);
  } finally {
    stub.restore();
    mailConfig.setRuntime(null);
  }
});

test('rechaza un proveedor inválido o un remitente vacío', async () => {
  const stub = stubConfig();
  mailConfig.setRuntime(null);

  try {
    await assert.rejects(
      () => mailConfig.save({ provider: 'smtp', apiKey: 'x', senderEmail: 'a@b.com' }),
      /SMTP no funciona en Render/
    );
    await assert.rejects(
      () => mailConfig.save({ provider: 'brevo', apiKey: 'x', senderEmail: '' }),
      /correo remitente/
    );
  } finally {
    stub.restore();
    mailConfig.setRuntime(null);
  }
});

test('el estado del correo usa el proveedor y remitente del panel', () => {
  const mailService = require('../src/services/mail.service');
  mailConfig.setRuntime({
    provider: 'brevo',
    apiKey: 'clave-prueba',
    senderEmail: 'no-responder@inmobles.com',
    senderName: 'INMOBLES',
    replyTo: 'contacto@inmobles.com',
  });

  try {
    const status = mailService.mailStatus();
    assert.equal(status.provider, 'brevo');
    assert.equal(status.source, 'panel');
    assert.equal(status.configured, true);
    assert.equal(status.simulated, false);
    assert.equal(status.from, 'INMOBLES <no-responder@inmobles.com>');
    assert.equal(status.replyTo, 'contacto@inmobles.com');
  } finally {
    mailConfig.setRuntime(null);
  }
});

test('reset elimina la configuración y vuelve al entorno', async () => {
  const stub = stubConfig();
  mailConfig.setRuntime(null);

  try {
    await mailConfig.save(
      { provider: 'resend', apiKey: 're_clave_9999', senderEmail: 'a@b.com' },
      { _id: '507f1f77bcf86cd799439011' }
    );
    assert.equal(mailConfig.isActive(), true);

    const described = await mailConfig.reset();
    assert.equal(described.active, false);
    assert.equal(mailConfig.get(), null);
    assert.equal(stub.stored, null);
  } finally {
    stub.restore();
    mailConfig.setRuntime(null);
  }
});
