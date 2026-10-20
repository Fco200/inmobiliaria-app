'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const buildCrud = require('../utils/crud');
const { isBoss } = require('../utils/scope');
const { Client, Appointment, User } = require('../models');
const { googleCreateEvent } = require('./calendar.controller');
const { logActivity, logAudit } = require('../services/log.service');
const { ensure } = require('../services/notification.service');
const { toCsv, sendCsv } = require('../utils/csv');

// Etapas vigentes del embudo, en orden. 'PERFILADO' volvió a ser una etapa
// real (se recorre antes de la cita); 'SEGUIMIENTO' es la que sigue a la cita.
const ETAPAS = ['PROSPECTO', 'PERFILADO', 'CITA', 'SEGUIMIENTO', 'NEGOCIACION_CIERRE', 'POSTVENTA', 'DESCARTADO'];

const STAGE_TO_FUNNEL = {
  PROSPECTO: 'prospecto',
  PERFILADO: 'contacto',
  SEGUIMIENTO: 'contacto',
  CITA: 'cita',
  NEGOCIACION_CIERRE: 'negociacion',
  POSTVENTA: 'postventa',
  DESCARTADO: 'descartado',
};

// Campos que el cliente puede editar desde "Editar perfil". `vigencia`
// se retiró del formulario, por eso ya no se acepta desde la API.
const PROFILE_FIELDS = ['servicio', 'servicioOtro', 'tipoPropiedad', 'tipoPropiedadOtro', 'queBusca', 'zona', 'formaPago', 'formaPagoOtro', 'email', 'medio', 'medioOtro'];

// Etiquetas legibles de los campos rastreados en el historial de cambios.
const CAMPO_LABELS = {
  nombre: 'Nombre',
  telefono: 'Teléfono',
  email: 'Correo',
  medio: 'Medio de contacto',
  medioOtro: 'Medio (detalle)',
  servicio: 'Operación',
  servicioOtro: 'Operación (detalle)',
  tipoPropiedad: 'Tipo de propiedad',
  tipoPropiedadOtro: 'Tipo de propiedad (detalle)',
  queBusca: 'Qué busca',
  zona: 'Zona',
  formaPago: 'Forma de pago',
  formaPagoOtro: 'Forma de pago (detalle)',
  capacidad: 'Capacidad de pago',
  notasGenerales: 'Notas generales',
  asesorAsignado: 'Asesor asignado',
};

// Serie comparación de valores: nulos/vacios e ids de ObjectId cuentan como "".
function normalizarComparable(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val).trim();
}

// Guarda los cambios detectados en historialCambios + en la tabla de auditoría.
function registrarCambios(client, userId, changes) {
  if (!changes || !changes.length) return;
  changes.forEach((c) => {
    client.historialCambios.push({
      campo: c.campo,
      campoLabel: c.campoLabel || CAMPO_LABELS[c.campo] || c.campo,
      anterior: c.anterior || null,
      nuevo: c.nuevo || null,
      usuario: userId,
      fecha: new Date(),
    });
    logAudit({
      user: userId,
      action: 'actualizacion',
      entity: 'Client',
      entityId: client._id,
      field: c.campo,
      previousValue: c.anterior || null,
      newValue: c.nuevo || null,
      ip: '',
    });
  });
}

// Compara la fotografía previa con el body y devuelve la lista de cambios.
function diffCampos(snapshot, body) {
  const changes = [];
  Object.keys(CAMPO_LABELS).forEach((campo) => {
    if (!(campo in body)) return;
    const anterior = normalizarComparable(snapshot[campo]);
    const nuevo = normalizarComparable(body[campo]);
    if (anterior !== nuevo) {
      changes.push({ campo, anterior: snapshot[campo] || null, nuevo: body[campo] || null });
    }
  });
  return changes;
}

// Los formularios envían `null` en los campos vacíos. Se descartan: un campo
// sin llenar no debe bloquear la validación (p. ej. el correo, que es
// opcional) ni borrar el valor que ya tenía guardado el cliente.
function sinNulos(obj) {
  const out = { ...obj };
  Object.keys(out).forEach((key) => {
    if (out[key] === null) delete out[key];
  });
  return out;
}

