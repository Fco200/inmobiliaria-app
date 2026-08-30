'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const buildCrud = require('../utils/crud');
const { isBoss } = require('../utils/scope');
const { Appointment, Task } = require('../models');

const appointmentCrud = buildCrud(Appointment, {
  populate: ['client', 'user', 'business', 'property'],
  searchFields: ['place', 'notes'],
  ownerField: 'user',
});

const taskCrud = buildCrud(Task, {
  populate: ['assignedTo', 'client', 'business', 'property'],
  searchFields: ['title', 'description'],
  ownerField: 'assignedTo',
});

const changeTaskStatus = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ success: false, message: 'Tarea no encontrada' });

  if (!isBoss(req) && String(task.assignedTo) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a esta tarea.' });
  }

  task.status = req.body.status;
  if (req.body.status === 'completada') task.completedAt = new Date();
  await task.save();

  res.json({ success: true, message: 'Estado de la tarea actualizado', data: task });
});

module.exports = {
  appointments: appointmentCrud,
  tasks: taskCrud,
  changeTaskStatus,
};
