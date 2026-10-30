'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const buildCrud = require('../utils/crud');
const { User, Role, Permission } = require('../models');
const { logActivity } = require('../services/log.service');
const sessionService = require('../services/session.service');

const ASSISTANCE_ASSIGNABLE_ROLES = ['asesor', 'asistencia', 'escrituracion'];

function requesterRoleCode(req) {
  const role = req.user && req.user.role;
  return String((role && (role.code || role)) || '');
}

async function assertCanAssignRole(req, roleValue, targetUserId) {
  if (['admin', 'direccion', 'superadmin'].includes(requesterRoleCode(req))) return;

  if (roleValue === '__custom__') {
    throw Object.assign(new Error('Solo dirección o administración pueden crear roles personalizados.'), { statusCode: 403 });
  }

  if (roleValue) {
    const nextRole = await Role.findById(roleValue).select('code');
    if (nextRole && !ASSISTANCE_ASSIGNABLE_ROLES.includes(nextRole.code)) {
      throw Object.assign(new Error('Solo puedes asignar roles de asesor, asistencia o escrituración.'), { statusCode: 403 });
    }
  }

  if (targetUserId) {
    const target = await User.findById(targetUserId).populate('role');
    const targetCode = target && target.role ? target.role.code : '';
    if (targetCode && !ASSISTANCE_ASSIGNABLE_ROLES.includes(targetCode)) {
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

  await target.deleteOne();
  await sessionService.revokeUserSessions(target._id, 'USER_DEACTIVATED');
  res.json({ success: true, message: 'Registro eliminado' });
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
  removeUser,
  listRoles,
  createRole,
  updateRole,
  removeRole,
  listPermissions,
};
