'use strict';

const asyncHandler = require('../middlewares/asyncHandler');
const { Newsletter, User, Client, Role, Campaign, CampaignRecipient } = require('../models');
const campaignWorker = require('../services/campaign.worker');
const { logActivity } = require('../services/log.service');
const { sendMail, mailWelcome } = require('../services/mail.service');

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const EMAIL_RX = /^[\w.+-]+@[\w-]+\.[\w.-]+$/;
const AUDIENCES = ['suscriptores', 'usuarios', 'clientes', 'todos'];
const MAX_RECIPIENTS = 10000;
const CAMPAIGN_CHUNK = 10;

function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return EMAIL_RX.test(email) ? email : '';
}

async function subscriberStats() {
  const [total, suscritos, bajas, usuarios, clientes] = await Promise.all([
    Newsletter.countDocuments({}),
    Newsletter.countDocuments({ status: 'suscrito' }),
    Newsletter.countDocuments({ status: 'dado_baja' }),
    User.countDocuments({ status: 'activo' }),
    Client.countDocuments({ email: { $exists: true, $nin: ['', null] } }),
  ]);
  return {
    total,
    suscritos,
    bajas,
    usuarios,
    clientes,
  };
}

// GET /api/newsletter/subscribers?q=&status=&source=&page=&limit=
const listSubscribers = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
  const filter = {};

  if (['suscrito', 'dado_baja'].includes(req.query.status)) filter.status = req.query.status;
  if (req.query.source && String(req.query.source).trim()) {
    filter.source = new RegExp(`^${escapeRegex(String(req.query.source).trim())}$`, 'i');
  }
  if (req.query.q && String(req.query.q).trim()) {
    const rx = new RegExp(escapeRegex(String(req.query.q).trim()), 'i');
    filter.$or = [{ email: rx }, { name: rx }, { source: rx }];
  }

  const [total, subscribers, stats] = await Promise.all([
    Newsletter.countDocuments(filter),
    Newsletter.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    subscriberStats(),
  ]);

  res.json({
    success: true,
    data: {
      subscribers,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
      stats,
    },
  });
});

// PATCH /api/newsletter/subscribers/:id  body: { name?, status? }
const updateSubscriber = asyncHandler(async (req, res) => {
  const subscriber = await Newsletter.findById(req.params.id);
  if (!subscriber) {
    return res.status(404).json({ success: false, message: 'Suscriptor no encontrado.' });
  }

  if (req.body && req.body.name !== undefined) {
    subscriber.name = String(req.body.name || '').trim().slice(0, 120);
  }
  if (req.body && req.body.status !== undefined) {
    if (!['suscrito', 'dado_baja'].includes(req.body.status)) {
      return res.status(400).json({ success: false, message: 'Estado de suscriptor inválido.' });
    }
    subscriber.status = req.body.status;
  }

  await subscriber.save();

  await logActivity({
    entityType: 'Newsletter',
    entityId: subscriber._id,
    user: req.user._id,
    action: 'actualizar_suscriptor',
    message: `Se actualizó al suscriptor ${subscriber.email} (${subscriber.status})`,
  });

  res.json({ success: true, message: 'Suscriptor actualizado.', data: subscriber });
});

// DELETE /api/newsletter/subscribers/:id
const removeSubscriber = asyncHandler(async (req, res) => {
  const subscriber = await Newsletter.findByIdAndDelete(req.params.id);
  if (!subscriber) {
    return res.status(404).json({ success: false, message: 'Suscriptor no encontrado.' });
  }

  await logActivity({
    entityType: 'Newsletter',
    entityId: subscriber._id,
    user: req.user._id,
    action: 'eliminar_suscriptor',
    message: `Se eliminó al suscriptor ${subscriber.email}`,
  });

  res.json({ success: true, message: 'Suscriptor eliminado.' });
});

// GET /api/newsletter/export — CSV listo para Excel.
const exportSubscribers = asyncHandler(async (req, res) => {
  const filter = {};
  if (['suscrito', 'dado_baja'].includes(req.query.status)) filter.status = req.query.status;

  const subscribers = await Newsletter.find(filter).sort({ createdAt: -1 }).lean();
  const csvEscape = (value) => `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
  const rows = [
    ['Correo', 'Nombre', 'Origen', 'Estado', 'Fecha de alta'].map(csvEscape).join(','),
  ];
  subscribers.forEach((s) => {
    rows.push([
      s.email || '',
      s.name || '',
      s.source || '',
      s.status || '',
      s.createdAt ? new Date(s.createdAt).toISOString() : '',
    ].map(csvEscape).join(','));
  });

  const fileName = `suscriptores_${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(`\uFEFF${rows.join('\r\n')}`);
});

// GET /api/newsletter/stats
const getStats = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await subscriberStats() });
});

