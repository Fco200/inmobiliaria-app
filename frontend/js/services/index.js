'use strict';

window.API = {
  auth: {
    login: (body) => ApiClient.post('/auth/login', body),
    me: () => ApiClient.get('/auth/me'),
    updateMe: (body) => ApiClient.put('/auth/me', body),
    logout: () => ApiClient.post('/auth/logout'),
    checkRegisterKey: (body) => ApiClient.post('/auth/check-register-key', body),
    google: (body) => ApiClient.post('/auth/google', body),
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
  },

  properties: {
    list: (params) => ApiClient.get('/properties', params),
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
  },

  prospecting: {
    list: (params) => ApiClient.get('/prospecting', params),
    create: (body) => ApiClient.post('/prospecting', body),
    update: (id, body) => ApiClient.put(`/prospecting/${id}`, body),
    remove: (id) => ApiClient.remove(`/prospecting/${id}`),
    summary: (params) => ApiClient.get('/prospecting/summary', params),
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
};
