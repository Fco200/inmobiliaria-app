'use strict';

const { Router } = require('express');
const { protect } = require('../middlewares/auth');
const { documentRules, documentUpdateRules, prospectingRules, idParam } = require('../validators/general.validators');
const documentController = require('../controllers/document.controller');
const notificationController = require('../controllers/notification.controller');
const prospectingController = require('../controllers/prospecting.controller');
const activityController = require('../controllers/activity.controller');
const reportController = require('../controllers/report.controller');
const interactionController = require('../controllers/interaction.controller');

const documentRouter = Router();
const notificationRouter = Router();
const prospectingRouter = Router();
const activityRouter = Router();
const reportRouter = Router();
const interactionRouter = Router();

documentRouter.use(protect);
notificationRouter.use(protect);
prospectingRouter.use(protect);
activityRouter.use(protect);
reportRouter.use(protect);
interactionRouter.use(protect);

documentRouter.get('/', documentController.list);
documentRouter.post('/', documentRules, documentController.create);
documentRouter.post('/upload', documentController.upload);
documentRouter.get('/:id', idParam, documentController.get);
documentRouter.put('/:id', idParam, documentUpdateRules, documentController.update);
documentRouter.delete('/:id', idParam, documentController.remove);

notificationRouter.get('/', notificationController.list);
notificationRouter.get('/unread-count', notificationController.unreadCount);
notificationRouter.post('/generate', notificationController.generate);
notificationRouter.post('/mark-all-read', notificationController.markAllRead);
notificationRouter.delete('/all', notificationController.clearAll);
notificationRouter.patch('/:id/read', idParam, notificationController.markRead);

prospectingRouter.get('/', prospectingController.list);
prospectingRouter.get('/summary', prospectingController.summary);
prospectingRouter.post('/', prospectingRules, prospectingController.create);
prospectingRouter.get('/:id', idParam, prospectingController.get);
prospectingRouter.put('/:id', idParam, prospectingRules, prospectingController.update);
prospectingRouter.delete('/:id', idParam, prospectingController.remove);

activityRouter.get('/', activityController.list);
activityRouter.get('/export', activityController.exportCsv);
activityRouter.delete('/all', activityController.clearMine);

reportRouter.get('/management', reportController.management);
reportRouter.get('/management/export', reportController.managementCsv);

interactionRouter.get('/', interactionController.list);
interactionRouter.post('/', interactionController.create);
interactionRouter.delete('/:id', interactionController.remove);

module.exports = {
  documentRouter,
  notificationRouter,
  prospectingRouter,
  activityRouter,
  reportRouter,
  interactionRouter,
};
