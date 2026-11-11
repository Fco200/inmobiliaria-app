'use strict';

const { Router } = require('express');
const { protect } = require('../middlewares/auth');
const controller = require('../controllers/appraisal.controller');

const router = Router();

// Solo administración, gerencia, asistencia y escrituración pueden escribir.
// Los asesores pueden consultar la información.
function requireManager(req, res, next) {
  if (!controller.canManageAppraisals(req)) {
    return res.status(403).json({ success: false, message: 'Solo administración, gerencia, asistencia o escrituración pueden gestionar avalúos.' });
  }
  return next();
}

router.use(protect);

router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', requireManager, controller.create);
router.put('/:id', requireManager, controller.update);
router.delete('/:id', requireManager, controller.remove);
router.put('/:id/checklist', requireManager, controller.saveChecklist);
router.post('/:id/bitacora', requireManager, controller.addBitacora);

module.exports = router;
