'use strict';

const { Router } = require('express');
const { protect } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const { Permission } = require('../models');
const settingsController = require('../controllers/settings.controller');

const router = Router();

router.get('/public', settingsController.getPublicSettings);

const requireSettingsAccess = asyncHandler(async (req, res, next) => {
  const role = req.user && req.user.role;
  const code = role && role.code;
  if (['admin', 'direccion', 'gerencia', 'asistencia', 'superadmin'].includes(code)) {
    return next();
  }
  const permissionIds = role && Array.isArray(role.permissions) ? role.permissions : [];
  if (permissionIds.length) {
    const allowed = await Permission.exists({ _id: { $in: permissionIds }, code: 'settings_manage' });
    if (allowed) return next();
  }
  return res.status(403).json({ success: false, message: 'No tienes permisos para realizar esta acción.' });
});

router.use(protect);
router.use(requireSettingsAccess);

router.get('/role-key', settingsController.getRoleKeyStatus);
router.put('/role-key', settingsController.setRoleKey);
router.put('/google-client-id', settingsController.setGoogleClientId);
router.put('/whatsapp-number', settingsController.setWhatsappNumber);
router.put('/landing', settingsController.setLanding);

module.exports = router;
