'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const ETAPAS = ['PROSPECTO', 'PERFILADO', 'SEGUIMIENTO', 'CITA', 'NEGOCIACION_CIERRE', 'POSTVENTA', 'DESCARTADO'];

const clientSchema = new Schema(
  {
    // ── Campos canónicos (NUEVA fuente de verdad) ───────────────────────
    // Los getters de abajo transforman los campos viejos sobre la marcha
    // para que los demás módulos sigan leyendo sin romperse.
    nombre: {
      type: String,
      trim: true,
      // Un cliente viejo (con solo `name`) sigue siendo editable; pero un
      // registro NUEVO siempre debe tener nombre. Falla solo si no hay
      // nombre canónico ni nombre legado.
      required: [
        function validateNombre() { return Boolean((this.nombre && String(this.nombre).trim()) || (this._doc && this._doc.name && String(this._doc.name).trim()) || (this.name && String(this.name).trim())); },
        'El nombre del cliente es obligatorio',
      ],
    },
    telefono: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    medio: {
      type: String,
      enum: ['WhatsApp', 'Facebook', 'Llamada', 'Portal', 'Portal Inmobiliario', 'Lona', 'Lona/Rótulo', 'Recomendación', 'Otro'],
      default: 'WhatsApp',
    },
    fechaRegistro: { type: Date, default: Date.now },
    servicio: {
      type: String,
      enum: ['Comprar', 'Vender', 'Rentar', 'Otro'],
      default: 'Comprar',
    },
    queBusca: { type: String, trim: true, default: '' },
    zona: { type: String, trim: true, default: '' },
    // Texto libre por diseño: Efectivo, Infonavit, Fovissste, Bancario, etc.
    formaPago: { type: String, trim: true, default: 'Contado' },
    capacidad: { type: Number, min: 0, default: 0 },
    vigencia: { type: String, trim: true, default: '' },
    etapaActual: { type: String, enum: ETAPAS, default: 'PROSPECTO' },
    ultVez: { type: Date, default: Date.now },
    totalLlamadas: { type: Number, min: 0, default: 0 },
    notasGenerales: { type: String, trim: true, default: '' },
    asesorAsignado: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    negocioId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      default: null,
    },
    ultimaCitaId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
    historialEtapas: [
      {
        etapaAnterior: { type: String, enum: ETAPAS.concat(['']), default: null },
        etapaNueva: { type: String, enum: ETAPAS, required: true },
        nota: { type: String, trim: true, required: true },
        usuario: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        fecha: { type: Date, default: Date.now },
      },
    ],

    // ── Estado del embudo y del expediente ──────────────────────────────
    status: {
      type: String,
      enum: ['activo', 'inactivo', 'concluido'],
      default: 'activo',
    },
    funnelStage: {
      // Incluye los valores legados ('promesa', 'cierre') para que los
      // clientes existentes puedan guardarse sin romper la validación.
      type: String,
      enum: ['prospecto', 'perfilado', 'contacto', 'cita', 'negociacion', 'postventa', 'descartado', 'promesa', 'cierre'],
      default: 'prospecto',
    },

    // ── Campos LEGADOS (se conservan como campos reales opcionales para no
    //    perder datos existentes. Los getters de abajo los transforman en
    //    lectura según el campo canónico equivalente) ─────────────────────
    type: {
      type: String,
      enum: ['comprar', 'vender', 'rentar', 'alquilar'],
      default: 'comprar',
      // Nuevo: mapeo por servicio (SOLO si el campo canónico existe de verdad
      // en el documento, no si quedó como default). Viejo: valor almacenado.
      get(v) {
        const s = this._doc && this._doc.servicio;
        if (s) {
          const map = { Comprar: 'comprador', Vender: 'vendedor', Rentar: 'rentar' };
          return map[s] || 'comprador';
        }
        return v || 'comprar';
      },
    },
    contactMedium: {
      type: String,
      enum: ['redes', 'referido', 'lona', 'tarjeta', 'sitio_web'],
      default: 'redes',
      get(v) {
        const m = this._doc && this._doc.medio;
        return m || v || 'redes';
      },
    },
    notes: {
      type: String,
      trim: true,
      default: '',
      get(v) {
        return this.notasGenerales || v || '';
      },
    },
    responsibleUser: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      get(v) {
        return this.asesorAsignado || v || null;
      },
    },
    joinedAt: {
      type: Date,
      default: Date.now,
      get(v) {
        return this.fechaRegistro || v || null;
      },
    },
    metodoPago: {
      type: String,
      enum: ['infonavit', 'credito_bancario', 'efectivo', 'credito_hipotecario', 'otro'],
      default: 'efectivo',
    },
    buyerInfo: {
      // Se conserva como Mixed para no perder los subcampos que ya existían
      // (créditos, enganche, bancos, etc.). El getter fusiona los campos
      // canónicos encima de los datos legados en las LECTURAS.
      type: Object,
      default: null,
      get(v) {
        const raw = this._doc || {};
        const canonical = {};
        if (raw.capacidad) canonical.budget = raw.capacidad;
        if (raw.zona) canonical.desiredZone = raw.zona;
        if (raw.queBusca) canonical.desiredFeatures = raw.queBusca;
        if (raw.formaPago) canonical.paymentMethod = raw.formaPago;
        if (!Object.keys(canonical).length) return v || null;
        return { ...(v && typeof v === 'object' ? v : {}), ...canonical };
      },
    },
    sellerInfo: {
      type: Object,
      default: null,
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
    toJSON: {
      getters: true,
      virtuals: true,
      transform(doc, ret) { delete ret.__v; return ret; },
    },
  }
);

// Virtuals de compatibilidad SOLO lectura para los campos que ya no viven
// como rutas reales (name/phone). El resto usa getters de path (ver arriba),
// porque mongoose no permite un virtual y una ruta con el mismo nombre.
clientSchema.virtual('name').get(function getName() {
  return this.nombre || (this._doc && this._doc.name) || '';
});
clientSchema.virtual('phone').get(function getPhone() {
  return this.telefono || (this._doc && this._doc.phone) || '';
});

clientSchema.index({ asesorAsignado: 1, status: 1 });
clientSchema.index({ nombre: 'text' });
clientSchema.index({ negocioId: 1 });
clientSchema.index({ email: 1 });

module.exports = mongoose.model('Client', clientSchema);