'use strict';

const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'El usuario es obligatorio'],
    },
    tokenHash: {
      type: String,
      required: [true, 'El token es obligatorio'],
      unique: true,
    },
    remember: { type: Boolean, default: false },
    device: { type: String, trim: true, default: '' },
    ip: { type: String, trim: true, default: '' },
    lastSeenAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

sessionSchema.index({ user: 1, createdAt: -1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Session', sessionSchema);
