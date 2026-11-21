'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { toCsv, sendCsv } = require('../utils/csv');
const {
  Client, Appointment, Business, Expense, Ticket, User, Task, Goal,
} = require('../models');
const { isBoss, isCustomRole, hasPermission } = require('../utils/scope');

// Mismos códigos canónicos que usa el módulo de Negocios (PROMESA, FIRMA…).
const NEGOTIATION_STAGES = ['negociacion', 'INTEGRACION', 'AVALUO', 'REVISION_AVALUO', 'NOTARIA', 'DICTAMEN_PRESUPUESTO'];
const PROMESA_STAGES = ['promesa', 'PROMESA', 'FIRMA', 'PAGO', 'ENTREGA'];

function canViewManagement(req) {
  return isBoss(req) || (isCustomRole(req) && hasPermission(req, 'reports_gerencia'));
}

function buildPeriodFilter(from, to, field = 'date') {
  const f = {};
  if (from || to) {
    f[field] = {};
    if (from) f[field].$gte = new Date(from);
    if (to) f[field].$lte = new Date(to);
  }
  return f;
}

// Expresión de fecha para tickets: usa la fecha del evento (generado/cobrado)
// y cae a createdAt en registros antiguos que no la tengan guardada.
function ticketDateExpr(field, from, to) {
  if (!from && !to) return {};
  const effective = { $ifNull: [`$${field}`, '$createdAt'] };
  const conditions = [];
  if (from) conditions.push({ $gte: [effective, new Date(from)] });
  if (to) conditions.push({ $lte: [effective, new Date(to)] });
  return { $expr: { $and: conditions } };
}

// Ventana del ticket: interesa si se generó o se cobró dentro del periodo.
function ticketPeriodExpr(from, to) {
  if (!from && !to) return {};
  const generated = { $ifNull: ['$generatedAt', '$createdAt'] };
  const collected = { $ifNull: ['$collectedAt', '$createdAt'] };
  const window = (value) => {
    const conditions = [];
    if (from) conditions.push({ $gte: [value, new Date(from)] });
    if (to) conditions.push({ $lte: [value, new Date(to)] });
    return { $and: conditions };
  };
  return { $expr: { $or: [window(generated), window(collected)] } };
}

const CLOSURE_OPERATIONS = ['venta', 'renta', 'compra_localizada'];

