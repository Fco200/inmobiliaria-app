'use strict';

window.API = {
  auth: {
    login: (body) => ApiClient.post('/auth/login', body),
    me: () => ApiClient.get('/auth/me'),
    updateMe: (body) => ApiClient.put('/auth/me', body),
    logout: () => ApiClient.post('/auth/logout'),
    checkRegisterKey: (body) => ApiClient.post('/auth/check-register-key', body),
    google: (body) => ApiClient.post('/auth/google', body),
    completeOnboarding: () => ApiClient.patch('/auth/onboarding-complete'),
    changePassword: (body) => ApiClient.post('/auth/change-password', body),
    forgotPassword: (body) => ApiClient.post('/auth/forgot-password', body),
  },

  userRequests: {
    create: (body) => ApiClient.post('/user-requests', body),
    list: (params) => ApiClient.get('/user-requests', params),
    handle: (id, body) => ApiClient.patch(`/user-requests/${id}`, body),
    remove: (id) => ApiClient.remove(`/user-requests/${id}`),
  },

  sessions: {
    list: (params) => ApiClient.get('/sessions', params),
    revoke: (id) => ApiClient.remove(`/sessions/${id}`),
    logoutAll: () => ApiClient.post('/sessions/logout-all'),
    revokeUser: (userId) => ApiClient.remove(`/sessions/user/${userId}`),
  },

  settings: {
    public: () => ApiClient.get('/settings/public'),
    getRoleKey: () => ApiClient.get('/settings/role-key'),
    setRoleKey: (body) => ApiClient.put('/settings/role-key', body),
    setGoogleClientId: (body) => ApiClient.put('/settings/google-client-id', body),
    setWhatsappNumber: (body) => ApiClient.put('/settings/whatsapp-number', body),
    landing: (body) => ApiClient.put('/settings/landing', body),
  },

  users: {
    list: (params) => ApiClient.get('/users', params),
    create: (body) => ApiClient.post('/users', body),
    update: (id, body) => ApiClient.put(`/users/${id}`, body),
    remove: (id) => ApiClient.remove(`/users/${id}`),
  },

  roles: {
    list: () => ApiClient.get('/users/roles'),
    create: (body) => ApiClient.post('/users/roles', body),
    update: (id, body) => ApiClient.put(`/users/roles/${id}`, body),
    remove: (id) => ApiClient.remove(`/users/roles/${id}`),
  },

  permissions: {
    list: () => ApiClient.get('/users/permissions'),
  },

  clients: {
    list: (params) => ApiClient.get('/clients', params),
    create: (body) => ApiClient.post('/clients', body),
    update: (id, body) => ApiClient.put(`/clients/${id}`, body),
    remove: (id) => ApiClient.remove(`/clients/${id}`),
    changeEtapa: (id, body) => ApiClient.post(`/clients/${id}/cambiar-etapa`, body),
    registrarLlamada: (id) => ApiClient.post(`/clients/${id}/registrar-llamada`),
    historial: (id) => ApiClient.get(`/clients/${id}/historial`),
    conteoEtapas: () => ApiClient.get('/clients/conteo-etapas'),
  },

  properties: {
    list: (params) => ApiClient.get('/properties', params),
    get: (id) => ApiClient.get(`/properties/${id}`),
    create: (body) => ApiClient.post('/properties', body),
    update: (id, body) => ApiClient.put(`/properties/${id}`, body),
    remove: (id) => ApiClient.remove(`/properties/${id}`),
    publish: (id, body) => ApiClient.patch(`/properties/${id}/publish`, body),
    market: (id) => ApiClient.get(`/properties/${id}/market`),
    // Sube una o varias fotos a una propiedad (multipart, campo "photos").
    uploadPhotos: (id, files) => {
      const form = new FormData();
      Array.from(files || []).forEach((file) => form.append('photos', file));
      return ApiClient.postMultipart(`/properties/${id}/photos`, form);
    },
  },

  inventory: {
    list: (params) => ApiClient.get('/inventory', params),
    general: (params) => ApiClient.get('/inventory/general', params),
    create: (body) => ApiClient.post('/inventory', body),
    uploadProperty: (body) => ApiClient.post('/inventory/upload', body),
    update: (id, body) => ApiClient.put(`/inventory/${id}`, body),
    remove: (id) => ApiClient.remove(`/inventory/${id}`),
    publish: (id, body) => ApiClient.patch(`/inventory/${id}/publish`, body),
    public: (params) => ApiClient.get('/inventory/public', params),
  },

  businesses: {
    list: (params) => ApiClient.get('/businesses', params),
    stages: () => ApiClient.get('/businesses/stages'),
    create: (body) => ApiClient.post('/businesses', body),
    update: (id, body) => ApiClient.put(`/businesses/${id}`, body),
    remove: (id) => ApiClient.remove(`/businesses/${id}`),
    stage: (id, body) => ApiClient.patch(`/businesses/${id}/stage`, body),
    history: (id) => ApiClient.get(`/businesses/${id}/history`),
  },

  appointments: {
    list: (params) => ApiClient.get('/appointments', params),
    create: (body) => ApiClient.post('/appointments', body),
    update: (id, body) => ApiClient.put(`/appointments/${id}`, body),
    remove: (id) => ApiClient.remove(`/appointments/${id}`),
  },

  tasks: {
    list: (params) => ApiClient.get('/tasks', params),
    create: (body) => ApiClient.post('/tasks', body),
    update: (id, body) => ApiClient.put(`/tasks/${id}`, body),
    remove: (id) => ApiClient.remove(`/tasks/${id}`),
    status: (id, body) => ApiClient.patch(`/tasks/${id}/status`, body),
  },

  goals: {
    list: (params) => ApiClient.get('/goals', params),
    create: (body) => ApiClient.post('/goals', body),
    update: (id, body) => ApiClient.put(`/goals/${id}`, body),
    remove: (id) => ApiClient.remove(`/goals/${id}`),
  },

  expenses: {
    list: (params) => ApiClient.get('/expenses', params),
    create: (body) => ApiClient.post('/expenses', body),
    update: (id, body) => ApiClient.put(`/expenses/${id}`, body),
    remove: (id) => ApiClient.remove(`/expenses/${id}`),
  },

  dashboard: {
    summary: () => ApiClient.get('/dashboard/summary'),
    userReport: (userId) => ApiClient.get(`/dashboard/user/${userId}`),
    executive: () => ApiClient.get('/dashboard/executive'),
  },

  reminders: {
    upcoming: () => ApiClient.get('/reminders'),
  },

  public: {
    properties: (params) => ApiClient.get('/public/properties', params),
    property: (id) => ApiClient.get(`/public/properties/${id}`),
    asesores: (params) => ApiClient.get('/public/asesores', params),
    asesor: (id) => ApiClient.get(`/public/asesores/${id}`),
    asesorProperties: (params) => ApiClient.get('/public/propiedades', params),
    newsletterSubscribe: (body) => ApiClient.post('/public/newsletter', body),
    assistant: (body) => ApiClient.post('/public/assistant', body),
    // Cualquier visitante puede agendar una cita sobre una propiedad (sin login).
    createAppointment: (body) => ApiClient.post('/public/appointments', body),
  },

  prospecting: {
    list: (params) => ApiClient.get('/prospecting', params),
    create: (body) => ApiClient.post('/prospecting', body),
    update: (id, body) => ApiClient.put(`/prospecting/${id}`, body),
    remove: (id) => ApiClient.remove(`/prospecting/${id}`),
    summary: (params) => ApiClient.get('/prospecting/summary', params),
  },

  calendar: {
    // Eventos agregados (citas+tareas+negocios+metas+prospección) en un rango.
    events: (params) => ApiClient.get('/calendar/events', params),
    // Estado de la integración con Google Calendar.
    status: () => ApiClient.get('/calendar/status'),
    // URL de autorización OAuth de Google.
    authUrl: () => ApiClient.get('/calendar/google/auth-url'),
    disconnect: () => ApiClient.post('/calendar/google/disconnect'),
    toggle: (body) => ApiClient.post('/calendar/google/toggle', body),
    sync: (body) => ApiClient.post('/calendar/google/sync', body),
  },

  // Reuniones de equipo publicadas por administración (visibles para todos).
  meetings: {
    list: (params) => ApiClient.get('/meetings', params),
    get: (id) => ApiClient.get(`/meetings/${id}`),
    create: (body) => ApiClient.post('/meetings', body),
    update: (id, body) => ApiClient.put(`/meetings/${id}`, body),
    remove: (id) => ApiClient.remove(`/meetings/${id}`),
  },

  documents: {
    list: (params) => ApiClient.get('/documents', params),
    create: (body) => ApiClient.post('/documents', body),
    update: (id, body) => ApiClient.put(`/documents/${id}`, body),
    remove: (id) => ApiClient.remove(`/documents/${id}`),

    // Sube un archivo y (opcionalmente) crea el registro del documento en un
    // solo paso. `meta` = { name, type, status, client, property, business, observations }.
    upload: (file, meta = {}) => {
      const form = new FormData();
      form.append('file', file);
      Object.entries(meta).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          form.append(key, value);
        }
      });
      return ApiClient.postMultipart('/documents/upload', form);
    },
  },

  formatos: {
    listarPlantillas: () => ApiClient.get('/formatos/plantillas'),
    obtenerCampos: (id) => ApiClient.get(`/formatos/plantillas/${encodeURIComponent(id)}/campos`),
    generar: (plantillaId, data) => ApiClient.postBlob(`/formatos/generar/${encodeURIComponent(plantillaId)}`, data),
    descargar: (id) => {
      const token = localStorage.getItem('crm_token');
      return fetch(`${window.AppConfig.API_URL}/formatos/plantillas/${encodeURIComponent(id)}/descargar`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then((r) => {
        if (!r.ok) throw new Error('Error al descargar');
        return r.blob();
      });
    },
  },

  notifications: {
    list: (params) => ApiClient.get('/notifications', params),
    unreadCount: () => ApiClient.get('/notifications/unread-count'),
    markRead: (id) => ApiClient.patch(`/notifications/${id}/read`),
    markAllRead: () => ApiClient.post('/notifications/mark-all-read'),
    generate: () => ApiClient.post('/notifications/generate'),
  },

  activity: {
    list: (params) => ApiClient.get('/activity', params),
  },

  interactions: {
    list: (params) => ApiClient.get('/interactions', params),
    create: (body) => ApiClient.post('/interactions', body),
    remove: (id) => ApiClient.remove(`/interactions/${id}`),
  },

  reports: {
    management: (params) => ApiClient.get('/reports/management', params),
  },

  assistant: {
    ask: (payload) => ApiClient.post('/assistant', payload),
  },

  chats: {
    list: (params) => ApiClient.get('/chats', params),
    general: () => ApiClient.get('/chats/general'),
    soporte: () => ApiClient.get('/chats/soporte'),
    get: (id) => ApiClient.get(`/chats/${id}`),
    create: (body) => ApiClient.post('/chats', body),
    sendMessage: (id, body) => ApiClient.post(`/chats/${id}/messages`, body),
    markRead: (id) => ApiClient.patch(`/chats/${id}/read`),
    unreadCount: () => ApiClient.get('/chats/unread-count'),
  },

  announcements: {
    list: () => ApiClient.get('/announcements'),
    create: (body) => ApiClient.post('/announcements', body),
    markRead: (id) => ApiClient.patch(`/announcements/${id}/read`),
    remove: (id) => ApiClient.remove(`/announcements/${id}`),
  },

  config: {
    // Estado del mantenimiento (público) y configuración programada.
    mantenimiento: () => ApiClient.get('/config/mantenimiento'),
    setMantenimiento: (body) => ApiClient.post('/config/mantenimiento', body),
  },

  soporte: {
    // El panel de soporte usa su PROPIA sesión (soporte_token), independiente
    // de la sesión normal del CRM (crm_token). Todas las llamadas se hacen
    // con fetch directo + el token de soporte.
    login: (body) =>
      fetch(`${window.AppConfig.API_URL}/soporte/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error((data && data.message) || 'Error de soporte');
        return data;
      }),
    logout: () => soporteJson('/soporte/auth/logout', { method: 'POST' }),
    me: () => soporteJson('/soporte/auth/me'),

    usuarios: (params) => soporteJson(`/soporte/usuarios${qs(params)}`),
    roles: () => soporteJson('/soporte/roles'),
    actualizarUsuario: (id, body) => soporteJson(`/soporte/usuarios/${id}`, { method: 'PUT', body }),
    restablecerPassword: (id, body) => soporteJson(`/soporte/usuarios/${id}/restablecer-password`, { method: 'POST', body }),

    config: () => soporteJson('/soporte/config'),
    guardarConfig: (body) => soporteJson('/soporte/config', { method: 'PUT', body }),

    soporteConfig: () => soporteJson('/soporte/soporte-config'),
    guardarSoporteConfig: (body) => soporteJson('/soporte/soporte-config', { method: 'PUT', body }),

    mantenimiento: () => soporteJson('/soporte/mantenimiento'),
    cambiarMantenimiento: (body) => soporteJson('/soporte/mantenimiento', { method: 'PUT', body }),

    resumen: () => soporteJson('/soporte/resumen'),

    sesiones: (params) => soporteJson(`/soporte/sesiones${qs(params)}`),
    revocarSesion: (id) => soporteJson(`/soporte/sesiones/${id}`, { method: 'DELETE' }),
    revocarSesionesUsuario: (id) => soporteJson(`/soporte/sesiones/usuario/${id}`, { method: 'DELETE' }),

    anuncios: () => soporteJson('/soporte/anuncios'),
    crearAnuncio: (body) => soporteJson('/soporte/anuncios', { method: 'POST', body }),
    eliminarAnuncio: (id) => soporteJson(`/soporte/anuncios/${id}`, { method: 'DELETE' }),
    solicitudesPassword: () => soporteJson('/soporte/anuncios/solicitudes-password'),

    rolesPermisos: () => soporteJson('/soporte/roles-permisos'),

    logs: (params) => soporteJson(`/soporte/logs${qs(params)}`),
    logsErrores: (params) => soporteJson(`/soporte/logs/errors${qs(params)}`),

    // Visor de logs en tiempo real (buffer de sistema/servidor).
    logsSistema: (params) => soporteJson(`/soporte/logs/sistema${qs(params)}`),
    limpiarLogsSistema: () => soporteJson('/soporte/logs/sistema', { method: 'DELETE' }),

    respaldo: () => {
      const token = localStorage.getItem('soporte_token');
      return fetch(`${window.AppConfig.API_URL}/soporte/respaldo`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then(async (r) => {
        if (r.status === 401) { localStorage.removeItem('soporte_token'); window.location.replace('index.html'); throw new Error('Sesión de soporte expirada.'); }
        if (!r.ok) throw new Error('Error al generar el respaldo');
        const blob = await r.blob();
        return {
          blob,
          filename: (r.headers.get('Content-Disposition') || '').match(/filename="?([^";]+)"?/)?.[1] || 'respaldo.json',
        };
      });
    },

    plantillas: () => soporteJson('/soporte/plantillas'),
    subirPlantilla: (file) => {
      const form = new FormData();
      form.append('plantilla', file);
      const token = localStorage.getItem('soporte_token');
      return fetch(`${window.AppConfig.API_URL}/soporte/plantillas`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      }).then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error((data && data.message) || 'Error al subir');
        return data;
      });
    },
    eliminarPlantilla: (archivo) => soporteJson(`/soporte/plantillas/${encodeURIComponent(archivo)}`, { method: 'DELETE' }),
    renombrarPlantilla: (archivo, nuevoNombre) => soporteJson(`/soporte/plantillas/${encodeURIComponent(archivo)}`, { method: 'PATCH', body: { nuevoNombre } }),
    descargarPlantilla: (archivo) => {
      const token = localStorage.getItem('soporte_token');
      return fetch(`${window.AppConfig.API_URL}/soporte/plantillas/${encodeURIComponent(archivo)}/descargar`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then((r) => {
        if (!r.ok) throw new Error('Error al descargar');
        return r.blob();
      });
    },

    // Chat interno: el soporte ve y responde los mensajes del equipo.
    chats: () => soporteJson('/soporte/chat'),
    chatGeneral: () => soporteJson('/soporte/chat/general'),
    verChat: (id) => soporteJson(`/soporte/chat/${id}`),
    enviarMensajeChat: (id, body) => soporteJson(`/soporte/chat/${id}/messages`, { method: 'POST', body }),
    marcarLeidoChat: (id) => soporteJson(`/soporte/chat/${id}/leido`, { method: 'POST' }),

    // Solicitudes de creación de usuario que llegan desde el login público.
    // Se usan los mismos endpoints del CRM (el token de soporte es SUPERADMIN).
    solicitudesUsuario: (params) => soporteJson(`/user-requests${qs(params)}`),
    atenderSolicitud: (id, body) => soporteJson(`/user-requests/${id}`, { method: 'PATCH', body }),
    eliminarSolicitud: (id) => soporteJson(`/user-requests/${id}`, { method: 'DELETE' }),
    crearUsuarioSoporte: (body) => soporteJson('/users', { method: 'POST', body }),
  },
};

function qs(params) {
  const q = Object.entries(params || {})
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return q ? `?${q}` : '';
}

function soporteJson(path, options = {}) {
  const token = localStorage.getItem('soporte_token');
  const config = {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  };
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) config.body = JSON.stringify(options.body);
  return fetch(`${window.AppConfig.API_URL}${path}`, config).then(async (r) => {
    let data = null;
    try { data = await r.json(); } catch (e) { /* ignore */ }
    if (r.status === 401) {
      localStorage.removeItem('soporte_token');
      localStorage.removeItem('soporte_user');
      window.location.replace('index.html');
      throw new Error('Tu sesión de soporte expiró. Inicia sesión nuevamente.');
    }
    if (!r.ok) throw new Error((data && data.message) || `Error ${r.status}`);
    return data && data.data !== undefined ? data.data : data;
  });
}
