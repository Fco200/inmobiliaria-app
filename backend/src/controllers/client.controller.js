'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const buildCrud = require('../utils/crud');
const { isBoss } = require('../utils/scope');
const { Client, Appointment, User } = require('../models');
const { googleCreateEvent } = require('./calendar.controller');
const { logActivity } = require('../services/log.service');

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
  extraFilters: { etapaActual: 'etapaActual', servicio: 'servicio', tipoPropiedad: 'tipoPropiedad' },
  textFilters: { zona: 'zona' },
  rangeFilters: { minCapacity: 'capacidad', maxCapacity: 'capacidad' },
});

const list = clientCrud.list;
const get = clientCrud.get;

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

module.exports = { list, get, create, update, remove, cambiarEtapa, registrarLlamada, historial, conteoEtapas };