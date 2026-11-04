'use strict';

const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'El código del permiso es obligatorio'],
      unique: true,
      trim: true,
    },
    name: { type: String, required: [true, 'El nombre del permiso es obligatorio'], trim: true },
    module: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

permissionSchema.index({ module: 1 });

module.exports = mongoose.model('Permission', permissionSchema);
