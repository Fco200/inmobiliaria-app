'use strict';

const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const {
  listAnnouncements,
  createAnnouncement,
  markAnnouncementRead,
  deleteAnnouncement,
  clearAnnouncements,
} = require('../controllers/announcement.controller');

router.use(protect);

router.get('/', listAnnouncements);
router.post('/', createAnnouncement);
router.patch('/:id/read', markAnnouncementRead);
// '/all' debe ir ANTES de '/:id' para que no lo capture la ruta por id.
router.delete('/all', clearAnnouncements);
router.delete('/:id', deleteAnnouncement);

module.exports = router;