const clientCrud = buildCrud(Client, {
  populate: ['asesorAsignado'],
  searchFields: ['nombre', 'telefono', 'email'],
  ownerField: 'asesorAsignado',
  // Filtros avanzados del módulo de clientes:
  //  - etapaActual: selección del embudo (pipeline superior).
  //  - servicio / tipoPropiedad: tipo de operación y tipo de propiedad.
  //  - zona: coincidencia parcial (zona de interés).
  //  - minCapacity / maxCapacity: rango de presupuesto (capacidad de pago).
  //  - paymentMethod: forma de pago/crédito (Infonavit, Fovissste, Banco…).
  extraFilters: { etapaActual: 'etapaActual', servicio: 'servicio', tipoPropiedad: 'tipoPropiedad', formaPago: 'formaPago' },
  textFilters: { zona: 'zona' },
  rangeFilters: { minCapacity: 'capacidad', maxCapacity: 'capacidad' },
});

const list = clientCrud.list;
const get = clientCrud.get;

// Catálogo LIGERO de clientes para selects con búsqueda (propietario de una
// propiedad, comprador/vendedor de un negocio). Devuelve solo _id, nombre,
// teléfono y asesor para no cargar el documento completo, y acepta ?q para
// filtrar en el servidor cuando la cartera es grande.
const options = asyncHandler(async (req, res) => {
  const filter = {};
  if (!isBoss(req)) filter.asesorAsignado = req.user._id;
  else if (req.query.asesor) filter.asesorAsignado = req.query.asesor;

  if (req.query.servicio) filter.servicio = req.query.servicio;
  const q = String(req.query.q || '').trim();
  if (q) {
    const term = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { nombre: { $regex: term, $options: 'i' } },
      { telefono: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
    ];
  }

  const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
  const items = await Client.find(filter)
    .select('nombre telefono email servicio tipoPropiedad asesorAsignado')
    .populate('asesorAsignado', 'name')
    .sort({ nombre: 1 })
    .limit(limit)
    .lean();

  res.json({ success: true, data: items });
});

function assertOwnership(req, client) {
  if (isBoss(req)) return true;
  const ownerId = String((client.asesorAsignado && client.asesorAsignado._id) || client.asesorAsignado || '');
  return ownerId === String(req.user._id);
}

// Valida que la etapa exista en el embudo. "PERFILADO" es etapa plena, así que
// NO se reescribe: sólo se normaliza el vacío y se descarta lo desconocido.
function normalizarEtapa(etapa) {
  const value = String(etapa || '').trim();
  if (!value) return 'PROSPECTO';
  return ETAPAS.includes(value) ? value : null;
}

// Sincroniza la cita creada al Google Calendar del usuario SI tiene la integración
// activa. Nunca lanza ni interrumpe el cambio de etapa (fire-and-forget).
async function syncCitaToGoogle(doc, user) {
  try {
    if (!doc || !user) return;
    const fullUser = await User.findById(user._id).select('+googleCalendar.accessToken +googleCalendar.refreshToken');
    const gc = (fullUser && fullUser.googleCalendar) || {};
    if (!gc.refreshToken || !gc.syncEnabled) return;
    const start = doc.date instanceof Date ? doc.date : new Date(doc.date);
    if (isNaN(start.getTime())) return;
    try {
      await googleCreateEvent(fullUser, {
        summary: `Cita con cliente`,
        description: doc.notes || '',
        start,
        end: new Date(start.getTime() + 60 * 60 * 1000),
        location: doc.place || '',
      });
    } catch (innerError) {
      console.error('[client.controller] No se pudo sincronizar la cita con Google:', innerError.message);
    }
  } catch (error) {
    console.error('[client.controller] No se pudo consultar la integración de Google:', error.message);
  }
}

// Conteo de clientes por etapa para la barra del embudo.
const conteoEtapas = asyncHandler(async (req, res) => {
  const filter = {};
  if (!isBoss(req)) filter.asesorAsignado = req.user._id;

  // Sólo se normaliza `etapaActual` ausente/ vacío a `PROSPECTO` para que el
  // total del embudo siempre cuadre con el listado. `PERFILADO` cuenta con su
  // propia columna, igual que en la interfaz.
  const rows = await Client.aggregate([
    { $match: filter },
    {
      $addFields: {
        etapaNormalizada: {
          $switch: {
            branches: [
              { case: { $eq: [{ $ifNull: ['$etapaActual', ''] }, ''] }, then: 'PROSPECTO' },
            ],
            default: '$etapaActual',
          },
        },
      },
    },
    { $group: { _id: '$etapaNormalizada', count: { $sum: 1 } } },
  ]);

  const counts = {
    PROSPECTO: 0,
    PERFILADO: 0,
    CITA: 0,
    SEGUIMIENTO: 0,
    NEGOCIACION_CIERRE: 0,
    POSTVENTA: 0,
    DESCARTADO: 0,
  };
  let total = 0;
  rows.forEach((row) => {
    const etapa = row._id || 'PROSPECTO';
    // Una etapa desconocida no debe romper el total del listado.
    if (!Object.prototype.hasOwnProperty.call(counts, etapa)) return;
    counts[etapa] = row.count;
    total += row.count;
  });
  counts.total = total;
  res.json({ success: true, data: counts });
});

