'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const {
  Client, Property, Business, Appointment, Task, Ticket, Expense, Goal, ProspectingActivity, Notification, User,
} = require('../models');
const { updateGoalsAuto } = require('../services/goal-auto.service');

const summary = asyncHandler(async (req, res) => {
  const user = req.user;
  updateGoalsAuto().catch(() => {});

  const isAdminOrGerencia = ['admin', 'direccion', 'gerencia', 'superadmin'].includes(user.role.code);
  const myFilter = isAdminOrGerencia ? {} : { mainAdvisor: user._id };

  const [clients, properties, businessesActive, businessesConcluded, businessesCancelled, businessesNegotiation, businessesPromesa, appointmentsUpcoming, tasksPending, unread, expensesThisMonth, activeGoals, pipelineAgg, thisMonthAgg] =
    await Promise.all([
      Client.countDocuments(isAdminOrGerencia ? {} : { asesorAsignado: user._id }),
      Property.countDocuments(isAdminOrGerencia ? {} : { responsibleUser: user._id }),
      Business.countDocuments({ ...myFilter, status: 'activo' }),
      Business.countDocuments({ ...myFilter, status: 'concluido' }),
      Business.countDocuments({ ...myFilter, status: 'cancelado' }),
      Business.countDocuments({ ...myFilter, currentStage: 'negociacion' }),
      Business.countDocuments({ ...myFilter, currentStage: 'promesa' }),
      Appointment.countDocuments({ user: user._id, status: { $in: ['pendiente', 'confirmada'] }, date: { $gte: new Date() } }),
      Task.countDocuments({ assignedTo: user._id, status: 'pendiente' }),
      Notification.countDocuments({ user: user._id, read: false }),
      Expense.aggregate([
        {
          $match: {
            user: user._id,
            date: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Goal.countDocuments({ user: user._id, status: 'activa' }),
      Business.aggregate([
        { $match: { ...myFilter, status: 'activo' } },
        { $group: { _id: null, value: { $sum: '$valueOperation' } } },
      ]),
      Business.aggregate([
        {
          $match: {
            ...myFilter,
            status: 'concluido',
            finishedAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
          },
        },
        { $group: { _id: null, value: { $sum: '$valueOperation' }, count: { $sum: 1 } } },
      ]),
    ]);

  const ticketAgg = await Ticket.aggregate([
    { $match: { user: user._id } },
    {
      $group: {
        _id: null,
        generated: { $sum: '$generatedAmount' },
        collected: { $sum: '$collectedAmount' },
      },
    },
  ]);

  const [funnel, prospectingAgg] = await Promise.all([
    Client.aggregate([
      {
        $match: isAdminOrGerencia ? {} : { asesorAsignado: user._id },
      },
      { $group: { _id: '$funnelStage', count: { $sum: 1 } } },
    ]),
    ProspectingActivity.aggregate([
      { $match: isAdminOrGerencia ? {} : { user: user._id } },
      {
        $group: {
          _id: null,
          investment: { $sum: '$investment' },
          prospects: { $sum: '$prospectsObtained' },
        },
      },
    ]),
  ]);

  const funnelMap = { prospecto: 0, cita: 0, negociacion: 0, promesa: 0, cierre: 0 };
  funnel.forEach((f) => {
    funnelMap[f._id] = f.count;
  });

  const recentAppointments = await Appointment.find({ user: user._id, date: { $gte: new Date() } })
    .sort({ date: 1 })
    .limit(5)
    .populate('client');

  const recentTasks = await Task.find({ assignedTo: user._id, status: { $in: ['pendiente', 'en_proceso'] } })
    .sort({ date: 1 })
    .limit(5)
    .populate('client');

  res.json({
    success: true,
    data: {
      counters: {
        clients,
        properties,
        businessesActive,
        businessesConcluded,
        businessesCancelled,
        businessesNegotiation,
        businessesPromesa,
        appointmentsUpcoming,
        tasksPending,
        ticketsGenerated: ticketAgg[0] ? ticketAgg[0].generated : 0,
        ticketsCollected: ticketAgg[0] ? ticketAgg[0].collected : 0,
        notificationsUnread: unread,
        expensesThisMonth: expensesThisMonth[0] ? expensesThisMonth[0].total : 0,
        activeGoals,
        pipelineValue: pipelineAgg[0] ? pipelineAgg[0].value : 0,
        thisMonthValue: thisMonthAgg[0] ? thisMonthAgg[0].value : 0,
        thisMonthCount: thisMonthAgg[0] ? thisMonthAgg[0].count : 0,
      },
      funnel: funnelMap,
      prospection: {
        investment: prospectingAgg[0] ? prospectingAgg[0].investment : 0,
        prospects: prospectingAgg[0] ? prospectingAgg[0].prospects : 0,
      },
      recentAppointments,
      recentTasks,
    },
  });
});

const userReport = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const target = userId === 'me' ? req.user._id : userId;

  const [clients, activeBusinesses, concludedBusinesses, cancelledBusinesses, tasks, goals, tickets, expenses, funnelAgg] =
    await Promise.all([
      Client.countDocuments({ asesorAsignado: target }),
      Business.countDocuments({ mainAdvisor: target, status: 'activo' }),
      Business.countDocuments({ mainAdvisor: target, status: 'concluido' }),
      Business.countDocuments({ mainAdvisor: target, status: 'cancelado' }),
      Task.countDocuments({ assignedTo: target }),
      Goal.countDocuments({ user: target }),
      Ticket.aggregate([
        { $match: { user: target } },
        { $group: { _id: null, generated: { $sum: '$generatedAmount' }, collected: { $sum: '$collectedAmount' } } },
      ]),
      Expense.aggregate([
        { $match: { user: target } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Client.aggregate([
        { $match: { asesorAsignado: target } },
        { $group: { _id: '$funnelStage', count: { $sum: 1 } } },
      ]),
    ]);

  const [appointments, prospects, negotiations, closuresAgg] = await Promise.all([
    Appointment.countDocuments({ user: target }),
    Client.countDocuments({ asesorAsignado: target, status: 'activo' }),
    Business.countDocuments({ mainAdvisor: target, currentStage: { $in: ['negociacion', 'promesa'] } }),
    Business.aggregate([
      { $match: { mainAdvisor: target, status: 'concluido' } },
      { $group: { _id: null, value: { $sum: '$valueOperation' }, commission: { $sum: '$closing.commission' } } },
    ]),
  ]);

  const funnelMap = { prospecto: 0, cita: 0, negociacion: 0, promesa: 0, cierre: 0 };
  funnelAgg.forEach((f) => {
    funnelMap[f._id] = f.count;
  });

  res.json({
    success: true,
    data: {
      clients,
      prospects,
      appointments,
      tasks,
      activeBusinesses,
      concludedBusinesses,
      cancelledBusinesses,
      negotiations,
      closureValue: closuresAgg[0] ? closuresAgg[0].value : 0,
      commission: closuresAgg[0] ? closuresAgg[0].commission : 0,
      ticketsGenerated: tickets[0] ? tickets[0].generated : 0,
      ticketsCollected: tickets[0] ? tickets[0].collected : 0,
      expenses: expenses[0] ? expenses[0].total : 0,
      goals,
      funnel: funnelMap,
    },
  });
});

const executive = asyncHandler(async (req, res) => {
  const isBoss = ['admin', 'direccion', 'gerencia', 'superadmin'].includes(req.user.role.code);
  if (!isBoss) {
    return res.status(403).json({ success: false, message: 'Reporte solo para gerencia y administración' });
  }

  await updateGoalsAuto();

  const now = new Date();
  // Últimos 6 meses COMPLETOS: se excluye el mes en curso (aún sin cerrar).
  const start = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const endMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const [monthly, pipeline, topAdvisors, goalAgg] = await Promise.all([
    Business.aggregate([
      {
        $match: {
          status: 'concluido',
          finishedAt: { $gte: start, $lt: endMonth },
        },
      },
      {
        $group: {
          _id: { $month: '$finishedAt' },
          total: { $sum: '$valueOperation' },
          count: { $sum: 1 },
        },
      },
    ]),
    Business.aggregate([
      { $match: { status: 'activo' } },
      { $group: { _id: null, value: { $sum: '$valueOperation' }, count: { $sum: 1 } } },
    ]),
    Business.aggregate([
      {
        $match: { status: 'concluido', finishedAt: { $gte: new Date(now.getFullYear(), 0, 1) } },
      },
      {
        $group: {
          _id: '$mainAdvisor',
          value: { $sum: '$valueOperation' },
          count: { $sum: 1 },
        },
      },
      { $sort: { value: -1 } },
      { $limit: 5 },
    ]),
    Goal.aggregate([
      { $match: { status: 'activa' } },
      {
        $group: {
          _id: null,
          objective: { $sum: '$objectiveAmount' },
          current: { $sum: '$currentResult' },
        },
      },
    ]),
  ]);

  // Orden: el mes anterior al actual primero, seguido de los 5 anteriores.
  const monthlyMap = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1);
    return {
      month: monthNames[d.getMonth()],
      total: 0,
      count: 0,
    };
  });
  monthly.forEach((m) => {
    const idx = monthlyMap.findIndex((x) => x.month === monthNames[m._id - 1]);
    if (idx >= 0) {
      monthlyMap[idx].total = m.total;
      monthlyMap[idx].count = m.count;
    }
  });

  const advisorIds = topAdvisors.map((a) => a._id);
  const advisors = await User.find({ _id: { $in: advisorIds } }).select('name photo role');
  const advisorMap = {};
  advisors.forEach((u) => { advisorMap[String(u._id)] = u; });
  const top = topAdvisors.map((a) => ({
    user: advisorMap[String(a._id)] || null,
    value: a.value,
    count: a.count,
  }));

  res.json({
    success: true,
    data: {
      monthly: monthlyMap,
      pipeline: pipeline[0] ? { value: pipeline[0].value, count: pipeline[0].count } : { value: 0, count: 0 },
      goals: goalAgg[0] ? { objective: goalAgg[0].objective, current: goalAgg[0].current } : { objective: 0, current: 0 },
      topAdvisors: top,
    },
  });
});

module.exports = { summary, userReport, executive };
