'use strict';

const { Router } = require('express');
const { protect, authorize } = require('../middlewares/auth');
const { idParam } = require('../validators/general.validators');
const sessionsController = require('../controllers/session.controller');

const router = Router();

router.use(protect);

router.get('/', sessionsController.list);
router.post('/logout-all', sessionsController.revokeAllMine);
router.delete('/user/:userId', authorize('admin', 'direccion', 'gerencia', 'asistencia', 'superadmin'), sessionsController.revokeUserSessions);
router.delete('/:id', idParam, sessionsController.revoke);

module.exports = router;
