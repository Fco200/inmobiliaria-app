'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    photo: { type: String, default: null },
    name: { type: String, required: [true, 'El nombre es obligatorio'], trim: true },
    position: { type: String, trim: true, default: '' },
    bio: { type: String, trim: true, default: '' },
    email: {
      type: String,
      required: [true, 'El correo es obligatorio'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: { type: String, trim: true, default: '' },
    facebook: { type: String, trim: true, default: '' },
    instagram: { type: String, trim: true, default: '' },
    username: {
      type: String,
      required: [true, 'El usuario es obligatorio'],
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'La contraseña es obligatoria'],
      minlength: [8, 'La contraseña debe tener al menos 8 caracteres'],
      select: false,
    },
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: [true, 'El rol es obligatorio'],
    },
    status: {
      type: String,
      enum: ['activo', 'inactivo'],
      default: 'activo',
    },
    joinedAt: { type: Date, default: Date.now },
    lastLoginAt: { type: Date, default: null },
    // Bloqueo temporal por intentos fallidos de inicio de sesión.
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.index({ name: 1 });
userSchema.index({ role: 1 });

module.exports = mongoose.model('User', userSchema);
