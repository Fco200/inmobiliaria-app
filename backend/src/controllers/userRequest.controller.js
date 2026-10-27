'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { UserRequest, Role, User } = require('../models');
const { ensure } = require('../services/notification.service');
const { logAudit } = require('../services/log.service');
const { sendMail } = require('../services/mail.service');
const { generatePassword } = require('../utils/password');

// Solicitud pública de creación de un usuario nuevo. Cualquier persona desde el
// login puede pedir acceso; el administrador o el soporte técnico lo revisa y
// crea la cuenta. No requiere autenticación.
const create = asyncHandler(async (req, res) => {
  const { name, phone, email, role, message } = req.body || {};

  const cleanName = String(name || '').trim();
  const cleanPhone = String(phone || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanRole = ['asesor', 'admin', 'gerencia'].includes(role) ? role : 'asesor';

  if (!cleanName) return res.status(400).json({ success: false, message: 'Ingresa tu nombre completo.' });
  if (!/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(cleanEmail)) {
    return res.status(400).json({ success: false, message: 'Ingresa un correo válido.' });
  }

  // Evitar duplicados de la misma solicitud pendiente (mismo correo).
  const existing = await UserRequest.findOne({ email: cleanEmail, status: 'pendiente' });
  if (existing) {
    return res.status(200).json({
      success: true,
      message: 'Ya recibimos una solicitud con ese correo. El administrador la está revisando.',
      data: existing,
    });
  }

  const requestDoc = await UserRequest.create({
    name: cleanName,
    phone: cleanPhone,
    email: cleanEmail,
    role: cleanRole,
    message: String(message || '').trim(),
    status: 'pendiente',
  });

  const recipients = await Promise.all([
    Role.findOne({ code: 'admin' }),
    Role.findOne({ code: 'superadmin' }),
  ]).then(([adminRole, supportRole]) => {
    const roleIds = [adminRole && adminRole._id, supportRole && supportRole._id].filter(Boolean);
    return roleIds.length ? User.find({ role: { $in: roleIds }, status: 'activo' }) : [];
  });

  const roleLabel = { asesor: 'Asesor', admin: 'Administrador', gerencia: 'Gerencia' }[cleanRole] || cleanRole;
  const title = 'Solicitud de nuevo usuario';
  const msg =
    `${cleanName} solicitó acceso como ${roleLabel} ` +
    `(${cleanEmail}${cleanPhone ? ' · ' + cleanPhone : ''}). Revisa la solicitud pendiente.`;

  for (const recipient of recipients) {
    try {
      await ensure({
        type: 'sistema',
        key: `user-request-${requestDoc._id}`,
        title,
        message: msg,
        userId: recipient._id,
        data: {
          requestId: String(requestDoc._id),
          nombre: cleanName,
          email: cleanEmail,
          rol: cleanRole,
          telefono: cleanPhone,
        },
      });
    } catch (e) {
      // No bloquear la solicitud si falla el aviso.
    }
  }

  res.status(201).json({
    success: true,
    message: 'Solicitud enviada correctamente. El administrador revisará tu acceso.',
    data: requestDoc,
  });
});

// Lista las solicitudes (solo administradores o soporte).
const list = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status && ['pendiente', 'aprobada', 'rechazada'].includes(status)) filter.status = status;
  const requests = await UserRequest.find(filter)
    .populate('handledBy', 'name username')
    .sort({ createdAt: -1 });
  res.json({ success: true, data: requests });
});

