'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const chatController = require('../src/controllers/chat.controller');

/**
 * Las rutas Express entregan los ids como TEXTO (`req.params.id`) y Mongoose
 * solo los castea en `find`/`updateOne`, NO en las agregaciones. Si un id
 * llega como cadena a una agregación no encuentra nada: el chat parecía
 * vacío y "marcar como leído" no marcaba nada nunca.
 * `toObjectId` es la red de seguridad que se usa en todos esos puntos.
 */
test('toObjectId convierte un id de texto en ObjectId', () => {
  const id = chatController.toObjectId('6ad996b947378a62b4c87a09');
  assert.ok(id instanceof mongoose.Types.ObjectId);
  assert.equal(id.toString(), '6ad996b947378a62b4c87a09');
});

test('toObjectId respeta un ObjectId que ya es válido', () => {
  const original = new mongoose.Types.ObjectId();
  assert.equal(chatController.toObjectId(original), original);
});

test('toObjectId acepta un documento con la propiedad _id', () => {
  const original = new mongoose.Types.ObjectId();
  const doc = { _id: original };
  assert.equal(chatController.toObjectId(doc), original);
});

test('toObjectId devuelve null con valores que no son un id', () => {
  assert.equal(chatController.toObjectId(null), null);
  assert.equal(chatController.toObjectId(undefined), null);
  assert.equal(chatController.toObjectId(''), null);
  assert.equal(chatController.toObjectId('no-es-un-id'), null);
});

test('el controlador de chat exporta las funciones que usa el resto del sistema', () => {
  const esperadas = [
    'listChats',
    'getChat',
    'sendMessage',
    'markAsRead',
    'unreadCount',
    'clearMessages',
    'general',
    'supportChat',
    'getOrCreateGeneralChat',
    'getOrCreateSupportChat',
    'persistAndBroadcast',
    'markChatAsRead',
  ];
  for (const fn of esperadas) {
    assert.equal(typeof chatController[fn], 'function', `falta ${fn} en el controlador de chat`);
  }
});
