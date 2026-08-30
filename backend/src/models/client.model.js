'use strict';

const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['vender', 'comprar', 'rentar', 'alquilar'],
      default: 'comprar',
    },
    name: {
      type: String,
      required: [true, 'El nombre del cliente es obligatorio'],
      trim: true,
    },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    contactMedium: {
      type: String,
      enum: ['redes', 'referido', 'lona', 'tarjeta', 'sitio_web'],
      default: 'redes',
    },
    responsibleUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'El usuario responsable es obligatorio'],
    },
    metodoPago: {
      type: String,
      enum: ['infonavit', 'credito_bancario', 'efectivo', 'credito_hipotecario', 'otro'],
      default: 'efectivo',
    },
    notes: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['activo', 'inactivo', 'concluido'],
      default: 'activo',
    },
    funnelStage: {
      type: String,
      enum: ['prospecto', 'cita', 'negociacion', 'promesa', 'cierre'],
      default: 'prospecto',
    },
    joinedAt: { type: Date, default: Date.now },

    sellerInfo: {
      operationType: {
        type: String,
        enum: ['venta', 'renta'],
        default: null,
      },
      property: { type: String, trim: true, default: '' },
      propertyType: {
        type: String,
        enum: ['casa', 'departamento', 'local', 'bodega', 'rancho', 'terreno', 'playa', 'otro'],
        default: null,
      },
      location: { type: String, trim: true, default: '' },
      hasMortgage: { type: Boolean, default: false },
      mortgageInstitution: { type: String, trim: true, default: '' },
      debt: { type: Number, min: 0, default: 0 },
      requestedPrice: { type: Number, min: 0, default: 0 },
      observations: { type: String, trim: true, default: '' },
    },

    buyerInfo: {
      desiredZone: { type: String, trim: true, default: '' },
      budget: { type: Number, min: 0, default: 0 },
      paymentMethod: { type: String, trim: true, default: '' },
      propertyType: {
        type: String,
        enum: ['casa', 'departamento', 'local', 'bodega', 'rancho', 'terreno', 'playa', 'otro'],
        default: null,
      },
      desiredFeatures: { type: String, trim: true, default: '' },
      observations: { type: String, trim: true, default: '' },

      // ── Financiamiento (créditos usados en México) ─────────────────────
      // ¿Combina dos créditos? (ej. INFONAVIT + FOVISSSTE es muy común).
      mergeCredits: { type: Boolean, default: false },
      // Semáforo del financiamiento del comprador.
      creditStatus: {
        type: String,
        enum: ['sin_aplica', 'solicitado', 'pre_aprobado', 'aprobado', 'en_escrituracion'],
        default: 'sin_aplica',
      },
      // Banco del crédito bancario /hipotecario (BBVA, Banorte, ...).
      bank: { type: String, trim: true, default: '' },
      // Enlace salarial: modalidad del financiamiento.
      salaryConnection: {
        type: String,
        enum: ['independiente', 'relacion_laboral', 'rfc_moral', 'otro'],
        default: 'independiente',
      },
      // Enganche que pagará el comprador.
      downPayment: { type: Number, min: 0, default: 0 },
      // Subcuenta de vivienda / subsidios (INFONAVIT/FOVISSSTE).
      subsidy: { type: Number, min: 0, default: 0 },
      // Recursos propios adicionales (apoyo familiar, etc.).
      ownResources: { type: Number, min: 0, default: 0 },
      // Total de financiamiento con el que pagará (se calcula automático:
      // suma de créditos + subcuenta/subsidio + recursos propios).
      totalFunding: { type: Number, min: 0, default: 0 },
      // Créditos aplicables al comprador (se puede combinar más de uno).
      credits: [{
        tipo: {
          type: String,
          enum: ['infonavit', 'fovissste', 'infonavit_fovissste', 'cofinavit', 'apoyo_infonavit', 'credito_bancario', 'credito_hipotecario', 'contado', 'otro'],
          default: 'otro',
        },
        monto: { type: Number, min: 0, default: 0 },
        institucion: { type: String, trim: true, default: '' },
        estatus: {
          type: String,
          enum: ['pendiente', 'solicitado', 'pre_aprobado', 'aprobado', 'otorgado'],
          default: 'pendiente',
        },
        observaciones: { type: String, trim: true, default: '' },
      }],
    },

    documentos: [{
      nombre: { type: String, trim: true },
      url: { type: String, trim: true },
      tipo: { type: String, trim: true },
      fechaSubida: { type: Date, default: Date.now },
    }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

clientSchema.index({ name: 'text' });
clientSchema.index({ responsibleUser: 1, status: 1 });
clientSchema.index({ email: 1 });

module.exports = mongoose.model('Client', clientSchema);
