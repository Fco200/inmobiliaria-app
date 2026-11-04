'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { UserRequest, Role, User } = require('../models');
const { ensure } = require('../services/notification.service');
const { logAudit } = require('../services/log.service');
const { sendMail, mailAccessRequestApproved, hasSmtp } = require('../services/mail.service');
const { generatePassword } = require('../utils/password');
const {
  normalizeRoleCode,
  isAssignableRoleCode,
  roleLabel,
} = require('../constants/roles');

// Solicitud pública de creación de un usuario nuevo. Cualquier persona desde el
// login puede pedir acceso; el administrador o el soporte técnico lo revisa y
// crea la cuenta. No requiere autenticación.
const create = asyncHandler(async (req, res) => {
  const { name, phone, email, role, message } = req.body || {};

  const cleanName = String(name || '').trim();
  const cleanPhone = String(phone || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanRole = isAssignableRoleCode(role) ? normalizeRoleCode(role) : 'asesor';

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
    Role.findOne({ code: 'direccion' }),
    Role.findOne({ code: 'asistencia' }),
    Role.findOne({ code: 'superadmin' }),
  ]).then((roleDocs) => {
    const roleIds = roleDocs.map((r) => r && r._id).filter(Boolean);
    return roleIds.length ? User.find({ role: { $in: roleIds }, status: 'activo' }) : [];
  });

  const roleLabelText = roleLabel(cleanRole);
  const title = 'Solicitud de nuevo usuario';
  const msg =
    `${cleanName} solicitó acceso como ${roleLabelText} ` +
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

// Genera un nombre de usuario único y legible a partir del correo. Evita el
// error de índice único cuando dos personas comparten el mismo prefijo
// (p. ej. ana@empresa.com y ana@otra.com -> ana, ana2, ana3…).
async function buildUniqueUsername(email) {
  const base = String(email || '')
    .split('@')[0]
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 32) || 'usuario';
  const safeBase = base.length >= 3 ? base : `${base}123`;

  let candidate = safeBase;
  let suffix = 1;
  // Tope defensivo para no quedar en un bucle si algo falla en la BD.
  while (suffix < 1000) {
    // eslint-disable-next-line no-await-in-loop
    const taken = await User.exists({ username: candidate });
    if (!taken) return candidate;
    suffix += 1;
    candidate = `${safeBase}${suffix}`;
  }
  return `${safeBase}${Date.now().toString().slice(-4)}`;
}

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

  const chosenRole = req.body && req.body.role ? String(req.body.role).trim() : '';
  if (action === 'aprobada' && chosenRole && !isAssignableRoleCode(chosenRole)) {
    return res.status(400).json({ success: false, message: 'Rol no válido para asignar.' });
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

  // Si fue aprobada, crear la cuenta y enviar las credenciales al solicitante.
  // La contraseña se genera automáticamente (nunca se usa la que la persona
  // escribió al solicitar acceso) y se envía por correo junto con el usuario.
  let accountResult = null;
  if (action === 'aprobada') {
    try {
      // El administrador puede cambiar el rol al aprobar; si no lo envía, se usa
      // el que pidió la persona.
      const requestedCode = chosenRole ? normalizeRoleCode(chosenRole) : (normalizeRoleCode(requestDoc.role) || 'asesor');
      const RoleModel = require('../models/role.model');
      let roleDoc = await RoleModel.findOne({ code: requestedCode });
      if (!roleDoc) roleDoc = await RoleModel.findOne({ code: 'asesor' });
      if (!roleDoc) throw new Error('No hay roles configurados para asignar al nuevo usuario.');
      requestDoc.role = roleDoc.code;
      await requestDoc.save();

      let user = await User.findOne({ email: requestDoc.email });
      const created = !user;
      let tempPassword = '';

      if (!user) {
        tempPassword = generatePassword(12);
        const username = await buildUniqueUsername(requestDoc.email);
        user = await User.create({
          name: requestDoc.name,
          email: requestDoc.email,
          username,
          phone: requestDoc.phone || '',
          role: roleDoc._id,
          password: tempPassword,
          status: 'activo',
        });
      }

      // Cuenta existente: no se cambia su rol ni su estado sin confirmación
      // explícita (`updateExisting`), para no sobrescribir privilegios por error.
      const updateExisting = Boolean(req.body && req.body.updateExisting);
      let existingUpdated = false;
      if (!created && updateExisting) {
        user.role = roleDoc._id;
        user.status = 'activo';
        await user.save();
        existingUpdated = true;
      }

      let emailSent = false;
      try {
        const mail = mailAccessRequestApproved({
          name: requestDoc.name,
          email: requestDoc.email,
          username: user.username,
          password: created ? tempPassword : '',
        });
        emailSent = await sendMail(mail);
      } catch (mailError) {
        console.error('No se pudo enviar el correo de credenciales:', mailError.message);
      }

      accountResult = {
        created,
        existing: !created,
        existingUpdated,
        username: user.username,
        role: roleDoc.code,
        emailSent,
        emailSimulated: !hasSmtp(),
        // Solo se devuelve si no hubo correo: así el administrador puede
        // entregarla por otro canal. Nunca se guarda en el registro.
        temporaryPassword: created && (!emailSent || !hasSmtp()) ? tempPassword : undefined,
      };

      await logAudit({
        user: req.user._id,
        action: 'creacion',
        entity: 'User',
        entityId: user._id,
        newValue: created ? 'cuenta creada desde solicitud de acceso' : 'cuenta existente reutilizada',
      });
    } catch (e) {
      console.error('Error al crear usuario desde solicitud:', e);
      // La solicitud ya quedó marcada como aprobada, pero devolvemos el detalle
      // para que el administrador sepa que debe crear la cuenta manualmente.
      return res.status(500).json({
        success: false,
        message: `La solicitud se marcó como aprobada, pero no se pudo crear la cuenta: ${e.message}`,
        data: requestDoc,
      });
    }
  }

  let message = 'Solicitud rechazada.';
  if (action === 'aprobada' && accountResult) {
    if (accountResult.created) {
      message = accountResult.emailSent
        ? `Cuenta creada para ${requestDoc.email} y credenciales enviadas por correo${accountResult.emailSimulated ? ' (modo prueba: correo simulado)' : ''}.`
        : `Cuenta creada para ${requestDoc.email}, pero no se pudo enviar el correo. Entrega la contraseña temporal manualmente.`;
    } else if (accountResult.existingUpdated) {
      message = `La cuenta ${requestDoc.email} ya existía. Se actualizó su rol a ${accountResult.role} y quedó activa.`;
    } else {
      message = `La cuenta ${requestDoc.email} ya existía; no se modificó su rol ni su estado. Se le envió un aviso por correo.`;
    }
  } else if (action === 'aprobada') {
    message = 'Solicitud aprobada.';
  }

  // El cliente HTTP desempaqueta `data`, por eso el resultado de la cuenta viaja dentro.
  res.json({
    success: true,
    message,
    data: { ...requestDoc.toObject(), account: accountResult, message },
  });
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const requestDoc = await UserRequest.findById(id);
  if (!requestDoc) return res.status(404).json({ success: false, message: 'Solicitud no encontrada.' });
  await requestDoc.deleteOne();
  res.json({ success: true, message: 'Solicitud eliminada.' });
});

module.exports = { create, list, handle, remove };
