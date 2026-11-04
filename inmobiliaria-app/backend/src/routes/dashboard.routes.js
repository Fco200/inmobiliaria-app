'use strict';

const { Router } = require('express');
const { summary, userReport, executive } = require('../controllers/dashboard.controller');
const { protect, authorize } = require('../middlewares/auth');

const router = Router();

router.use(protect);

router.get('/summary', summary);
router.get('/executive', authorize('admin', 'direccion', 'gerencia', 'superadmin'), executive);

// El reporte por usuario solo lo consulta él mismo o la jefatura.
router.get('/user/:userId', (req, res, next) => {
  const target = req.params.userId;
  const isSelf = target === 'me' || String(req.user._id) === target;
  if (!isSelf && !['admin', 'direccion', 'gerencia', 'superadmin'].includes(req.user.role && req.user.role.code)) {
    return res.status(403).json({ success: false, message: 'No tienes permisos para ver este reporte.' });
  }
  return next();
}, userReport);

module.exports = router;
