'use strict';

const mongoose = require('mongoose');

const { PROPERTY_PAYMENT_METHODS } = require('../constants/appointment-types');

const propertySchema = new mongoose.Schema(
  {
    folio: {
      type: String,
      unique: true,
      default: null,
    },
    type: {
      type: String,
      enum: ['casa', 'departamento', 'local', 'bodega', 'rancho', 'terreno', 'playa', 'otro'],
      required: [true, 'El tipo de inmueble es obligatorio'],
    },
    operationType: {
      type: String,
      enum: ['venta', 'renta'],
      required: [true, 'El tipo de operación es obligatorio'],
    },
    address: { type: String, trim: true, default: '' },
    zone: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    price: { type: Number, min: 0, default: 0 },
    ticketValue: { type: Number, min: 0, default: 0 },
    description: { type: String, trim: true, default: '' },
    characteristics: [
      {
        name: { type: String, trim: true },
        value: { type: String, trim: true },
      },
    ],
    photos: [{ type: String, default: null }],
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
    },
    // Propietario externo: cuando no está en la cartera de clientes se guarda
    // el nombre en texto libre y `owner` queda en null.
    ownerName: { type: String, trim: true, default: '' },
    // "Se puede vender con…": contado, infonavit, banco, fovissste, todos, otro.
    paymentMethods: [{ type: String, enum: PROPERTY_PAYMENT_METHODS }],
    paymentMethodsOther: { type: String, trim: true, default: '' },
    responsibleUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: ['disponible', 'en_proceso', 'apartada', 'vendida', 'rentada', 'inactiva'],
      default: 'disponible',
    },
    isPublished: { type: Boolean, default: false },
    priceHistory: [
      {
        price: { type: Number, min: 0, default: 0 },
        date: { type: Date, default: Date.now },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

propertySchema.index({ type: 1, status: 1 });
propertySchema.index({ zone: 1, city: 1 });
propertySchema.index({ price: 1 });
propertySchema.index({ responsibleUser: 1 });
propertySchema.index({ isPublished: 1 });
// folio ya define índice único en el esquema (unique: true).

module.exports = mongoose.model('Property', propertySchema);
