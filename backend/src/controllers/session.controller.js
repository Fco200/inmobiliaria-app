'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { Session, User } = require('../models');
const { hashToken } = require('../services/session.service');

const BOSS_ROLES = ['admin', 'gerencia', 'superadmin'];

const list = asyncHandler(async (req, res) => {
  const isBoss = BOSS_ROLES.includes(req.user.role.code);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);

  const filter = {};
  if (!isBoss) filter.user = req.user._id;
  if (req.query.user && isBoss) filter.user = req.query.user;

  const [total, items] = await Promise.all([
    Session.countDocuments(filter),
    Session.find(filter)
      .sort({ lastSeenAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name username email photo role'),
  ]);

  const currentHash = hashToken(req.token);
  const data = items.map((s) => ({
    ...s.toJSON(),
    isCurrent: s.tokenHash === currentHash,
  }));

  res.json({
    success: true,
    data,
    meta: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

const revoke = asyncHandler(async (req, res) => {
  const session = await Session.findById(req.params.id);
  if (!session) return res.status(404).json({ success: false, message: 'Sesión no encontrada' });

  const isBoss = BOSS_ROLES.includes(req.user.role.code);
  if (!isBoss && session.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'No puedes cerrar sesiones de otros usuarios',
    });
  }

  const isCurrent = session.tokenHash === hashToken(req.token);
  await Session.deleteOne({ _id: session._id });

  res.json({
    success: true,
    message: isCurrent ? 'Se cerró esta sesión' : 'Sesión cerrada',
    data: { selfRevoked: isCurrent },
  });
});

const revokeAllMine = asyncHandler(async (req, res) => {
  const currentHash = hashToken(req.token);
  const result = await Session.deleteMany({
    user: req.user._id,
    tokenHash: { $ne: currentHash },
  });
  res.json({
    success: true,
    message: 'Se cerraron las demás sesiones',
    data: { closed: result.deletedCount || 0 },
  });
});

const revokeUserSessions = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

  const result = await Session.deleteMany({ user: user._id });
  res.json({
    success: true,
    message: `Sesiones de ${user.name} cerradas`,
    data: { closed: result.deletedCount || 0 },
  });
});

module.exports = { list, revoke, revokeAllMine, revokeUserSessions };
