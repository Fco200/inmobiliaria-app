'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const buildCrud = require('../utils/crud');
const {
  User,
  Role,
  Permission,
  Business,
  Property,
  Client,
  Appointment,
  Task,
  Goal,
  ProspectingActivity,
  Document,
  Appraisal,
  Inventory,
} = require('../models');
const { logActivity, logAudit } = require('../services/log.service');
const sessionService = require('../services/session.service');
const { isAssignableRoleCode } = require('../constants/roles');
const { generatePassword } = require('../utils/password');
const { sendMailWithin, mailPasswordResetByStaff, hasSmtp } = require('../services/mail.service');

// Quién puede administrar usuarios desde Configuración > Usuarios.
// Los tres roles administrativos pueden asignar cualquier rol; Asistencia
// también puede crear/aprobar cuentas con los seis roles oficiales, pero no
// puede editar cuentas de jerarquía superior (admin, dirección, gerencia o
// soporte técnico).
const USER_MANAGER_ROLES = ['admin', 'direccion', 'superadmin', 'asistencia'];
const ROLE_ADMIN_ROLES = ['admin', 'direccion', 'superadmin'];
const HIGHER_ROLES = ['admin', 'direccion', 'gerencia', 'superadmin'];

function requesterRoleCode(req) {
  const role = req.user && req.user.role;
  return String((role && (role.code || role)) || '');
}

async function assertCanAssignRole(req, roleValue, targetUserId) {
  const requester = requesterRoleCode(req);

  if (!USER_MANAGER_ROLES.includes(requester)) {
    throw Object.assign(new Error('No tienes permiso para administrar usuarios.'), { statusCode: 403 });
  }

  if (roleValue === '__custom__') {
    if (!ROLE_ADMIN_ROLES.includes(requester)) {
      throw Object.assign(new Error('Solo dirección o administración pueden crear roles personalizados.'), { statusCode: 403 });
    }
    return;
  }

  // Asistencia solo puede asignar los seis roles oficiales; dirección y
  // administración conservan la capacidad de asignar roles personalizados.
  if (roleValue && !ROLE_ADMIN_ROLES.includes(requester)) {
    const nextRole = await Role.findById(roleValue).select('code');
    if (nextRole && nextRole.code && !isAssignableRoleCode(nextRole.code)) {
      throw Object.assign(new Error('Solo puedes asignar uno de los seis roles oficiales del CRM.'), { statusCode: 403 });
    }
  }

  if (targetUserId && !ROLE_ADMIN_ROLES.includes(requester)) {
    const target = await User.findById(targetUserId).populate('role');
    const targetCode = target && target.role ? target.role.code : '';
    if (targetCode && HIGHER_ROLES.includes(targetCode)) {
      throw Object.assign(new Error('No puedes editar cuentas con un rol superior al tuyo.'), { statusCode: 403 });
    }
  }
}

const userCrud = buildCrud(User, {
  populate: ['role'],
  searchFields: ['name', 'email', 'username', 'phone'],
  // El usuario de SOPORTE TÉCNICO (rol superadmin) es una credencial interna de
  // administración: NO debe aparecer como asesor/integrante en el directorio,
  // listas, selectores de "asesor responsable" ni en el chat 1 a 1 del CRM.
  // El Panel de Soporte tiene su propio listado (/soporte/usuarios) y sigue
  // viéndolo. Se resuelve el rol con un filtro base (aplica a TODOS, incluidos
  // admin/gerencia) para no tener que filtrar página por página en el frontend.
  baseFilter: async () => {
    const supportRole = await Role.findOne({ code: 'superadmin' }).select('_id');
    return supportRole ? { role: { $nin: [supportRole._id] } } : {};
  },
  beforeCreate: (body) => {
    if (body.password === undefined || body.password === '') {
      throw Object.assign(new Error('La contraseña es obligatoria'), { statusCode: 400 });
    }
    return body;
  },
  beforeUpdate: async (body) => {
    // IMPORTANTE: NO hashear aquí. El modelo User ya hashea la contraseña en su
    // hook pre('save') (user.model.js); si también se hashea aquí, la contraseña
    // queda con DOBLE hash y nadie puede volver a iniciar sesión.
    if (!body.password) {
      delete body.password;
    }
    return body;
  },
  // Al desactivar un usuario o cambiarle la contraseña (o eliminarlo), se
  // revocan sus sesiones activas en tiempo real: el dispositivo afectado deja
  // de tener acceso al instante, aunque siga abierto.
  afterUpdate: async (doc, req, previous) => {
    const prevStatus = previous && previous.status;
    const wasActive = prevStatus === 'activo';
    const nowInactive = doc.status === 'inactivo';
    const body = req.body || {};
    if (wasActive && nowInactive) {
      await sessionService.revokeUserSessions(doc._id, 'USER_DEACTIVATED');
      return;
    }
    if (body.password) {
      const currentHash = sessionService.hashToken(req.token);
      await sessionService.revokeUserSessionsExcept(doc._id, currentHash, 'PASSWORD_CHANGED');
    }
  },
  afterRemove: async (doc) => {
    if (doc && doc._id) await sessionService.revokeUserSessions(doc._id, 'USER_DEACTIVATED');
  },
});