// GET /api/newsletter/campaigns — historial de campañas (más recientes primero).
const listCampaigns = asyncHandler(async (req, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 15));
  const campaigns = await Campaign.find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('createdBy', 'name username email')
    .lean();
  // Forma que ya usan los paneles: { message, createdAt, user, data }.
  const rows = campaigns.map((c) => ({
    _id: c._id,
    message: `Campaña "${c.subject}"`,
    createdAt: c.createdAt,
    user: c.createdBy,
    data: {
      subject: c.subject,
      audience: c.audience,
      role: c.role,
      status: c.status,
      total: c.total,
      enviados: c.enviados,
      fallidos: c.fallidos,
    },
  }));
  res.json({ success: true, data: rows });
});

async function collectRecipients(audience, roleCode) {
  const recipients = new Map();

  // Correos suscritos y correos que dieron de baja. Quien pidió la baja nunca
  // recibe campañas, salvo que vuelva a suscribirse después.
  const [suscritosRows, bajasRows] = await Promise.all([
    Newsletter.find({ status: 'suscrito' }).select('email').lean(),
    Newsletter.find({ status: 'dado_baja' }).select('email').lean(),
  ]);
  const suscritos = new Set(suscritosRows.map((r) => cleanEmail(r.email)).filter(Boolean));
  const bajas = new Set(bajasRows.map((r) => cleanEmail(r.email)).filter(Boolean));
  const optedOut = (email) => bajas.has(email) && !suscritos.has(email);

  const add = (emailValue, name, source) => {
    const email = cleanEmail(emailValue);
    if (!email || optedOut(email)) return;
    if (!recipients.has(email)) recipients.set(email, { email, name: String(name || '').trim(), source });
  };

  const wantsSubscribers = audience === 'suscriptores' || audience === 'todos';
  const wantsUsers = audience === 'usuarios' || audience === 'todos';
  const wantsClients = audience === 'clientes' || audience === 'todos';

  if (wantsSubscribers) {
    const rows = await Newsletter.find({ status: 'suscrito' }).select('email name source').lean();
    rows.forEach((row) => add(row.email, row.name, 'suscriptor'));
  }

  if (wantsUsers) {
    const query = { status: 'activo' };
    if (roleCode) {
      const role = await Role.findOne({ code: roleCode }).select('_id');
      if (!role) {
        const error = new Error('El rol seleccionado no existe.');
        error.statusCode = 400;
        throw error;
      }
      query.role = role._id;
    }
    const rows = await User.find(query).select('email name').lean();
    // Solo reciben campañas los usuarios que activaron las noticias (opt-in).
    rows.forEach((row) => {
      const email = cleanEmail(row.email);
      if (email && suscritos.has(email)) add(row.email, row.name, 'usuario');
    });
  }

  if (wantsClients) {
    const rows = await Client.find({ email: { $exists: true, $nin: ['', null] } })
      .select('email nombre name')
      .lean();
    rows.forEach((row) => add(row.email, row.nombre || row.name, 'cliente'));
  }

  return Array.from(recipients.values());
}

// ── Autoservicio: suscripción propia desde Bienvenida o Mi perfil ───────────

// GET /api/newsletter/me
const getMySubscription = asyncHandler(async (req, res) => {
  const [user, sub] = await Promise.all([
    User.findById(req.user._id).select('email newsletterPrompted').lean(),
    Newsletter.findOne({ user: req.user._id, status: 'suscrito' }).sort({ updatedAt: -1 }).lean(),
  ]);
  res.json({
    success: true,
    data: {
      subscribed: Boolean(sub),
      email: sub ? sub.email : (user && user.email) || '',
      prompted: Boolean(user && user.newsletterPrompted),
    },
  });
});

