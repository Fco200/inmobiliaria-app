'use strict';

const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: [true, 'La propiedad es obligatoria'],
      unique: true,
    },
    assignedAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isPublished: { type: Boolean, default: false },
    publishedAt: { type: Date, default: null },
    unpublishedAt: { type: Date, default: null },
    observations: { type: String, trim: true, default: '' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

inventorySchema.index({ isPublished: 1, assignedAgent: 1 });

module.exports = mongoose.model('Inventory', inventorySchema);