const create = asyncHandler(async (req, res) => {
  const body = sinNulos(req.body);
  // Un asesor siempre es el dueño de sus clientes; el jefe puede asignar a cualquiera.
  if (!isBoss(req) || !body.asesorAsignado) body.asesorAsignado = req.user._id;

  if (!body.etapaActual) body.etapaActual = 'PROSPECTO';
  body.etapaActual = normalizarEtapa(body.etapaActual) || 'PROSPECTO';
  body.funnelStage = STAGE_TO_FUNNEL[body.etapaActual] || 'prospecto';
  body.fechaRegistro = body.fechaRegistro || new Date();
  body.ultVez = new Date();
  body.historialEtapas = [
    {
      etapaAnterior: null,
      etapaNueva: body.etapaActual,
      nota: body.etapaActual === 'PROSPECTO'
        ? 'Cliente registrado como Prospecto inicial'
        : `Cliente registrado directamente en etapa ${body.etapaActual}`,
      usuario: req.user._id,
      fecha: new Date(),
    },
  ];

  const client = await Client.create(body);

  await logActivity({
    entityType: 'Client',
    entityId: client._id,
    user: req.user._id,
    action: 'creacion',
    message: `Se registró el cliente ${client.nombre}`,
  });

  await client.populate('asesorAsignado');

  const asesorId = client.asesorAsignado && (client.asesorAsignado._id || client.asesorAsignado);
  if (asesorId && String(asesorId) !== String(req.user._id)) {
    ensure({
      type: 'nuevo_prospecto',
      key: `prospect-${client._id}`,
      title: 'Cliente asignado',
      message: `Se te asignó el cliente ${client.nombre}.`,
      userId: asesorId,
      data: { entityId: client._id },
    }).catch(() => {});
  }

  res.status(201).json({ success: true, data: client });
});

const update = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
  if (!assertOwnership(req, client)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este cliente.' });
  }

  const body = sinNulos(req.body);
  // Un asesor no puede reasignar el cliente; solo el jefe.
  if (!isBoss(req)) body.asesorAsignado = client.asesorAsignado || req.user._id;

  // `vigencia` se eliminó del formulario: si llega, se descarta.
  delete body.vigencia;
  if (body.etapaActual !== undefined) {
    body.etapaActual = normalizarEtapa(body.etapaActual) || 'PROSPECTO';
  }

  const previousEtapa = client.etapaActual;
  const snapshot = Object.fromEntries(Object.keys(CAMPO_LABELS).map((k) => [k, client[k]]));
  Object.assign(client, body);

  // Cambio de etapa desde la edición: sincroniza embudo y bitácora sin exigir nota.
  if (body.etapaActual && String(body.etapaActual) !== String(previousEtapa || '')) {
    client.funnelStage = STAGE_TO_FUNNEL[body.etapaActual] || client.funnelStage;
    client.ultVez = new Date();
    client.historialEtapas.push({
      etapaAnterior: previousEtapa || null,
      etapaNueva: body.etapaActual,
      nota: 'Etapa actualizada desde edicion',
      usuario: req.user._id,
      fecha: new Date(),
    });
  }

  // Bitácora de cambios de campos (quién, qué y cuándo) + Auditoria.
  const changes = diffCampos(snapshot, body);
  if (previousEtapa !== body.etapaActual) {
    changes.push({ campo: 'etapaActual', campoLabel: 'Etapa', anterior: previousEtapa || null, nuevo: body.etapaActual || null });
  }
  registrarCambios(client, req.user._id, changes);

  await client.save();
  await client.populate('asesorAsignado');

  await logActivity({
    entityType: 'Client',
    entityId: client._id,
    user: req.user._id,
    action: 'actualizacion',
    message: `Se actualizó el cliente ${client.nombre}`,
  });

  res.json({ success: true, data: client });
});

