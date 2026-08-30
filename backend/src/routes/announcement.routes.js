'use strict';

const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const {
  listAnnouncements,
  createAnnouncement,
  markAnnouncementRead,
  deleteAnnouncement,
} = require('../controllers/announcement.controller');

router.use(protect);

router.get('/', listAnnouncements);
router.post('/', createAnnouncement);
router.patch('/:id/read', markAnnouncementRead);
router.delete('/:id', deleteAnnouncement);

module.exports = router;
