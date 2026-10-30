'use strict';

const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Id del emisor (desnormalizado; igual a sender pero disponible sin populate).
    emisor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Nombre del emisor desnormalizado para mostrar sin hacer populate.
    emisorNombre: {
      type: String,
      trim: true,
      default: '',
    },
    // Para chats 1:1 es el id del destinatario (el otro participante); para
    // chats grupales queda el marcador estándar GRUPO_GENERAL.
    destinatario: {
      type: String,
      default: 'GRUPO_GENERAL',
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    readBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    // Responder a mensaje específico
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat.messages',
      default: null,
    },
    replyToMessage: {
      _id: { type: mongoose.Schema.Types.ObjectId },
      message: { type: String, default: '' },
      sender: {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: { type: String, default: '' },
      },
    },
    // Menciones a usuarios
    mentions: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
  },
  { timestamps: true }
);

const chatSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: '',
    },
    type: {
      type: String,
      enum: ['individual', 'grupal'],
      required: true,
    },
    participants: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    }],
    messages: [chatMessageSchema],
    lastMessage: {
      type: String,
      default: '',
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

chatSchema.index({ participants: 1 });
chatSchema.index({ 'messages.createdAt': -1 });

module.exports = mongoose.model('Chat', chatSchema);
