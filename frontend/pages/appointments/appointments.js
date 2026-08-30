'use strict';

window.Pages = window.Pages || {};

window.Pages.appointments = {
  title: 'Citas',

  async render(container) {
    let me = null;
    let clients = [];
    let properties = [];
    let businesses = [];
    let users = [];
    try {
      const [m, c, p, b, u] = await Promise.all([
        API.auth.me().catch(() => null),
        API.clients.list({ limit: 100 }).catch(() => ({ data: [] })),
        API.properties.list({ limit: 100 }).catch(() => ({ data: [] })),
        API.businesses.list({ limit: 100 }).catch(() => ({ data: [] })),
        API.users.list({ limit: 100 }).catch(() => ({ data: [] })),
      ]);
      me = m;
      clients = c.data;
      properties = p.data;
      businesses = b.data;
      users = u.data;
    } catch (error) {
      // sin opciones
    }

    const userOptions = users.length
      ? users.map((x) => ({ value: x._id, label: x.name }))
      : [{ value: me ? me._id : '', label: me ? me.name : '' }];

    crudPage(container, {
      title: 'Citas',
      newLabel: 'Nueva cita',
      service: {
        list: (params) => API.appointments.list(params),
        create: (body) => API.appointments.create(body),
        update: (id, body) => API.appointments.update(id, body),
        remove: (id) => API.appointments.remove(id),
      },
      statusOptions: ['pendiente', 'confirmada', 'realizada', 'cancelada', 'no_asistio'],
      columns: [
        { key: 'date', label: 'Fecha y hora', render: (r) => Format.dateTime(r.date) },
        { key: 'client', label: 'Cliente', render: (r) => UI.escapeHtml(r.client ? r.client.name : '—') },
        { key: 'property', label: 'Propiedad', render: (r) => (r.property ? `${UI.escapeHtml(r.property.zone)} ${UI.escapeHtml(r.property.city)}` : '—') },
        { key: 'type', label: 'Tipo', render: (r) => UI.badge(String(r.type || '').replace(/_/g, ' '), 'info') },
        { key: 'status', label: 'Estado', render: (r) => UI.statusBadge(r.status) },
        { key: 'user', label: 'Asesor', render: (r) => UI.escapeHtml(r.user ? r.user.name : '—') },
      ],
      fields: [
        { name: 'date', label: 'Fecha y hora', type: 'datetime-local', required: true, value: (r) => Format.toLocalInput(r.date) },
        { name: 'client', label: 'Cliente', type: 'select', options: [{ value: '', label: '— Sin cliente —' }, ...clients.map((x) => ({ value: x._id, label: x.name }))] },
        { name: 'property', label: 'Propiedad', type: 'select', options: [{ value: '', label: '— Sin propiedad —' }, ...properties.map((x) => ({ value: x._id, label: `${x.type} — ${x.zone} ${x.city}` }))] },
        { name: 'business', label: 'Negocio', type: 'select', options: [{ value: '', label: '— Sin negocio —' }, ...businesses.map((x) => ({ value: x._id, label: x.name }))] },
        { name: 'user', label: 'Asesor', type: 'select', value: me ? me._id : '', options: userOptions },
        { name: 'type', label: 'Tipo de cita', type: 'select', options: ['visita_propiedad', 'oficina', 'firma', 'avaluo', 'seguimiento', 'otro'] },
        { name: 'status', label: 'Estado', type: 'select', options: ['pendiente', 'confirmada', 'realizada', 'cancelada', 'no_asistio'] },
        { name: 'reminder', label: 'Recordatorio', type: 'datetime-local', hint: 'Aviso antes de la cita', value: (r) => Format.toLocalInput(r.reminder) },
        { name: 'place', label: 'Lugar', type: 'text', full: true },
        { name: 'notes', label: 'Notas', type: 'textarea', full: true },
      ],
      formData(values) {
        const { reminder, ...rest } = values;
        return {
          ...rest,
          date: new Date(values.date).toISOString(),
          reminder: reminder ? new Date(reminder).toISOString() : null,
        };
      },
      onEdit: true,
      onRemove: true,
    });
  },
};
