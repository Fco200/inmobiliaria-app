'use strict';

const { Router } = require('express');
const { protect, authorize } = require('../middlewares/auth');
const controller = require('../controllers/newsletter.controller');

const router = Router();

// Administración del boletín y envío de campañas. El panel de soporte usa las
// mismas rutas con su sesión de SUPERADMIN.
// Autoservicio: cualquier usuario autenticado administra su propia suscripción.
router.get('/me', protect, controller.getMySubscription);
router.post('/me/subscribe', protect, controller.subscribeMe);
router.post('/me/unsubscribe', protect, controller.unsubscribeMe);

router.use(protect, authorize('admin', 'direccion', 'gerencia', 'asistencia', 'superadmin', 'system_admin'));

router.get('/subscribers', controller.listSubscribers);
router.patch('/subscribers/:id', controller.updateSubscriber);
router.delete('/subscribers/:id', controller.removeSubscriber);
router.get('/subscribers/export', controller.exportSubscribers);
router.get('/stats', controller.getStats);
router.get('/campaigns', controller.listCampaigns);
router.post('/campaign', controller.sendCampaign);

module.exports = router;
