'use strict';

const { Router } = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const clientRoutes = require('./client.routes');
const propertyRoutes = require('./property.routes');
const inventoryRoutes = require('./inventory.routes');
const businessRoutes = require('./business.routes');
const appointmentRoutes = require('./appointment.routes');
const financeRoutes = require('./finance.routes');
const dashboardRoutes = require('./dashboard.routes');
const generalRoutes = require('./general.routes');
const settingsRoutes = require('./settings.routes');
const sessionRoutes = require('./session.routes');
const reminderRoutes = require('./reminder.routes');
const publicRoutes = require('./public.routes');
const assistantRoutes = require('./assistant.routes');
const chatRoutes = require('./chat.routes');
const announcementRoutes = require('./announcement.routes');
const formatoRoutes = require('./formato.routes');
const soporteRoutes = require('./soporte.routes');
const configRoutes = require('./config.routes');
const userRequestRoutes = require('./userRequest.routes');
const calendarRoutes = require('./calendar.routes');
const meetingRoutes = require('./meeting.routes');
const router = Router();

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'API del CRM Inmobiliario',
    modules: [
      '/api/auth',
      '/api/users',
      '/api/clients',
      '/api/properties',
      '/api/inventory',
      '/api/businesses',
      '/api/appointments',
      '/api/tasks',
      '/api/goals',
      '/api/expenses',
      '/api/prospecting',
      '/api/documents',
      '/api/notifications',
      '/api/interactions',
      '/api/activity',
      '/api/reports',
      '/api/dashboard',
      '/api/settings',
      '/api/sessions',
      '/api/reminders',
      '/api/public',
      '/api/assistant',
      '/api/chats',
      '/api/announcements',
      '/api/formatos',
      '/api/soporte',
      '/api/config',
      '/api/user-requests',
      '/api/calendar',
      '/api/meetings',
      '/api/health',
    ],
  });
});

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/clients', clientRoutes);
router.use('/properties', propertyRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/businesses', businessRoutes);
router.use('/appointments', appointmentRoutes.appointmentRouter);
router.use('/tasks', appointmentRoutes.taskRouter);
router.use('/goals', financeRoutes.goalRouter);
router.use('/expenses', financeRoutes.expenseRouter);
router.use('/documents', generalRoutes.documentRouter);
router.use('/notifications', generalRoutes.notificationRouter);
router.use('/prospecting', generalRoutes.prospectingRouter);
router.use('/activity', generalRoutes.activityRouter);
router.use('/reports', generalRoutes.reportRouter);
router.use('/interactions', generalRoutes.interactionRouter);
router.use('/dashboard', dashboardRoutes);
router.use('/settings', settingsRoutes);
router.use('/sessions', sessionRoutes);
router.use('/reminders', reminderRoutes);
router.use('/public', publicRoutes);
router.use('/assistant', assistantRoutes);
router.use('/chats', chatRoutes);
router.use('/announcements', announcementRoutes);
router.use('/formatos', formatoRoutes);
router.use('/soporte', soporteRoutes);
router.use('/config', configRoutes);
router.use('/user-requests', userRequestRoutes);
router.use('/calendar', calendarRoutes);
router.use('/meetings', meetingRoutes);

module.exports = router;
