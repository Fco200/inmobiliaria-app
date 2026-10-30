'use strict';

const { Router } = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const { protect } = require('../middlewares/auth');
const pushService = require('../services/push.service');

const router = Router();

router.use(protect);

// Llave pública VAPID: el navegador la necesita para llamar a
// pushManager.subscribe({ applicationServerKey }).
router.get('/vapid-public-key', (req, res) => {
  res.json({
    success: true,
    data: {
      publicKey: pushService.getPublicKey(),
      configured: pushService.isConfigured(),
      engine: pushService.getEngineName(),
    },
  });
});

// Registra o actualiza la suscripción de un navegador (POST /api/push/subscribe).
// Body: { endpoint, keys: { p256dh, auth }, userAgent? }
router.post(
  '/subscribe',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const subscription = body.subscription || body;
    const doc = await pushService.saveSubscription(req.user._id, subscription);
    res.status(201).json({
      success: true,
      message: 'Suscripción push registrada.',
      data: { endpoint: doc.endpoint, id: doc._id },
    });
  })
);

// Da de baja la suscripción de este dispositivo.
router.post(
  '/unsubscribe',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const endpoint = body.endpoint || (body.subscription && body.subscription.endpoint) || '';
    const result = await pushService.removeSubscription(req.user._id, endpoint);
    res.json({ success: true, data: result });
  })
);

// Envío de prueba desde Configuración → Alertas (valida toda la cadena).
router.post(
  '/test',
  asyncHandler(async (req, res) => {
    const result = await pushService.sendTest(req.user._id);
    if (!result || !result.total) {
      return res.status(404).json({
        success: false,
        message: 'Este dispositivo no tiene una suscripción push activa. Actívala primero.',
      });
    }
    return res.json({
      success: true,
      message: `Notificación enviada a ${result.sent} de ${result.total} dispositivo(s).`,
      data: result,
    });
  })
);

module.exports = router;