// POST /api/newsletter/me/subscribe  body: { email, accept? }
// accept: false solo registra que la pregunta fue contestada ("Después").
const subscribeMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });

  if (req.body && req.body.accept === false) {
    user.newsletterPrompted = true;
    await user.save();
    return res.json({
      success: true,
      message: 'Puedes activar las noticias cuando quieras desde Mi perfil.',
      data: { subscribed: false, prompted: true },
    });
  }

  const email = cleanEmail(req.body && req.body.email);
  if (!email) {
    return res.status(400).json({ success: false, message: 'Ingresa un correo electrónico válido.' });
  }

  // Una cuenta tiene una sola suscripción activa: el correo nuevo reemplaza al anterior.
  await Newsletter.updateMany(
    { user: user._id, email: { $ne: email }, status: 'suscrito' },
    { $set: { status: 'dado_baja' } }
  );

  let sub = await Newsletter.findOne({ email });
  if (sub) {
    sub.status = 'suscrito';
    sub.user = user._id;
    if (!sub.name && user.name) sub.name = user.name;
    await sub.save();
  } else {
    sub = await Newsletter.create({
      email,
      name: user.name || '',
      source: 'crm',
      user: user._id,
      status: 'suscrito',
    });
  }

  user.newsletterPrompted = true;
  await user.save();

  // Correo de confirmación (no bloquea la respuesta si falla).
  sendMail(mailWelcome(email, user.name)).catch((error) => {
    console.error('[Newsletter] No se pudo enviar la confirmación:', error.message);
  });

  await logActivity({
    entityType: 'Newsletter',
    entityId: sub._id,
    user: user._id,
    action: 'suscripcion_newsletter',
    message: `${user.name || user.username} se suscribió a las noticias del CRM (${email})`,
  });

  res.json({
    success: true,
    message: `Listo. Recibirás noticias del CRM en ${email}.`,
    data: { subscribed: true, email, prompted: true },
  });
});

// POST /api/newsletter/me/unsubscribe — deja de recibir correos del boletín.
const unsubscribeMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });

  const orFilter = [{ user: user._id }];
  if (user.email) orFilter.push({ email: cleanEmail(user.email) });
  await Newsletter.updateMany({ $or: orFilter, status: 'suscrito' }, { $set: { status: 'dado_baja' } });

  user.newsletterPrompted = true;
  await user.save();

  await logActivity({
    entityType: 'Newsletter',
    entityId: user._id,
    user: user._id,
    action: 'baja_newsletter',
    message: `${user.name || user.username} canceló las noticias del CRM`,
  });

  res.json({
    success: true,
    message: 'Cancelaste las noticias. Ya no recibirás correos del boletín.',
    data: { subscribed: false, prompted: true },
  });
});

// POST /api/newsletter/campaign
// body: { subject, message, intro?, audience: 'suscriptores'|'usuarios'|'clientes'|'todos', role? }
// Guarda la campaña y sus destinatarios, responde 202 y el trabajador envía en segundo plano.
const sendCampaign = asyncHandler(async (req, res) => {
  const subject = String((req.body && req.body.subject) || '').trim().slice(0, 160);
  const message = String((req.body && req.body.message) || '').trim().slice(0, 12000);
  const intro = String((req.body && req.body.intro) || '').trim().slice(0, 300);
  const audience = String((req.body && req.body.audience) || 'suscriptores');
  const roleCode = String((req.body && req.body.role) || '').trim();

  if (!subject) return res.status(400).json({ success: false, message: 'Escribe un asunto para el correo.' });
  if (!message) return res.status(400).json({ success: false, message: 'Escribe el contenido del correo.' });
  if (!AUDIENCES.includes(audience)) {
    return res.status(400).json({ success: false, message: 'Destinatarios no válidos.' });
  }

  let recipients;
  try {
    recipients = await collectRecipients(audience, roleCode);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }

  if (!recipients.length) {
    return res.status(400).json({ success: false, message: 'No hay destinatarios con correo válido para esa audiencia.' });
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return res.status(400).json({
      success: false,
      message: `Hay ${recipients.length} destinatarios. El límite por campaña es ${MAX_RECIPIENTS}; usa una audiencia más específica.`,
    });
  }

  const campaign = await Campaign.create({
    subject,
    message,
    intro,
    audience,
    role: roleCode,
    status: 'en_cola',
    total: recipients.length,
    createdBy: req.user._id,
  });

  try {
    await CampaignRecipient.insertMany(
      recipients.map((r) => ({
        campaign: campaign._id,
        email: r.email,
        name: r.name,
        source: r.source,
      })),
      { ordered: false }
    );
  } catch (error) {
    // Un correo repetido no debe impedir la campaña: los duplicados ya se
    // filtraron, así que aquí solo llega un error real.
    if (error.code !== 11000) {
      await Campaign.deleteOne({ _id: campaign._id });
      await CampaignRecipient.deleteMany({ campaign: campaign._id });
      throw error;
    }
  }

  campaignWorker.kick();

  const queuedMessage = `Campaña en cola: se enviará a ${recipients.length} destinatario${recipients.length === 1 ? '' : 's'}. Verás el avance en el historial.`;
  res.status(202).json({
    success: true,
    message: queuedMessage,
    data: { id: campaign._id, total: recipients.length, status: 'en_cola', audience, message: queuedMessage },
  });
});

module.exports = {
  listSubscribers,
  updateSubscriber,
  removeSubscriber,
  exportSubscribers,
  getStats,
  listCampaigns,
  sendCampaign,
  getMySubscription,
  subscribeMe,
  unsubscribeMe,
};
