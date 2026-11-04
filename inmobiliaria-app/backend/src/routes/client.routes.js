'use strict';

const { Router } = require('express');
const clientController = require('../controllers/client.controller');
const { protect } = require('../middlewares/auth');
const {
  clientRules,
  clientUpdateRules,
  stageRules,
  clientIdParam,
} = require('../validators/client.validators');

const router = Router();

router.use(protect);

router.get('/', clientController.list);
router.get('/export', clientController.exportCsv);
// Catálogo ligero para selects con búsqueda (propietario de propiedad, etc.).
// Debe ir antes de "/:id" para no chocar con el parámetro dinámico.
router.get('/options', clientController.options);
router.post('/', clientRules, clientController.create);

router.get('/conteo-etapas', clientController.conteoEtapas);

router.get('/:id/historial', clientIdParam, clientController.historial);
router.get('/:id/historial-cambios', clientIdParam, clientController.historialCambios);
router.post('/:id/cambiar-etapa', clientIdParam, stageRules, clientController.cambiarEtapa);
router.post('/:id/registrar-llamada', clientIdParam, clientController.registrarLlamada);

router.get('/:id', clientIdParam, clientController.get);
router.put('/:id', clientIdParam, clientUpdateRules, clientController.update);
router.delete('/:id', clientIdParam, clientController.remove);

module.exports = router;