const cambiarEtapa = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const etapa = normalizarEtapa(body.etapaNueva || body.etapa);
  const cleanNota = String(body.nota || '').trim();
  if (!cleanNota) {
    return res.status(400).json({ success: false, message: 'La nota es obligatoria para mover de etapa.' });
  }
  if (!etapa) {
    return res.status(400).json({ success: false, message: 'Etapa no válida.' });
  }

  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
  if (!assertOwnership(req, client)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este cliente.' });
  }

  const previousEtapa = normalizarEtapa(client.etapaActual) || 'PROSPECTO';
  if (String(previousEtapa) === String(etapa)) {
    return res.status(400).json({ success: false, message: 'El cliente ya esta en esa etapa.' });
  }

  // Datos complementarios del destino: perfil, cita o cierre.
  // `vigencia` ya no forma parte del formulario, por eso no se acepta.
  const datosEtapa = (body.datosEtapa && typeof body.datosEtapa === 'object') ? body.datosEtapa : {};
  const snapshotEtapa = Object.fromEntries(Object.keys(CAMPO_LABELS).map((k) => [k, client[k]]));
  PROFILE_FIELDS.forEach((field) => {
    if (datosEtapa[field] !== undefined && datosEtapa[field] !== null && String(datosEtapa[field]).trim() !== '') {
      client[field] = datosEtapa[field];
    }
  });
  if (datosEtapa.capacidad !== undefined && datosEtapa.capacidad !== null && String(datosEtapa.capacidad).trim() !== '') {
    const cap = Number(datosEtapa.capacidad);
    if (!isNaN(cap)) client.capacidad = cap;
  }

  client.etapaActual = etapa;
  client.funnelStage = STAGE_TO_FUNNEL[etapa] || client.funnelStage;
  client.ultVez = new Date();
  client.historialEtapas.push({
    etapaAnterior: previousEtapa,
    etapaNueva: etapa,
    nota: cleanNota,
    usuario: req.user._id,
    fecha: new Date(),
  });

  // Etapa CITA → se agenda automáticamente una cita en el Calendario.
  let nuevaCita = null;
  if (etapa === 'CITA') {
    const fechaCita = String(datosEtapa.fechaCita || '').trim();
    const horaCita = String(datosEtapa.horaCita || '').trim();
    const fecha = fechaCita ? new Date(`${fechaCita}T${horaCita || '12:00'}:00`) : new Date();
    const fechaValida = fechaCita ? !isNaN(fecha.getTime()) : true;
    if (!fechaValida) {
      return res.status(400).json({ success: false, message: 'La fecha de la cita no es válida (usa el formato AAAA-MM-DD).' });
    }

    const asunto = String(datosEtapa.asunto || '').trim();
    nuevaCita = await Appointment.create({
      client: client._id,
      user: req.user._id,
      date: fecha,
      place: String(datosEtapa.lugarPropiedad || '').trim() || client.zona || 'Por definir',
      type: 'visita_propiedad',
      notes: `Cita agendada desde cambio de etapa de Cliente: ${cleanNota}${asunto ? ` | Asunto: ${asunto}` : ''}`,
      status: 'pendiente',
    });
    client.ultimaCitaId = nuevaCita._id;
    syncCitaToGoogle(nuevaCita, req.user);
  }

  // NEGOCIOS: la creación es EXCLUSIVAMENTE manual. Llegar a la etapa de
  // negociación/cierre ya NO genera ningún negocio en automático; el asesor
  // debe crearlo desde el módulo de Negocios (o vincular el existente).

  await client.save();
  await client.populate('asesorAsignado');

  // Bitácora de cambios del perfil + el movimiento de etapa (y Auditoria).
  const aplicaCapacidad = datosEtapa.capacidad !== undefined && datosEtapa.capacidad !== null
    && String(datosEtapa.capacidad).trim() !== '' && !isNaN(Number(datosEtapa.capacidad));
  const etpChanges = diffCampos(snapshotEtapa, datosEtapa)
    .filter((c) => c.campo !== 'capacidad' || aplicaCapacidad);
  etpChanges.push({ campo: 'etapaActual', campoLabel: 'Etapa', anterior: previousEtapa, nuevo: etapa });
  registrarCambios(client, req.user._id, etpChanges);

  await logActivity({
    entityType: 'Client',
    entityId: client._id,
    user: req.user._id,
    action: 'cambio_etapa',
    message: `El cliente pasó de "${previousEtapa}" a "${etapa}"`,
  });

  res.json({
    success: true,
    data: client,
    // Se mantiene el campo por compatibilidad con el frontend, pero solo
    // refleja un negocio que YA estaba vinculado: nunca se crea uno aquí.
    newNegocioId: client.negocioId || null,
    negocioCreadoAutomaticamente: false,
    newCita: nuevaCita ? { _id: nuevaCita._id, date: nuevaCita.date, place: nuevaCita.place } : null,
  });
});

