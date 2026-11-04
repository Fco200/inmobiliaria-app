'use strict';

const { Router } = require('express');
const {
  listEvents,
  status,
  authUrl,
  callback,
  disconnect,
  toggleSync,
  syncToGoogle,
} = require('../controllers/calendar.controller');
const { protect } = require('../middlewares/auth');

const router = Router();

router.get('/events', protect, listEvents);
router.get('/status', protect, status);
router.get('/google/auth-url', protect, authUrl);
// El callback lo abre el navegador tras autorizar en Google (sin header
// Authorization). El usuario se identifica mediante el `state` (JWT de sesión).
router.get('/google/callback', callback);
router.post('/google/disconnect', protect, disconnect);
router.post('/google/toggle', protect, toggleSync);
router.post('/google/sync', protect, syncToGoogle);

module.exports = router;
