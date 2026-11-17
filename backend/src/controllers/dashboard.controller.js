'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const {
  Client, Property, Business, Appointment, Task, Ticket, Expense, Goal, ProspectingActivity, Notification, User,
} = require('../models');
const { updateGoalsAuto } = require('../services/goal-auto.service');
const { isBoss, isCustomRole, hasPermission } = require('../utils/scope');

function seesAllDashboard(req) {
  return isBoss(req) || (isCustomRole(req) && hasPermission(req, 'reports_gerencia'));
}

// Rango inclusivo para los reportes por asesor ("Desde / Hasta").
function buildPeriodFilter(from, to, field = 'date') {
  const filter = {};
  if (from || to) {
    filter[field] = {};
    if (from) filter[field].$gte = new Date(from);
    if (to) filter[field].$lte = new Date(to);
  }
  return filter;
}

// La fecha del ticket puede ser generadoAt/collectedAt; los registros viejos
// sin esa fecha caen a createdAt.
function ticketDateExpr(field, from, to) {
  if (!from && !to) return {};
  const effective = { $ifNull: [`$${field}`, '$createdAt'] };
  const conditions = [];
  if (from) conditions.push({ $gte: [effective, new Date(from)] });
  if (to) conditions.push({ $lte: [effective, new Date(to)] });
  return { $expr: { $and: conditions } };
}

const CLOSURE_OPERATIONS = ['venta', 'renta', 'compra_localizada'];

const summary = asyncHandler(async (req, res) => {
  const user = req.user;
  updateGoalsAuto().catch(() => {});

  const isAdminOrGerencia = seesAllDashboard(req);
  // Un negocio cuenta para el asesor si lo captó (mainAdvisor) o si lo atiende
  // (partnerAdvisor); antes los cobrados donde solo atendía no aparecían.
  const myFilter = isAdminOrGerencia ? {} : { $or: [{ mainAdvisor: user._id }, { partnerAdvisor: user._id }] };

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
        negotiating: { $sum: { $subtract: ['$generatedAmount', '$collectedAmount'] } },
        pendingCount: { $sum: { $cond: [{ $and: [{ $ne: ['$status', 'cobrado'] }, { $ne: ['$status', 'cancelado'] }] }, 1, 0] } },
        totalCount: { $sum: { $cond: [{ $ne: ['$status', 'cancelado'] }, 1, 0] } },
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
        ticketsNegotiating: ticketAgg[0] ? ticketAgg[0].negotiating : 0,
        ticketsPorCobrar: ticketAgg[0] ? ticketAgg[0].pendingCount : 0,
        ticketsTotal: ticketAgg[0] ? ticketAgg[0].totalCount : 0,
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
  const { from, to } = req.query;

  // Fechas de alta (clientes, citas, gastos…) y de cierre (negocios
  // concluidos) para que "Desde/Hasta" aplique a todo el reporte.
  const period = buildPeriodFilter(from, to);
  const createdPeriod = buildPeriodFilter(from, to, 'createdAt');
  const finishedPeriod = buildPeriodFilter(from, to, 'finishedAt');

  const generatedMatch = { user: target, status: { $ne: 'cancelado' }, ...ticketDateExpr('generatedAt', from, to) };
  const collectedMatch = { user: target, collectedAmount: { $gt: 0 }, ...ticketDateExpr('collectedAt', from, to) };

  const [clients, activeBusinesses, concludedBusinesses, cancelledBusinesses, tasks, goals, tickets, expenses, funnelAgg] =
    await Promise.all([
      Client.countDocuments({ ...period, asesorAsignado: target }),
      Business.countDocuments({ ...createdPeriod, mainAdvisor: target, status: 'activo' }),
      Business.countDocuments({ ...finishedPeriod, mainAdvisor: target, status: 'concluido' }),
      Business.countDocuments({ ...createdPeriod, mainAdvisor: target, status: 'cancelado' }),
      Task.countDocuments({ ...createdPeriod, assignedTo: target }),
      Goal.countDocuments({ user: target }),
      Promise.all([
        Ticket.aggregate([
          { $match: generatedMatch },
          {
            $group: {
              _id: null,
              generated: { $sum: '$generatedAmount' },
              count: { $sum: 1 },
              pendingCount: { $sum: { $cond: [{ $ne: ['$status', 'cobrado'] }, 1, 0] } },
            },
          },
        ]),
        Ticket.aggregate([
          { $match: collectedMatch },
          { $group: { _id: null, collected: { $sum: '$collectedAmount' }, count: { $sum: 1 } } },
        ]),
      ]).then(([generatedAgg, collectedAgg]) => ({
        generated: generatedAgg[0] || {},
        collected: collectedAgg[0] || {},
      })),
      Expense.aggregate([
        { $match: { user: target, ...period } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Client.aggregate([
        { $match: { asesorAsignado: target, ...period } },
        { $group: { _id: '$funnelStage', count: { $sum: 1 } } },
      ]),
    ]);

  const [appointments, prospects, negotiations, closuresAgg] = await Promise.all([
    Appointment.countDocuments({ ...period, user: target }),
    Client.countDocuments({ ...period, asesorAsignado: target, status: 'activo' }),
    Business.countDocuments({ ...createdPeriod, mainAdvisor: target, currentStage: { $in: ['negociacion', 'promesa'] } }),
    Business.aggregate([
      { $match: { ...finishedPeriod, mainAdvisor: target, status: 'concluido' } },
      {
        $lookup: {
          from: 'properties',
          localField: 'property',
          foreignField: '_id',
          as: 'propertyDoc',
        },
      },
      { $unwind: { path: '$propertyDoc', preserveNullAndEmptyArrays: true } },
      {
        $match: {
          $or: [
            { 'propertyDoc.operationType': { $in: CLOSURE_OPERATIONS } },
            { propertyDoc: null },
          ],
        },
      },
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
      from: from || null,
      to: to || null,
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
      ticketsGenerated: tickets.generated.generated || 0,
      ticketsCollected: tickets.collected.collected || 0,
      ticketsNegotiating: Math.max(0, (tickets.generated.generated || 0) - (tickets.collected.collected || 0)),
      ticketsCount: tickets.generated.count || 0,
      ticketsPending: tickets.generated.pendingCount || 0,
      ticketsCollectedCount: tickets.collected.count || 0,
      expenses: expenses[0] ? expenses[0].total : 0,
      goals,
      funnel: funnelMap,
    },
  });
});

const executive = asyncHandler(async (req, res) => {
  if (!seesAllDashboard(req)) {
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
