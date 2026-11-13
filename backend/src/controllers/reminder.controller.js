'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { Task, Appointment } = require('../models');

const upcoming = asyncHandler(async (req, res) => {
  const now = new Date();
  const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  // Se incluyen los recordatorios de los últimos 10 minutos: el navegador
  // consulta cada minuto y puede llegar unos segundos TARDE. Si sólo se
  // pidieran fechas futuras, un recordatorio de las 12:15 jamás aparecería
  // cuando la consulta corre a las 12:15:20.
  const since = new Date(now.getTime() - 10 * 60 * 1000);

  const [tasks, appointments] = await Promise.all([
    Task.find({
      assignedTo: req.user._id,
      status: { $in: ['pendiente', 'en_proceso'] },
      date: { $gte: since, $lte: end },
    })
      .populate('client', 'nombre name telefono phone')
      .sort({ date: 1 }),
    Appointment.find({
      user: req.user._id,
      status: { $in: ['pendiente', 'confirmada'] },
      $or: [
        { date: { $gte: since, $lte: end } },
        { reminder: { $gte: since, $lte: end } },
      ],
    })
      .populate('client', 'nombre name telefono phone')
      .sort({ date: 1 }),
  ]);

  res.json({
    success: true,
    data: {
      tasks: tasks.map((t) => ({
        id: t._id,
        kind: 'task',
        title: t.title,
        date: t.date,
        clientName: t.client ? t.client.name : '',
      })),
      appointments: appointments.map((a) => ({
        id: a._id,
        kind: 'appointment',
        title: a.type,
        date: a.date,
        reminder: a.reminder || null,
        clientName: a.client ? a.client.name : '',
      })),
    },
  });
});

module.exports = { upcoming };
