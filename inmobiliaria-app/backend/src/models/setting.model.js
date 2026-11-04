'use strict';

const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, 'La clave del ajuste es obligatoria'],
      unique: true,
      trim: true,
    },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    group: { type: String, trim: true, default: 'general' },
    description: { type: String, trim: true, default: '' },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

settingSchema.index({ group: 1 });

module.exports = mongoose.model('Setting', settingSchema);
