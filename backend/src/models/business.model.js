'use strict';

const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'El nombre del negocio es obligatorio'],
      trim: true,
    },
    buyerClient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
    },
    sellerClient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      default: null,
    },
    mainAdvisor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'El asesor principal es obligatorio'],
    },
    partnerAdvisor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    partnerBusiness: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      default: null,
    },
    appointments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' }],
    tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
    documents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],
    expenses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Expense' }],
    ticket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket',
      default: null,
    },
    valueOperation: { type: Number, min: 0, default: 0 },
    processType: {
      type: String,
      enum: ['comprador', 'vendedor'],
      default: 'comprador',
    },
    currentStage: {
      type: String,
      enum: [
        'nuevo',
        'prospecto',
        'contactado',
        'perfilado',
        'cita',
        'captacion',
        'integracion_expedientes',
        'negociacion',
        'contrato',
        'promesa',
        'integracion',
        'avaluo',
        'revision',
        'notarias',
        'firma',
        'pago',
        'entrega',
        'postventa',
        'concluido',
        'cancelado',
      ],
      default: 'nuevo',
    },
    status: {
      type: String,
      enum: ['activo', 'concluido', 'cancelado'],
      default: 'activo',
    },
    negotiation: {
      offer: { type: Number, min: 0, default: 0 },
      counterOffer: { type: Number, min: 0, default: 0 },
      notes: { type: String, trim: true, default: '' },
    },
    closing: {
      promiseAmount: { type: Number, min: 0, default: 0 },
      promiseDate: { type: Date, default: null },
      closingAmount: { type: Number, min: 0, default: 0 },
      closingDate: { type: Date, default: null },
      commission: { type: Number, min: 0, default: 0 },
      participants: [
        {
          user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          share: { type: Number, min: 0, default: 0 },
        },
      ],
    },
    postSale: {
      followUps: [
        {
          date: { type: Date, default: null },
          note: { type: String, trim: true, default: '' },
          responsibleUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
          },
        },
      ],
      incidents: [
        {
          date: { type: Date, default: null },
          description: { type: String, trim: true, default: '' },
        },
      ],
    },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

businessSchema.index({ mainAdvisor: 1, status: 1 });
businessSchema.index({ currentStage: 1 });
businessSchema.index({ property: 1 });
businessSchema.index({ buyerClient: 1, sellerClient: 1 });
businessSchema.index({ valueOperation: 1 });

module.exports = mongoose.model('Business', businessSchema);
