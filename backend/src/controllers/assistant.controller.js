'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const {
  Client, Property, Business, Appointment, Task, Goal, Expense, Notification, ProspectingActivity, User,
} = require('../models');

const money = (n) => (Number(n) || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

const CAPABILITIES = [
  '• Propiedades: "¿cuántas propiedades tengo?"',
  '• Clientes: "¿cómo van los clientes?"',
  '• Citas: "¿qué citas tengo hoy?"',
  '• Tareas: "¿cuántas tareas pendientes tengo?"',
  '• Metas: "¿cómo van mis metas?"',
  '• Ingresos: "¿van creciendo los ingresos?"',
  '• Negocios: "¿cómo va el pipeline?"',
  '• Gastos: "¿cuánto he gastado este mes?"',
  '• Avisos: "¿tengo avisos sin leer?"',
  '• Prospección: "¿cómo va la prospección?"',
  '• Guía: "¿cómo creo una propiedad?" o "¿qué es el inventario?"',
];

const MODULES = [
  '• Dashboard: indicadores y gráficas del negocio.',
  '• Prospección: inversión y captación de cartera.',
  '• Negociaciones: ofertas y contraofertas.',
  '• Clientes: prospectos y su embudo de ventas.',
  '• Propiedades: cartera de inmuebles.',
  '• Inventario: publicar propiedades al catálogo público.',
  '• Negocios: operaciones y pipeline.',
  '• Citas: agenda de visitas y reuniones.',
  '• Tareas: pendientes del día.',
  '• Metas: objetivos con avance automático.',
  '• Gastos: control de egresos.',
  '• Documentación: archivos y contratos.',
  '• Avisos: notificaciones y recordatorios.',
  '• Mis reportes: exportar Excel/PDF y analizar.',
  '• Reportes gerencia: panorama ejecutivo (solo admin/gerencia).',
  '• Configuración: usuarios, permisos y catálogo público (solo admin/gerencia).',
];

const GUIDE = {
  dashboard: 'El Dashboard resume tu negocio al instante:\n• Indicadores clave: clientes, negocios activos, citas, tareas y avisos.\n• Embudo de ventas por etapa (prospecto, contacto, cita, negociación, promesa, cierre).\n• Prospección: inversión y prospectos obtenidos.\n• Citas y tareas próximas.\n\nSi eres admin/gerencia, en Reportes gerencia tienes las gráficas ejecutivas y el avance mensual (últimos 6 meses).',
  cliente: 'Para registrar un cliente:\n1. Ve al módulo Clientes.\n2. Pulsa el botón "Nuevo cliente".\n3. Captura nombre, contacto y teléfono.\n4. Guarda. El cliente entra como prospecto y podrás avanzar su embudo: contacto, cita, negociación, promesa y cierre.',
  propiedad: 'Para registrar una propiedad:\n1. Ve al módulo Propiedades.\n2. Pulsa "Nueva propiedad".\n3. Captura tipo, precio, superficie y fotos.\n4. Guarda y después publícala en Inventario para que aparezca en el catálogo público con su botón de WhatsApp.',
  negocio: 'Para registrar un negocio:\n1. Ve al módulo Negocios.\n2. Pulsa "Nuevo negocio".\n3. Asocia la propiedad, el cliente y el asesor principal.\n4. Avanza la etapa: negociación, promesa y cierre.\n5. Al concluirlo se registra la venta y alimenta tus metas automáticamente.',
  cita: 'Para agendar una cita:\n1. Ve al módulo Citas.\n2. Pulsa "Nueva cita".\n3. Selecciona cliente, fecha y hora.\n4. Guarda. Si activas los recordatorios, recibirás avisos antes de la cita.',
  tarea: 'Para crear una tarea:\n1. Ve al módulo Tareas.\n2. Pulsa "Nueva tarea".\n3. Escribe el título, asigna un asesor y pon la fecha límite.\n4. Guarda y márcala como completada cuando termines.',
  meta: 'Para crear una meta:\n1. Ve al módulo Metas.\n2. Pulsa "Nueva meta".\n3. Define el objetivo en pesos, el periodo (fechas) y el número de tickets.\n4. El sistema la actualiza solo: suma los negocios concluidos y cambia su estado a cumplida o vencida.',
  gasto: 'Para registrar un gasto:\n1. Ve al módulo Gastos.\n2. Pulsa "Nuevo gasto".\n3. Captura concepto, monto y fecha.\n4. Guarda. Quedará contabilizado en tus reportes del mes.',
  reporte: 'Para exportar información:\n1. Entra al módulo Mis reportes.\n2. Filtra por fechas o asesor.\n3. Usa "Exportar Excel" o "Exportar PDF".\nEn Reportes gerencia (solo admin/gerencia) tienes el panorama ejecutivo del equipo.',
  negociacion: 'Las negociaciones guardan ofertas y contraofertas de un negocio:\n1. Ve al módulo Negociaciones.\n2. Crea una oferta vinculada al negocio.\n3. Registra montos y estado hasta llegar a un acuerdo.',
  documento: 'Para subir documentos:\n1. Ve al módulo Documentación.\n2. Pulsa "Subir archivo".\n3. Adjunta contratos o expedientes y vincúlalos a un cliente o negocio.\n4. Podrás descargarlos cuando los necesites.',
  inventario: 'El inventario funciona así:\n1. Solo administración y gerencia agregan propiedades (Inventario → Agregar), les asignan asesor y las publican.\n2. Al publicar, la propiedad aparece en el catálogo público con su botón de WhatsApp.\n3. Los asesores ven las publicadas y las que les asignaron: abren el detalle, editan notas, agendan citas y crean negocios desde la propiedad.',
  aviso: 'Para activar recordatorios:\n1. Ve a Configuración y activa los recordatorios (o permite las notificaciones del navegador).\n2. El sistema te avisará de citas y tareas próximas.\n3. También puedes consultar todo en el módulo Avisos.',
  prospeccion: 'Para registrar prospección:\n1. Ve al módulo Prospección.\n2. Registra actividades de captación con su inversión y prospectos obtenidos.\n3. Así mides el costo de adquisición de tu cartera.',
  precio: 'Para ver el historial de precios:\n1. Abre la propiedad en Propiedades.\n2. Pulsa el botón del historial / mercado.\n3. Verás la evolución del precio y el valor de mercado estimado.',
  tema: 'Para cambiar el tema:\n1. Usa el botón de luna/sol en la barra superior.\n2. El cambio se guarda en tu dispositivo. También está disponible desde el login.',
  login: 'Para iniciar sesión:\n1. Usa tu identificador o correo y contraseña.\n2. También puedes entrar con tu cuenta de Google.\n3. Si olvidaste tu contraseña, el administrador puede restablecerla desde Configuración → Usuarios.',
  instalar: 'Para instalar la app:\n1. Pulsa "Instalar app" en el menú lateral.\n2. O usa "Agregar a pantalla de inicio" en tu navegador.\n3. La app funciona sin conexión gracias al service worker.',
  configuracion: 'En Configuración (solo admin/gerencia) puedes:\n• Gestionar usuarios, roles y permisos.\n• Editar el catálogo público (WhatsApp, textos, nombre).\n• Activar recordatorios y otras opciones.',
};

const GUIDE_TOPICS = [
  { key: 'dashboard', words: ['dashboard', 'indicador', 'grafica', 'grafico', 'panel', 'resumen'] },
  { key: 'cliente', words: ['cliente', 'prospecto', 'comprador', 'contacto nuevo'] },
  { key: 'inventario', words: ['inventario', 'publicar', 'publico', 'publica', 'catalogo', 'publicacion'] },
  { key: 'propiedad', words: ['propiedad', 'inmueble', 'registrar una casa', 'casa', 'terreno', 'departamento'] },
  { key: 'negocio', words: ['negocio', 'operacion', 'vender', 'venta', 'registrar'] },
  { key: 'cita', words: ['cita', 'visita', 'agendar', 'reunion', 'agenda'] },
  { key: 'tarea', words: ['tarea', 'pendiente'] },
  { key: 'meta', words: ['meta', 'objetivo'] },
  { key: 'gasto', words: ['gasto', 'egreso'] },
  { key: 'reporte', words: ['reporte', 'exportar', 'excel', 'pdf'] },
  { key: 'negociacion', words: ['negociacion', 'oferta', 'contraoferta'] },
  { key: 'documento', words: ['documento', 'archivo', 'contrato', 'subir archivo'] },
  { key: 'aviso', words: ['aviso', 'recordatorio', 'notificacion', 'alerta'] },
  { key: 'prospeccion', words: ['prospeccion', 'captacion'] },
  { key: 'precio', words: ['precio', 'historial', 'mercado'] },
  { key: 'tema', words: ['tema', 'oscuro', 'claro', 'dark', 'light'] },
  { key: 'login', words: ['login', 'sesion', 'contraseña', 'password', 'google', 'acceder', 'entrar'] },
  { key: 'instalar', words: ['instalar', 'pwa', 'aplicacion', 'pantalla de inicio', 'app'] },
  { key: 'configuracion', words: ['configuracion', 'ajustes', 'permisos', 'usuarios', 'catalogo publico'] },
];

const GUIDE_HINTS = [
  'como crear', 'como creo', 'como hacer', 'como registro', 'como agendo', 'como agendar', 'como publico', 'como publicar',
  'como exporto', 'como exportar', 'como instalo', 'como instalar', 'como cambio', 'como activo', 'como inicio',
  'como entro', 'como uso', 'como se usa', 'como subo', 'como agrego', 'como doy de alta', 'como registrar',
  'como edito', 'como elimino', 'como genero', 'como consulto', 'paso a paso', 'guia', 'tutorial', 'ayudame a',
  'ayudame como', 'explicame como', 'explicame que', 'para que sirve', 'que es', 'que son', 'como funciona',
  'como puedo', 'como configuro', 'como veo', 'como se',
];

function normalize(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function has(text, ...words) {
  return words.some((w) => text.includes(w));
}

function includesWord(text, word) {
  try {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const variants = [escaped, `${escaped}s`, `${escaped}es`];
    return variants.some((v) => new RegExp(`(^|[^a-z0-9])${v}([^a-z0-9]|$)`).test(text));
  } catch (error) {
    return text.includes(word);
  }
}

function detectGuideTopic(text) {
  for (const topic of GUIDE_TOPICS) {
    if (topic.words.some((w) => includesWord(text, w))) return topic.key;
  }
  return null;
}

const ask = asyncHandler(async (req, res) => {
  const { question } = req.body || {};
  const text = normalize(question);
  if (!text) {
    return res.json({
      success: true,
      data: { answer: 'Hola, soy tu asistente. Pregúntame por propiedades, clientes, citas, tareas, metas, ingresos, gastos, negocios o avisos... o dime "¿cómo creo un cliente?" y te enseño.\n\n' + CAPABILITIES.join('\n') },
    });
  }

  const isBoss = ['admin', 'gerencia'].includes(req.user.role.code);
  const uid = req.user._id;
  const all = isBoss;
  const countFilter = all ? {} : { responsibleUser: uid };
  const name = req.user.name || req.user.username || '';

  // ---------- Saludo ----------
  if (has(text, 'hola', 'buenos dias', 'buenas tardes', 'buenas noches', 'que tal', 'saludos')) {
    return res.json({ success: true, data: { answer: `¡Hola${name ? ', ' + name : ''}! Soy tu asistente del CRM. Puedo resolver tus dudas sobre los datos y enseñarte a usar el sistema.\n\n${CAPABILITIES.join('\n')}` } });
  }

  // ---------- Presentación ----------
  if (has(text, 'como te llamas', 'quien eres', 'que eres', 'que eres tu', 'presentate')) {
    return res.json({ success: true, data: { answer: 'Soy el asistente inteligente de tu CRM Inmobiliaria. Consulto tu información en tiempo real y respondo al instante, además de guiarte paso a paso por todos los módulos.' } });
  }

  // ---------- Gracias ----------
  if (has(text, 'gracias', 'te agradezco')) {
    return res.json({ success: true, data: { answer: '¡Con gusto! Estoy aquí cuando me necesites. Si quieres aprender a usar algo, pregunta "¿cómo creo una meta?" por ejemplo.' } });
  }

  // ---------- Guía de uso ----------
  if (GUIDE_HINTS.some((h) => text.includes(h))) {
    const topic = detectGuideTopic(text);
    if (topic) {
      return res.json({ success: true, data: { answer: GUIDE[topic] } });
    }
  }

  // ---------- Módulos del sistema ----------
  if (has(text, 'que modulos', 'cuales son los modulos', 'modulos del sistema', 'que tiene el sistema', 'secciones', 'funciones del sistema', 'menu', 'como es el sistema', 'que hace la app')) {
    return res.json({ success: true, data: { answer: 'El sistema está organizado en estos módulos:\n\n' + MODULES.join('\n') } });
  }

  // ---------- Roles y permisos ----------
  if (has(text, 'rol', 'permiso', 'permisos', 'asesor', 'quien puede', 'acceso', 'gerencia', 'administrador', 'que diferencia')) {
    return res.json({
      success: true,
      data: {
        answer: 'Permisos del sistema:\n• Asesor: gestiona su propia cartera (clientes, citas, tareas y negocios).\n• Gerencia: ve la información de todo el equipo y los reportes ejecutivos.\n• Administración: acceso total, incluida la configuración y los usuarios.\n\nTu rol actual es ' + (req.user.role ? (req.user.role.name || req.user.role.code) : 'Miembro') + '. ¿Quieres que te enseñe algún módulo?',
      },
    });
  }

  // ---------- Capacidades ----------
  if (has(text, 'ayuda', 'puedes hacer', 'que sabes', 'como funciona el asistente', 'opciones', 'que puedes')) {
    return res.json({ success: true, data: { answer: 'Puedo consultar tu información en tiempo real y responder con números exactos. También te sirvo como guía del sistema.\n\n' + CAPABILITIES.join('\n') } });
  }

  // ---------- Propiedades ----------
  if (has(text, 'propiedad', 'inmueble', 'inventario', 'casa', 'departamento', 'terreno')) {
    const [total, published] = await Promise.all([
      Property.countDocuments(countFilter),
      Property.countDocuments({ ...countFilter, isPublished: true }),
    ]);
    const avail = await Property.countDocuments({ ...countFilter, status: 'disponible' });
    return res.json({
      success: true,
      data: { answer: `Tienes ${total} propiedades registradas${all ? ' en total' : ''}. ${published} publicadas en inventario y ${avail} disponibles para operar.` },
    });
  }

  // ---------- Clientes ----------
  if (has(text, 'cliente', 'prospecto', 'embudo', 'comprador', 'vendedor')) {
    const clients = await Client.find(countFilter).select('funnelStage status').lean();
    const stages = {};
    clients.forEach((c) => { const s = c.funnelStage || 'prospecto'; stages[s] = (stages[s] || 0) + 1; });
    const order = ['prospecto', 'contacto', 'cita', 'negociacion', 'promesa', 'cierre'];
    const detail = order.map((s) => `• ${s.charAt(0).toUpperCase() + s.slice(1)}: ${stages[s] || 0}`).join('\n');
    return res.json({ success: true, data: { answer: `Tienes ${clients.length} clientes/prospectos.\n\nEmbudo de ventas:\n${detail}` } });
  }

  // ---------- Citas ----------
  if (has(text, 'cita', 'visita', 'reunion', 'agenda')) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [today, upcoming] = await Promise.all([
      Appointment.countDocuments({ user: uid, status: { $in: ['pendiente', 'confirmada'] }, date: { $gte: startOfDay, $lt: new Date(startOfDay.getTime() + 86400000) } }),
      Appointment.find({ user: uid, status: { $in: ['pendiente', 'confirmada'] }, date: { $gte: now } }).populate('client', 'name').sort({ date: 1 }).limit(3).lean(),
    ]);
    const next = upcoming.length
      ? upcoming.map((a) => `• ${new Date(a.date).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — ${a.client ? a.client.name : 'Sin cliente'}`).join('\n')
      : 'No tienes citas próximas programadas.';
    return res.json({ success: true, data: { answer: `Hoy tienes ${today} cita${today === 1 ? '' : 's'}.\n\nPróximas citas:\n${next}` } });
  }

  // ---------- Tareas ----------
  if (has(text, 'tarea', 'pendiente', 'vence', 'por hacer')) {
    const [pending, overdue] = await Promise.all([
      Task.countDocuments({ assignedTo: uid, status: 'pendiente' }),
      Task.countDocuments({ assignedTo: uid, status: { $in: ['pendiente', 'en_proceso'] }, date: { $lt: new Date() } }),
    ]);
    return res.json({ success: true, data: { answer: `Tienes ${pending} tareas pendientes${overdue ? ` y ${overdue} vencidas` : ''}. ${overdue ? 'Te recomiendo atender primero las vencidas.' : '¡Vas al día!'}` } });
  }

  // ---------- Metas ----------
  if (has(text, 'meta', 'objetivo', 'avance', 'proyeccion')) {
    const goals = await Goal.find({ status: 'activa' }).lean();
    if (!goals.length) {
      return res.json({ success: true, data: { answer: 'No hay metas activas. Crea una meta en el módulo de Metas y la iré siguiendo automáticamente con tus ingresos.\n\n¿Quieres saber cómo? Pregúntame "¿cómo creo una meta?"' } });
    }
    const lines = goals.map((g) => {
      const pct = g.objectiveAmount ? Math.min(100, (g.currentResult / g.objectiveAmount) * 100).toFixed(0) : 0;
      return `• ${g.name}: ${money(g.currentResult)} de ${money(g.objectiveAmount)} (${pct}%)`;
    }).join('\n');
    const totalObj = goals.reduce((s, g) => s + (g.objectiveAmount || 0), 0);
    const totalCur = goals.reduce((s, g) => s + (g.currentResult || 0), 0);
    const pct = totalObj ? Math.min(100, (totalCur / totalObj) * 100).toFixed(0) : 0;
    return res.json({ success: true, data: { answer: `Avance global de metas: ${money(totalCur)} de ${money(totalObj)} (${pct}%).\n\n${lines}\n\nLas metas se actualizan automáticamente con los negocios concluidos.` } });
  }

  // ---------- Ingresos / ventas ----------
  if (has(text, 'ingreso', 'venta', 'creciendo', 'crecer', 'ganancia', 'factur', 'ticket', 'dinero', 'cobrado', 'comision')) {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startPrevMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const filter = all ? {} : { $or: [{ mainAdvisor: uid }, { partnerAdvisor: uid }] };

    const [thisMonth, lastMonth, prevMonth] = await Promise.all([
      Business.aggregate([
        { $match: { status: 'concluido', finishedAt: { $gte: startMonth }, ...filter } },
        { $group: { _id: null, total: { $sum: '$valueOperation' }, count: { $sum: 1 } } },
      ]),
      Business.aggregate([
        { $match: { status: 'concluido', finishedAt: { $gte: startLastMonth, $lt: startMonth }, ...filter } },
        { $group: { _id: null, total: { $sum: '$valueOperation' }, count: { $sum: 1 } } },
      ]),
      Business.aggregate([
        { $match: { status: 'concluido', finishedAt: { $gte: startPrevMonth, $lt: startLastMonth }, ...filter } },
        { $group: { _id: null, total: { $sum: '$valueOperation' } } },
      ]),
    ]);

    const cur = thisMonth[0] || { total: 0, count: 0 };
    const last = lastMonth[0] || { total: 0, count: 0 };
    const prev = (prevMonth[0] && prevMonth[0].total) || 0;
    const delta = last.total ? ((cur.total - last.total) / last.total) * 100 : (cur.total ? 100 : 0);
    const trend = cur.total > last.total ? 'van en AUMENTO' : cur.total < last.total ? 'van a la BAJA' : 'van estables';

    return res.json({
      success: true,
      data: {
        answer: `Ingresos del mes en curso: ${money(cur.total)} (${cur.count} negocio${cur.count === 1 ? '' : 's'} concluido${cur.count === 1 ? '' : 's'}).\n\nComparación:\n• Mes pasado: ${money(last.total)}\n• Mes previo: ${money(prev)}\n\nTus ingresos ${trend}${delta >= 0 ? ` (+${delta.toFixed(0)}% vs mes pasado)` : ` (${delta.toFixed(0)}% vs mes pasado)`}.`,
      },
    });
  }

  // ---------- Negocios / pipeline ----------
  if (has(text, 'negocio', 'operacion', 'pipeline', 'trato', 'negociacion', 'activos')) {
    const filterB = all ? {} : { mainAdvisor: uid };
    const [active, pipeline] = await Promise.all([
      Business.countDocuments({ ...filterB, status: 'activo' }),
      Business.aggregate([
        { $match: { status: 'activo', ...filterB } },
        { $group: { _id: null, value: { $sum: '$valueOperation' }, count: { $sum: 1 } } },
      ]),
    ]);
    const p = pipeline[0] || { value: 0, count: 0 };
    return res.json({ success: true, data: { answer: `Tienes ${active} negocios activos con un valor de pipeline de ${money(p.value)} (${p.count} con valor asignado).` } });
  }

  // ---------- Gastos ----------
  if (has(text, 'gasto', 'gastado', 'gaste', 'gastos', 'egreso', 'inversion', 'invertido')) {
    const now = new Date();
    const agg = await Expense.aggregate([
      { $match: { user: uid, date: { $gte: new Date(now.getFullYear(), now.getMonth(), 1) } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return res.json({ success: true, data: { answer: `Tus gastos de este mes suman ${money((agg[0] && agg[0].total) || 0)}.` } });
  }

  // ---------- Avisos ----------
  if (has(text, 'aviso', 'notificacion', 'alerta', 'mensaje', 'recordatorio')) {
    const unread = await Notification.countDocuments({ user: uid, read: false });
    return res.json({ success: true, data: { answer: unread ? `Tienes ${unread} avisos sin leer. Puedes revisarlos en el módulo de Avisos.` : 'No tienes avisos sin leer. Todo en orden.' } });
  }

  // ---------- Prospección ----------
  if (has(text, 'prospeccion', 'captacion')) {
    const agg = await ProspectingActivity.aggregate([
      { $match: all ? {} : { user: uid } },
      { $group: { _id: null, investment: { $sum: '$investment' }, count: { $sum: 1 } } },
    ]);
    const a = agg[0] || { investment: 0, count: 0 };
    return res.json({ success: true, data: { answer: `Llevas ${a.count} actividades de prospección con una inversión acumulada de ${money(a.investment)}.` } });
  }

  // ---------- Mi avance / rol ----------
  if (has(text, 'mi avance', 'que soy', 'mi rol', 'quien soy', 'mi nombre', 'mi perfil')) {
    const role = req.user.role ? (req.user.role.name || req.user.role.code) : 'Miembro';
    return res.json({ success: true, data: { answer: `Eres ${name || 'miembro del equipo'} con rol de ${role} en la inmobiliaria. Puedo mostrarte tus datos en cada módulo.` } });
  }

  return res.json({
    success: true,
    data: {
      answer: 'Aún no estoy seguro de cómo responder eso. Prueba con frases como:\n\n' + CAPABILITIES.join('\n') + '\n\nO pregúntame cómo usar algo: "¿cómo creo una cita?", "¿qué es el inventario?".',
    },
  });
});

module.exports = { ask };