// Marca una solicitud como aprobada o rechazada (opcionalmente con comentario).
const handle = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const action = String(req.body && req.body.action || '').toLowerCase();
  const comment = String((req.body && req.body.comment) || '').trim();

  if (!['aprobada', 'rechazada'].includes(action)) {
    return res.status(400).json({ success: false, message: 'Acción no válida.' });
  }

  const requestDoc = await UserRequest.findById(id);
  if (!requestDoc) return res.status(404).json({ success: false, message: 'Solicitud no encontrada.' });
  if (requestDoc.status !== 'pendiente') {
    return res.status(400).json({ success: false, message: 'Esa solicitud ya fue atendida.' });
  }

  requestDoc.status = action;
  requestDoc.comment = comment;
  requestDoc.handledBy = req.user._id;
  requestDoc.handledAt = new Date();
  await requestDoc.save();

  await logAudit({
    user: req.user._id,
    action: 'actualizacion',
    entity: 'UserRequest',
    entityId: requestDoc._id,
    previousValue: 'pendiente',
    newValue: action,
  });

  // Si fue aprobada, crear usuario y enviar correo
  if (action === 'aprobada') {
    try {
      const RoleModel = require('../models/role.model');
      let roleDoc = null;
      if (requestDoc.role === 'admin') roleDoc = await RoleModel.findOne({ code: 'admin' });
      else if (requestDoc.role === 'gerencia') roleDoc = await RoleModel.findOne({ code: 'gerencia' });
      else roleDoc = await RoleModel.findOne({ code: 'asesor' });
      if (!roleDoc) roleDoc = await RoleModel.findOne({ code: 'asesor' });
      let user = await User.findOne({ email: requestDoc.email });
      if (!user) {
        const tempPassword = generatePassword ? generatePassword(10) : Math.random().toString(36).slice(-10);
        const base = (requestDoc.email.split('@')[0] || 'usuario').toLowerCase().replace(/[^a-z0-9]/g, '');
        const username = base.length >= 3 ? base : base + '123';
        user = await User.create({
          name: requestDoc.name,
          email: requestDoc.email,
          username: username,
          phone: requestDoc.phone || '',
          role: roleDoc ? roleDoc._id : undefined,
          password: tempPassword,
          status: 'activo',
        });
        try {
          await sendMail({
            to: requestDoc.email,
            subject: 'Tu acceso al CRM ha sido habilitado',
            html: '<p>Hola ' + requestDoc.name + ',</p><p>Tu solicitud de acceso al CRM INMOBLES ha sido aprobada y tu cuenta ya esta habilitada.</p><p>Puedes ingresar desde: <a href="' + (process.env.FRONTEND_URL || 'https://crm.inmobles.com') + '/index.html">' + (process.env.FRONTEND_URL || 'https://crm.inmobles.com') + '/index.html</a></p><p>Te recomendamos cambiar tu contrasena al primer inicio de sesion.</p>',
            text: 'Hola ' + requestDoc.name + ', tu acceso ha sido habilitado. Ingresa a ' + (process.env.FRONTEND_URL || 'https://crm.inmobles.com') + '/index.html. Cambia tu contrasena al primer ingreso.'
          });
        } catch (e) { /* ignore */ }
      }
    } catch (e) {
      console.error('Error al crear usuario desde solicitud:', e);
    }
  }

  // Si fue aprobada, crear usuario y enviar correo
  if (action === 'aprobada') {
    try {
      const RoleModel = require('../models/role.model');
      let roleDoc = null;
      if (requestDoc.role === 'admin') roleDoc = await RoleModel.findOne({ code: 'admin' });
      else if (requestDoc.role === 'gerencia') roleDoc = await RoleModel.findOne({ code: 'gerencia' });
      else roleDoc = await RoleModel.findOne({ code: 'asesor' });
      if (!roleDoc) roleDoc = await RoleModel.findOne({ code: 'asesor' });
      let user = await User.findOne({ email: requestDoc.email });
      if (!user) {
        const tempPassword = generatePassword ? generatePassword(10) : Math.random().toString(36).slice(-10);
        const base = (requestDoc.email.split('@')[0] || 'usuario').toLowerCase().replace(/[^a-z0-9]/g, '');
        const username = base.length >= 3 ? base : base + '123';
        user = await User.create({
          name: requestDoc.name,
          email: requestDoc.email,
          username: username,
          phone: requestDoc.phone || '',
          role: roleDoc ? roleDoc._id : undefined,
          password: tempPassword,
          status: 'activo',
        });
        try {
          await sendMail({
            to: requestDoc.email,
            subject: 'Tu acceso al CRM ha sido habilitado',
            html: '<p>Hola ' + requestDoc.name + ',</p><p>Tu solicitud de acceso al CRM INMOBLES ha sido aprobada y tu cuenta ya esta habilitada.</p><p>Puedes ingresar desde: <a href="' + (process.env.FRONTEND_URL || 'https://crm.inmobles.com') + '/index.html">' + (process.env.FRONTEND_URL || 'https://crm.inmobles.com') + '/index.html</a></p><p>Te recomendamos cambiar tu contrasena al primer inicio de sesion.</p>',
            text: 'Hola ' + requestDoc.name + ', tu acceso ha sido habilitado. Ingresa a ' + (process.env.FRONTEND_URL || 'https://crm.inmobles.com') + '/index.html. Cambia tu contrasena al primer ingreso.'
          });
        } catch (e) { /* ignore */ }
      }
    } catch (e) {
      console.error('Error al crear usuario desde solicitud:', e);
    }
  }

  res.json({ success: true, message: `Solicitud marcada como ${action}.`, data: requestDoc });
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const requestDoc = await UserRequest.findById(id);
  if (!requestDoc) return res.status(404).json({ success: false, message: 'Solicitud no encontrada.' });
  await requestDoc.deleteOne();
  res.json({ success: true, message: 'Solicitud eliminada.' });
});

module.exports = { create, list, handle, remove };