async function advisorIndicators(userId, { from, to, propertyType, operationType, businessStage }) {
  const period = buildPeriodFilter(from, to);
  const businessPeriod = buildPeriodFilter(from, to, 'createdAt');
  const finishedPeriod = buildPeriodFilter(from, to, 'finishedAt');

  const [prospects, contacts, appointments, tasks, activeBusinesses, concludedBusinesses, cancelledBusinesses, expenses, goals] =
    await Promise.all([
      Client.countDocuments({ ...period, asesorAsignado: userId, status: 'activo' }),
      Client.countDocuments({ ...period, asesorAsignado: userId, funnelStage: { $in: ['contacto', 'perfilado', 'cita', 'negociacion', 'promesa', 'cierre'] } }),
      Appointment.countDocuments({ ...period, user: userId }),
      Task.countDocuments({ assignedTo: userId }),
      Business.countDocuments({ ...businessPeriod, mainAdvisor: userId, status: 'activo' }),
      Business.countDocuments({ ...finishedPeriod, mainAdvisor: userId, status: 'concluido' }),
      Business.countDocuments({ ...businessPeriod, mainAdvisor: userId, status: 'cancelado' }),
      Expense.aggregate([
        { $match: { user: userId, ...period } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Goal.countDocuments({ user: userId, status: 'activa' }),
    ]);

  const businessMatch = { mainAdvisor: userId, ...businessPeriod };
  if (businessStage) businessMatch.currentStage = businessStage;

  // La operación (venta/renta/compra localizada) vive en la propiedad, no en el
  // negocio. Se resuelve con $lookup para que los filtros de tipo/operación y
  // el "Valor de cierres" cuenten sólo operaciones inmobiliarias.
  const propertyStages = [];
  if (businessStage) propertyStages.push({ $match: { currentStage: businessStage } });
  if (propertyType) propertyStages.push({ $match: { 'propertyDoc.type': propertyType } });
  if (operationType) propertyStages.push({ $match: { 'propertyDoc.operationType': operationType } });

  const [negotiations, promises, concludedAgg, cancelledAgg] = await Promise.all([
    Business.countDocuments({ ...businessMatch, currentStage: { $in: [...NEGOTIATION_STAGES, ...PROMESA_STAGES] } }),
    Business.countDocuments({ ...businessMatch, currentStage: { $in: PROMESA_STAGES } }),
    Business.aggregate([
      { $match: { mainAdvisor: userId, ...finishedPeriod, status: 'concluido' } },
      {
        $lookup: {
          from: 'properties',
          localField: 'property',
          foreignField: '_id',
          as: 'propertyDoc',
        },
      },
      { $unwind: { path: '$propertyDoc', preserveNullAndEmptyArrays: true } },
      ...propertyStages,
      {
        $match: {
          $or: [
            { 'propertyDoc.operationType': { $in: CLOSURE_OPERATIONS } },
            // Negocios sin propiedad vinculada: se conservan para no perder
            // captaciones externas, pero las operaciones distintas a venta,
            // renta o compra localizada no inflan el valor de cierres.
            { propertyDoc: null },
          ],
        },
      },
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

  // Los tickets se filtran por fecha de generación/cobro. Antes se sumaban
  // siempre todos y el reporte de gerencia ignoraba el rango "Desde/Hasta".
  const generatedMatch = { user: userId, status: { $ne: 'cancelado' }, ...ticketDateExpr('generatedAt', from, to) };
  const collectedMatch = { user: userId, collectedAmount: { $gt: 0 }, ...ticketDateExpr('collectedAt', from, to) };

  const [ticketGeneratedAgg, ticketCollectedAgg] = await Promise.all([
    Ticket.aggregate([
      { $match: generatedMatch },
      {
        $group: {
          _id: null,
          generated: { $sum: '$generatedAmount' },
          pendingAmount: { $sum: { $subtract: ['$generatedAmount', '$collectedAmount'] } },
          count: { $sum: 1 },
          pendingCount: { $sum: { $cond: [{ $ne: ['$status', 'cobrado'] }, 1, 0] } },
        },
      },
    ]),
    Ticket.aggregate([
      { $match: collectedMatch },
      {
        $group: {
          _id: null,
          collected: { $sum: '$collectedAmount' },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const generated = ticketGeneratedAgg[0] || {};
  const collected = ticketCollectedAgg[0] || {};
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
    ticketsGenerated: generated.generated || 0,
    ticketsCollected: collected.collected || 0,
    ticketsNegotiating: Math.max(0, (generated.generated || 0) - (collected.collected || 0)),
    ticketsCount: generated.count || 0,
    ticketsPending: generated.pendingCount || 0,
    ticketsCollectedCount: collected.count || 0,
    goals,
    conversion,
  };
}

// Prepara los indicadores por asesor (solo gerencia/admin). Compartido entre el
// JSON (GET /management) y el CSV (GET /management/export).
async function buildManagementData(req) {
  const { from, to, userId, propertyType, operationType, businessStage } = req.query;

  const advisors = await User.find({ status: 'activo' })
    .populate('role')
    .sort({ name: 1 });

  const selected = userId && userId !== 'all' ? [userId] : null;
  // Antes se excluía a dirección, superadmin y roles personalizados, por lo que
  // sus tickets nunca aparecían en la relación. Ahora se incluye a todo el
  // equipo activo (o solo al asesor elegido en el filtro).
  const targets = advisors.filter((u) => !selected || selected.includes(String(u._id)));

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
    ticketsNegotiating: sum('ticketsNegotiating'),
    ticketsCount: sum('ticketsCount'),
    ticketsPending: sum('ticketsPending'),
    ticketsCollectedCount: sum('ticketsCollectedCount'),
    goals: sum('goals'),
  };
  const grand = totals.activeBusinesses + totals.concludedBusinesses + totals.cancelledBusinesses;
  totals.conversion = grand ? Math.round((totals.concludedBusinesses / grand) * 100) : 0;

  // Relación detallada para gerencia: tickets de cada asesor y gastos hechos
  // en el periodo. Antes el reporte sólo mostraba totales y el usuario no podía
  // revisar la relación de tickets ni de gastos.
  const targetIds = targets.map((u) => u._id);
  const ticketFilter = { user: { $in: targetIds }, ...ticketPeriodExpr(from, to) };
  const expenseFilter = { user: { $in: targetIds }, ...buildPeriodFilter(from, to) };

  const [tickets, expenseList] = await Promise.all([
    Ticket.find(ticketFilter)
      .populate('business', 'name valueOperation status')
      .populate('user', 'name')
      .sort({ generatedAt: -1, createdAt: -1 })
      .limit(1000)
      .lean(),
    Expense.find(expenseFilter)
      .populate('business', 'name')
      .populate('user', 'name')
      .sort({ date: -1 })
      .limit(1000)
      .lean(),
  ]);

  return {
    from: from || null,
    to: to || null,
    totals,
    byUser: rows,
    tickets,
    expenses: expenseList,
  };
}

const management = asyncHandler(async (req, res) => {
  if (!canViewManagement(req)) {
    return res.status(403).json({ success: false, message: 'Solo gerencia, dirección o administración pueden ver este reporte' });
  }

  const data = await buildManagementData(req);
  res.json({ success: true, data });
});

const managementCsv = asyncHandler(async (req, res) => {
  if (!canViewManagement(req)) {
    return res.status(403).json({ success: false, message: 'Solo gerencia, dirección o administración pueden ver este reporte' });
  }

  const { byUser } = await buildManagementData(req);
  const rows = byUser.map((r) => ({
    asesor: r.userName || '',
    prospectos: r.prospects || 0,
    contactos: r.contacts || 0,
    citas: r.appointments || 0,
    tareas: r.tasks || 0,
    negociaciones: r.negotiations || 0,
    promesas: r.promises || 0,
    cierres: r.closures || 0,
    valorCierres: Number(r.closureValue) || 0,
    comision: Number(r.commission) || 0,
    cancelaciones: r.cancellations || 0,
    negociosActivos: r.activeBusinesses || 0,
    concluidos: r.concludedBusinesses || 0,
    cancelados: r.cancelledBusinesses || 0,
    inversion: Number(r.investment) || 0,
    ticketsGenerados: r.ticketsGenerated || 0,
    ticketsPorCobrar: Number(r.ticketsNegotiating) || 0,
    ticketsCobrados: r.ticketsCollected || 0,
    ticketsCantidad: r.ticketsCount || 0,
    ticketsPendientes: r.ticketsPending || 0,
    metas: r.goals || 0,
    conversion: r.conversion || 0,
  }));

  sendCsv(res, 'reporte-gerencia.csv', toCsv(rows, [
    { key: 'asesor', label: 'Asesor' },
    { key: 'prospectos', label: 'Prospectos' },
    { key: 'contactos', label: 'Contactos' },
    { key: 'citas', label: 'Citas' },
    { key: 'tareas', label: 'Tareas' },
    { key: 'negociaciones', label: 'Negociaciones' },
    { key: 'promesas', label: 'Promesas' },
    { key: 'cierres', label: 'Cierres' },
    { key: 'valorCierres', label: 'Valor de cierres (venta/renta/compra localizada)' },
    { key: 'comision', label: 'Comisión (ticket)' },
    { key: 'cancelaciones', label: 'Cancelaciones' },
    { key: 'negociosActivos', label: 'Negocios activos' },
    { key: 'concluidos', label: 'Negocios concluidos' },
    { key: 'cancelados', label: 'Negocios cancelados' },
    { key: 'inversion', label: 'Gastos / inversión' },
    { key: 'ticketsGenerados', label: 'Tickets generados (monto)' },
    { key: 'ticketsPorCobrar', label: 'Tickets por cobrar (monto)' },
    { key: 'ticketsCobrados', label: 'Tickets cobrados (monto)' },
    { key: 'ticketsCantidad', label: 'Tickets (cantidad)' },
    { key: 'ticketsPendientes', label: 'Tickets pendientes (cantidad)' },
    { key: 'metas', label: 'Metas activas' },
    { key: 'conversion', label: 'Conversión (%)' },
  ]));
});

module.exports = { management, managementCsv };