const registrarLlamada = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
  if (!assertOwnership(req, client)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este cliente.' });
  }

  client.totalLlamadas = (client.totalLlamadas || 0) + 1;
  client.ultVez = new Date();
  registrarCambios(client, req.user._id, [
    { campo: 'totalLlamadas', campoLabel: 'Llamadas', anterior: client.totalLlamadas - 1, nuevo: client.totalLlamadas },
  ]);
  await client.save();
  await client.populate('asesorAsignado');

  await logActivity({
    entityType: 'Client',
    entityId: client._id,
    user: req.user._id,
    action: 'llamada',
    message: `Llamada registrada al cliente ${client.nombre} (#${client.totalLlamadas})`,
  });

  res.json({ success: true, data: client });
});

const historial = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
  if (!assertOwnership(req, client)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este cliente.' });
  }

  await client.populate('historialEtapas.usuario', 'name');

  const items = (client.historialEtapas || [])
    .slice()
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  res.json({ success: true, data: items });
});

const historialCambios = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
  if (!assertOwnership(req, client)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este cliente.' });
  }

  await client.populate('historialCambios.usuario', 'name');

  const items = (client.historialCambios || [])
    .slice()
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  res.json({ success: true, data: items });
});

const remove = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
  if (!assertOwnership(req, client)) {
    return res.status(403).json({ success: false, message: 'No tienes acceso a este cliente.' });
  }

  await client.deleteOne();

  await logActivity({
    entityType: 'Client',
    entityId: client._id,
    user: req.user._id,
    action: 'eliminacion',
    message: `Se eliminó el cliente ${client.nombre}`,
  });

  res.json({ success: true, message: 'Cliente eliminado' });
});

// Exporta los clientes a CSV con el mismo alcance del listado y sus filtros
// principales (etapa, operación y tipo de propiedad).
const exportCsv = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.etapaActual) filter.etapaActual = req.query.etapaActual;
  if (req.query.servicio) filter.servicio = req.query.servicio;
  if (req.query.tipoPropiedad) filter.tipoPropiedad = req.query.tipoPropiedad;
  if (!isBoss(req)) {
    filter.asesorAsignado = req.user._id;
  } else if (req.query.asesor) {
    filter.asesorAsignado = req.query.asesor;
  }

  const items = await Client.find(filter)
    .populate('asesorAsignado', 'name')
    .sort({ createdAt: -1 })
    .limit(5000);

  const rows = items.map((c) => ({
    nombre: c.nombre || '',
    telefono: c.telefono || '',
    email: c.email || '',
    medio: c.medio || '',
    operacion: c.servicio || '',
    tipoPropiedad: c.tipoPropiedad || '',
    zona: c.zona || '',
    capacidad: Number(c.capacidad) || 0,
    etapa: c.etapaActual || '',
    asesor: (c.asesorAsignado && c.asesorAsignado.name) || '',
    fechaRegistro: c.fechaRegistro ? new Date(c.fechaRegistro).toISOString() : '',
    notas: c.notasGenerales || '',
  }));

  sendCsv(res, 'clientes.csv', toCsv(rows, [
    { key: 'nombre', label: 'Nombre' },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'email', label: 'Correo' },
    { key: 'medio', label: 'Medio de contacto' },
    { key: 'operacion', label: 'Operación' },
    { key: 'tipoPropiedad', label: 'Tipo de propiedad' },
    { key: 'zona', label: 'Zona' },
    { key: 'capacidad', label: 'Capacidad de pago' },
    { key: 'etapa', label: 'Etapa' },
    { key: 'asesor', label: 'Asesor' },
    { key: 'fechaRegistro', label: 'Fecha de registro' },
    { key: 'notas', label: 'Notas' },
  ]));
});

module.exports = { list, get, options, create, update, remove, cambiarEtapa, registrarLlamada, historial, historialCambios, conteoEtapas, exportCsv };