'use strict';

const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    priority: {
      type: String,
      enum: ['normal', 'importante', 'urgente'],
      default: 'normal',
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Vigencia (opcional): tras esta fecha el aviso deja de mostrarse en el banner.
    expiresAt: {
      type: Date,
      default: null,
    },
    readBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
  }
);

announcementSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Announcement', announcementSchema);