const listUsers = userCrud.list;
const getUser = userCrud.get;

const updateUser = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  const customPerms = Array.isArray(body.customPermissions) ? body.customPermissions.filter(Boolean) : [];

  await assertCanAssignRole(req, body.role, req.params.id);

  // Edición con rol personalizado: se crea un rol nuevo con los permisos
  // elegidos y se asigna al usuario (igual que en la creación).
  if (body.role === '__custom__') {
    if (!customPerms.length) {
      return res.status(400).json({ success: false, message: 'Selecciona al menos un permiso para el rol personalizado.' });
    }
    const target = await User.findById(req.params.id);
    const safeName = (body.name || (target && target.name) || 'Usuario').trim();
    const role = await Role.create({
      name: `Personalizado - ${safeName}`,
      code: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      description: 'Rol personalizado creado desde Configuración > Usuarios',
      permissions: customPerms,
      isSystem: false,
      status: 'activo',
    });
    body.role = role._id;
  }

  delete body.customPermissions;

  // Se reutiliza el CRUD base pasando el cuerpo ya normalizado.
  const originalBody = req.body;
  req.body = body;
  try {
    return await userCrud.update(req, res);
  } finally {
    req.body = originalBody;
  }
});

const createUser = asyncHandler(async (req, res) => {
  let body = { ...req.body };
  const customPerms = Array.isArray(body.customPermissions) ? body.customPermissions.filter(Boolean) : [];

  await assertCanAssignRole(req, body.role);

  if (body.role === '__custom__') {
    if (!customPerms.length) {
      return res.status(400).json({ success: false, message: 'Selecciona al menos un permiso para el rol personalizado.' });
    }

    const safeName = (body.name || 'Usuario').trim();
    const role = await Role.create({
      name: `Personalizado - ${safeName}`,
      code: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      description: 'Rol personalizado creado desde Configuración > Usuarios',
      permissions: customPerms,
      isSystem: false,
      status: 'activo',
    });

    body.role = role._id;
  }

  delete body.customPermissions;

  if (body.password === undefined || body.password === '') {
    return res.status(400).json({ success: false, message: 'La contraseña es obligatoria' });
  }

  const user = await User.create(body);
  const populated = await User.findById(user._id).populate('role');
  res.status(201).json({ success: true, data: populated });
});

// Restablece la contraseña de un usuario generando una temporal.
// Lo usan administración, dirección y ASISTENCIA para ayudar a un compañero
// que olvidó su contraseña. El correo se intenta enviar, pero la contraseña
// temporal también se devuelve para entregarla por WhatsApp o en persona.
const resetUserPassword = asyncHandler(async (req, res) => {
  await assertCanAssignRole(req, null, req.params.id);

  const target = await User.findById(req.params.id).populate('role');
  if (!target) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });

  const tempPassword = generatePassword(12);
  target.password = tempPassword;
  // Al cambiar la contraseña se invalidan los códigos de recuperación previos.
  target.resetCodeHash = null;
  target.resetCodeExpires = null;
  target.resetCodeAttempts = 0;
  await target.save();

  // Cierra las sesiones abiertas del usuario: deberá entrar con la temporal.
  await sessionService.revokeUserSessions(target._id, 'PASSWORD_RESET_BY_STAFF');

  let emailSent = false;
  let emailError = '';
  try {
    const mail = mailPasswordResetByStaff({
      name: target.name,
      email: target.email,
      username: target.username,
      password: tempPassword,
    });
    const result = await sendMailWithin(mail, 10000);
    emailSent = Boolean(result.sent);
    emailError = result.error || '';
  } catch (error) {
    emailError = error.message;
  }

  await logAudit({
    user: req.user._id,
    action: 'actualizacion',
    entity: 'User',
    entityId: target._id,
    previousValue: 'contraseña restablecida por personal autorizado',
    newValue: 'contraseña temporal generada',
  });

  const roleLabelText = target.role ? (target.role.name || target.role.code) : 'usuario';
  const message = emailSent
    ? `Contraseña temporal generada y enviada al correo de ${target.name}.`
    : `Contraseña temporal generada para ${target.name}. No se pudo enviar el correo${emailError ? ` (${emailError})` : ''}; entrega la contraseña por WhatsApp.`;

  res.json({
    success: true,
    message,
    data: {
      temporaryPassword: tempPassword,
      username: target.username,
      email: target.email,
      name: target.name,
      role: roleLabelText,
      emailSent,
      emailSimulated: !hasSmtp(),
      emailError,
    },
  });
});

