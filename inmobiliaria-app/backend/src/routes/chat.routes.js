'use strict';

const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const {
  listChats,
  getChat,
  createChat,
  sendMessage,
  markAsRead,
  unreadCount,
  clearMessages,
  general,
  supportChat,
} = require('../controllers/chat.controller');

router.use(protect);

router.get('/', listChats);
router.get('/general', general);
router.get('/soporte', supportChat);
router.get('/unread-count', unreadCount);
router.post('/', createChat);
router.get('/:id', getChat);
router.post('/:id/messages', sendMessage);
router.delete('/:id/messages', clearMessages);
router.patch('/:id/read', markAsRead);

module.exports = router;
