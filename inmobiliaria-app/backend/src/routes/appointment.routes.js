'use strict';

const { Router } = require('express');
const { appointments, tasks, changeTaskStatus } = require('../controllers/appointment.controller');
const { protect } = require('../middlewares/auth');
const { appointmentRules, taskRules, idParam, statusRules } = require('../validators/appointment.validators');

const appointmentRouter = Router();
const taskRouter = Router();

appointmentRouter.use(protect);
taskRouter.use(protect);

appointmentRouter.get('/', appointments.list);
appointmentRouter.post('/', appointmentRules, appointments.create);
appointmentRouter.get('/:id', idParam, appointments.get);
appointmentRouter.put('/:id', idParam, appointmentRules, appointments.update);
appointmentRouter.delete('/:id', idParam, appointments.remove);

taskRouter.get('/', tasks.list);
taskRouter.post('/', taskRules, tasks.create);
taskRouter.get('/:id', idParam, tasks.get);
taskRouter.put('/:id', idParam, taskRules, tasks.update);
taskRouter.delete('/:id', idParam, tasks.remove);
taskRouter.patch('/:id/status', idParam, statusRules, changeTaskStatus);

module.exports = { appointmentRouter, taskRouter };
