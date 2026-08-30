'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const {
  Client, Appointment, Business, Expense, Ticket, User, Task, Goal,
} = require('../models');

function buildPeriodFilter(from, to) {
  const f = {};
  if (from || to) {
    f.date = {};
    if (from) f.date.$gte = new Date(from);
    if (to) f.date.$lte = new Date(to);
  }
  return f;
}

async function advisorIndicators(userId, { from, to, propertyType, operationType, businessStage }) {
  const period = buildPeriodFilter(from, to);

  const [prospects, contacts, appointments, tasks, activeBusinesses, concludedBusinesses, cancelledBusinesses, expenses, goals] =
    await Promise.all([
      Client.countDocuments({ ...period, responsibleUser: userId, status: 'activo' }),
      Client.countDocuments({ responsibleUser: userId, funnelStage: { $in: ['contacto', 'cita', 'negociacion', 'promesa'] } }),
      Appointment.countDocuments({ ...period, user: userId }),
      Task.countDocuments({ assignedTo: userId }),
      Business.countDocuments({ mainAdvisor: userId, status: 'activo' }),
      Business.countDocuments({ mainAdvisor: userId, status: 'concluido' }),
      Business.countDocuments({ mainAdvisor: userId, status: 'cancelado' }),
      Expense.aggregate([
        { $match: { user: userId, ...period } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Goal.countDocuments({ user: userId, status: 'activa' }),
    ]);

  const propertyFilter = {};
  if (propertyType) propertyFilter['property.type'] = propertyType;
  if (operationType) propertyFilter['property.operationType'] = operationType;
  const businessPeriod = {};
  if (from || to) {
    businessPeriod.createdAt = {};
    if (from) businessPeriod.createdAt.$gte = new Date(from);
    if (to) businessPeriod.createdAt.$lte = new Date(to);
  }
  const businessMatch = { mainAdvisor: userId, ...businessPeriod, ...propertyFilter };
  if (businessStage) businessMatch.currentStage = businessStage;

  const [negotiations, promises, concludedAgg, cancelledAgg] = await Promise.all([
    Business.countDocuments({ ...businessMatch, currentStage: { $in: ['negociacion', 'promesa'] } }),
    Business.countDocuments({ ...businessMatch, currentStage: 'promesa' }),
    Business.aggregate([
      { $match: { ...businessMatch, status: 'concluido' } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          value: { $sum: '$valueOperation' },
          commission: { $sum: '$closing.commission' },
        },
      },
    ]),
    Business.countDocuments({ ...businessMatch, status: 'cancelado' }),
  ]);

  const tickets = await Ticket.aggregate([
    { $match: { user: userId } },
    { $group: { _id: null, generated: { $sum: '$generatedAmount' }, collected: { $sum: '$collectedAmount' } } },
  ]);

  const total = activeBusinesses + concludedBusinesses + cancelledBusinesses;
  const conversion = total ? Math.round((concludedBusinesses / total) * 100) : 0;

  return {
    userId,
    prospects,
    contacts,
    appointments,
    tasks,
    negotiations,
    promises,
    closures: concludedAgg[0] ? concludedAgg[0].count : 0,
    closureValue: concludedAgg[0] ? concludedAgg[0].value : 0,
    commission: concludedAgg[0] ? concludedAgg[0].commission : 0,
    cancellations: cancelledAgg,
    activeBusinesses,
    concludedBusinesses,
    cancelledBusinesses,
    investment: expenses[0] ? expenses[0].total : 0,
    ticketsGenerated: tickets[0] ? tickets[0].generated : 0,
    ticketsCollected: tickets[0] ? tickets[0].collected : 0,
    goals,
    conversion,
  };
}

const management = asyncHandler(async (req, res) => {
  if (!['admin', 'gerencia'].includes(req.user.role.code)) {
    return res.status(403).json({ success: false, message: 'Solo gerencia o administrador pueden ver este reporte' });
  }

  const { from, to, userId, propertyType, operationType, businessStage } = req.query;

  const advisors = await User.find({ status: 'activo' })
    .populate('role')
    .sort({ name: 1 });

  const selected = userId && userId !== 'all' ? [userId] : null;
  const targets = advisors.filter((u) => {
    if (selected && !selected.includes(String(u._id))) return false;
    return u.role && ['admin', 'gerencia', 'asesor'].includes(u.role.code);
  });

  const rows = await Promise.all(
    targets.map((u) =>
      advisorIndicators(u._id, { from, to, propertyType, operationType, businessStage }).then((r) => ({
        ...r,
        userName: u.name,
        userId: u._id,
        advisor: {
          _id: u._id,
          name: u.name,
          username: u.username,
          email: u.email,
          photo: u.photo,
          position: u.position,
          phone: u.phone,
          role: u.role ? u.role.name : '',
          roleCode: u.role ? u.role.code : '',
          joinedAt: u.joinedAt,
          lastLoginAt: u.lastLoginAt,
        },
      }))
    )
  );

  const sum = (key) => rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
  const totals = {
    prospects: sum('prospects'),
    contacts: sum('contacts'),
    appointments: sum('appointments'),
    tasks: sum('tasks'),
    negotiations: sum('negotiations'),
    promises: sum('promises'),
    closures: sum('closures'),
    closureValue: sum('closureValue'),
    commission: sum('commission'),
    cancellations: sum('cancellations'),
    activeBusinesses: sum('activeBusinesses'),
    concludedBusinesses: sum('concludedBusinesses'),
    cancelledBusinesses: sum('cancelledBusinesses'),
    investment: sum('investment'),
    ticketsGenerated: sum('ticketsGenerated'),
    ticketsCollected: sum('ticketsCollected'),
    goals: sum('goals'),
  };
  const grand = totals.activeBusinesses + totals.concludedBusinesses + totals.cancelledBusinesses;
  totals.conversion = grand ? Math.round((totals.concludedBusinesses / grand) * 100) : 0;

  res.json({
    success: true,
    data: {
      from: from || null,
      to: to || null,
      totals,
      byUser: rows,
    },
  });
});

module.exports = { management };
