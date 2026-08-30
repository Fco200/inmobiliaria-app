'use strict';

const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'El nombre del rol es obligatorio'], trim: true },
    code: {
      type: String,
      required: [true, 'El código del rol es obligatorio'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    description: { type: String, trim: true, default: '' },
    permissions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Permission',
      },
    ],
    isSystem: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['activo', 'inactivo'],
      default: 'activo',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

module.exports = mongoose.model('Role', roleSchema);