// Campos donde un asesor puede aparecer como responsable. Se usan tanto para
// contar el impacto antes de borrarlo como para reasignar los registros al
// asesor que elija el administrador.
const ASSIGNMENT_MAP = [
  {
    key: 'negocios',
    label: 'Negocios',
    model: Business,
    fields: ['mainAdvisor', 'partnerAdvisor', 'asesor_captador_id', 'asesor_cliente_id', 'checklist.user'],
  },
  { key: 'propiedades', label: 'Propiedades', model: Property, fields: ['responsibleUser', 'history.user'] },
  { key: 'inventario', label: 'Inventario / publicaciones', model: Inventory, fields: ['assignedAgent'] },
  { key: 'avaluos', label: 'Avalúos', model: Appraisal, fields: ['createdBy', 'checklist.createdBy', 'bitacora.user'] },
  { key: 'clientes', label: 'Clientes', model: Client, fields: ['asesorAsignado', 'responsibleUser', 'historialEtapas.usuario', 'historialCambios.usuario', 'historialNotas.usuario'] },
  { key: 'citas', label: 'Citas', model: Appointment, fields: ['user'] },
  { key: 'tareas', label: 'Tareas', model: Task, fields: ['assignedTo'] },
  { key: 'metas', label: 'Metas', model: Goal, fields: ['user'] },
  { key: 'prospeccion', label: 'Prospección', model: ProspectingActivity, fields: ['user'] },
  { key: 'documentos', label: 'Documentos', model: Document, fields: ['uploadedBy'] },
];

function assignmentFilter(userId, fields) {
  return { $or: fields.map((field) => ({ [field]: userId })) };
}

// Los campos con punto del mapa viven dentro de arreglos de subdocumentos
// (checklist, history, historial…). En $set hay que usar el operador "$[]"
// para actualizar TODOS los elementos; sin él MongoDB rechaza la escritura.
function assignmentSetPath(field) {
  const parts = field.split('.');
  return parts.length === 1 ? field : `${parts[0]}.$[].${parts.slice(1).join('.')}`;
}

// GET /api/users/:id/impact — resumen de lo que quedaría huérfano al eliminar.
// El frontend lo usa para obligar a elegir un asesor de reemplazo.
const userImpact = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

  const counts = {};
  let total = 0;
  for (const entry of ASSIGNMENT_MAP) {
    const count = await entry.model.countDocuments(assignmentFilter(target._id, entry.fields));
    counts[entry.key] = count;
    total += count;
  }
  res.json({
    success: true,
    data: {
      userId: target._id,
      name: target.name,
      counts,
      total,
      entries: ASSIGNMENT_MAP.map(({ key, label }) => ({ key, label, count: counts[key] })),
    },
  });
});

