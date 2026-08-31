'use strict';

const { Router } = require('express');
const { protect, authorize } = require('../middlewares/auth');
const settingsController = require('../controllers/settings.controller');

const router = Router();

router.get('/public', settingsController.getPublicSettings);

router.use(protect);
router.use(authorize('admin', 'gerencia'));

router.get('/role-key', settingsController.getRoleKeyStatus);
router.put('/role-key', settingsController.setRoleKey);
router.put('/google-client-id', settingsController.setGoogleClientId);
router.put('/whatsapp-number', settingsController.setWhatsappNumber);
router.put('/landing', settingsController.setLanding);
router.put('/support', settingsController.setSupport);

module.exports = router;