const removeUser = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.id).populate('role');
  if (!target) {
    return res.status(404).json({ success: false, message: 'Registro no encontrado' });
  }

  const targetCode = target.role && target.role.code ? target.role.code : '';
  const protectedCodes = ['admin', 'direccion', 'gerencia', 'superadmin'];

  if (protectedCodes.includes(targetCode)) {
    return res.status(403).json({
      success: false,
      message: 'No puedes eliminar cuentas de Administrador, Dirección, Gerencia o Soporte.',
    });
  }

  // Reasignación OBLIGATORIA. El frontend pregunta por cada categoría con
  // registros (propiedades, negocios, avalúos, clientes, etc.) y envía
  // `reassignments: { propiedades: id, negocios: id, avaluos: id, ... }`.
  // `reassignTo` se acepta como opción global / compatibilidad.
  const body = req.body || {};
  const globalTarget = String(body.reassignTo || '').trim();
  const perEntity = body.reassignments && typeof body.reassignments === 'object' && !Array.isArray(body.reassignments)
    ? body.reassignments
    : {};

  const counts = {};
  let grandTotal = 0;
  for (const entry of ASSIGNMENT_MAP) {
    counts[entry.key] = await entry.model.countDocuments(assignmentFilter(target._id, entry.fields));
    grandTotal += counts[entry.key];
  }

  const replacements = new Map();
  const targets = {};
  for (const entry of ASSIGNMENT_MAP) {
    if (!counts[entry.key]) continue;
    const id = String(perEntity[entry.key] || globalTarget || '').trim();
    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: `Selecciona a qué asesor se transferirán: ${entry.label.toLowerCase()}.`,
      });
    }
    if (id === String(target._id)) {
      return res.status(400).json({ success: false, message: 'El asesor de reemplazo debe ser distinto.' });
    }
    if (!replacements.has(id)) {
      const user = await User.findById(id);
      if (!user) {
        return res.status(400).json({ success: false, message: 'Uno de los asesores de reemplazo no existe.' });
      }
      replacements.set(id, user);
    }
    targets[entry.key] = replacements.get(id);
  }

  const reassigned = {};
  for (const entry of ASSIGNMENT_MAP) {
    const replacement = targets[entry.key];
    if (!replacement) { reassigned[entry.key] = 0; continue; }
    let modified = 0;
    // Un update por campo: así un arreglo inexistente (p. ej. un cliente sin
    // notas) nunca hace fallar la reasignación de sus campos escalares.
    for (const field of entry.fields) {
      const result = await entry.model.updateMany(
        { [field]: target._id },
        { $set: { [assignmentSetPath(field)]: replacement._id } }
      );
      modified += result.modifiedCount || 0;
    }
    reassigned[entry.key] = modified;
  }

  const detalle = ASSIGNMENT_MAP
    .filter((entry) => targets[entry.key])
    .map((entry) => `${entry.label} → ${targets[entry.key].name}`)
    .join(', ');
  const resumen = detalle
    ? `Sus registros se reasignaron (${detalle}).`
    : 'No tenía registros asignados que transferir.';

  await logActivity({
    entityType: 'User',
    entityId: target._id,
    user: req.user._id,
    action: 'eliminacion',
    message: `Se eliminó al usuario ${target.name}. ${resumen}`,
  });
  await logAudit({
    user: req.user._id,
    action: 'eliminacion',
    entity: 'User',
    entityId: target._id,
    previousValue: `asesor: ${target.name}`,
    newValue: resumen,
  });

  await target.deleteOne();
  await sessionService.revokeUserSessions(target._id, 'USER_DEACTIVATED');
  res.json({
    success: true,
    message: grandTotal ? 'Registro eliminado y reasignado' : 'Registro eliminado',
    data: {
      reassignTo: globalTarget || (targets[Object.keys(targets)[0]] || {})._id || null,
      reassignments: Object.fromEntries(Object.entries(targets).map(([key, user]) => [key, user._id])),
      reassigned,
    },
  });
});

const listRoles = asyncHandler(async (req, res) => {
  const roles = await Role.find().populate('permissions').sort({ createdAt: 1 });
  res.json({ success: true, data: roles });
});

const createRole = asyncHandler(async (req, res) => {
  const role = await Role.create(req.body);
  res.status(201).json({ success: true, data: role });
});

const updateRole = asyncHandler(async (req, res) => {
  const role = await Role.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!role) return res.status(404).json({ success: false, message: 'Rol no encontrado' });
  res.json({ success: true, data: role });
});

const removeRole = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) return res.status(404).json({ success: false, message: 'Rol no encontrado' });
  if (role.isSystem) {
    return res.status(400).json({ success: false, message: 'No se puede eliminar un rol del sistema' });
  }
  await role.deleteOne();
  res.json({ success: true, message: 'Rol eliminado' });
});

const listPermissions = asyncHandler(async (req, res) => {
  const permissions = await Permission.find().sort({ module: 1, code: 1 });
  res.json({ success: true, data: permissions });
});

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  resetUserPassword,
  userImpact,
  removeUser,
  listRoles,
  createRole,
  updateRole,
  removeRole,
  listPermissions,
};
