'use strict';

window.Pages = window.Pages || {};

window.Pages.tasks = {
  title: 'Tareas',

  async render(container) {
    let clients = [];
    let users = [];
    let me = null;
    try {
      const [c, u, m] = await Promise.all([
        API.clients.list({ limit: 100 }).catch(() => ({ data: [] })),
        API.users.list({ limit: 100 }).catch(() => ({ data: [] })),
        API.auth.me().catch(() => null),
      ]);
      clients = c.data;
      users = u.data;
      me = m;
    } catch (error) {
      // sin opciones
    }

    if (!users.length && me) {
      users = [me];
    }

    crudPage(container, {
      title: 'Tareas',
      newLabel: 'Nueva tarea',
      service: {
        list: (params) => API.tasks.list(params),
        create: (body) => API.tasks.create(body),
        update: (id, body) => API.tasks.update(id, body),
        remove: (id) => API.tasks.remove(id),
      },
      statusOptions: ['pendiente', 'en_proceso', 'completada', 'cancelada', 'vencida'],
      columns: [
        { key: 'title', label: 'Tarea', render: (r) => `<strong>${UI.escapeHtml(r.title)}</strong><br><small class="text-muted">${UI.escapeHtml(r.description || '')}</small>` },
        { key: 'date', label: 'Fecha', render: (r) => Format.dateTime(r.date) },
        { key: 'priority', label: 'Prioridad', render: (r) => UI.statusBadge(r.priority) },
        { key: 'client', label: 'Cliente', render: (r) => UI.escapeHtml(r.client ? r.client.name : '—') },
        { key: 'assignedTo', label: 'Responsable', render: (r) => UI.escapeHtml(r.assignedTo ? r.assignedTo.name : '—') },
        { key: 'status', label: 'Estado', render: (r) => UI.statusBadge(r.status) },
      ],
      fields: [
        { name: 'title', label: 'Título', type: 'text', required: true, full: true },
        { name: 'description', label: 'Descripción', type: 'textarea', full: true },
        { name: 'date', label: 'Fecha y hora', type: 'datetime-local', required: true, value: (r) => Format.toLocalInput(r.date) },
        { name: 'priority', label: 'Prioridad', type: 'select', options: ['baja', 'media', 'alta', 'urgente'] },
        { name: 'assignedTo', label: 'Responsable', type: 'select', options: users.map((x) => ({ value: x._id, label: x.name })) },
        { name: 'client', label: 'Cliente', type: 'select', options: [{ value: '', label: '— Sin cliente —' }, ...clients.map((x) => ({ value: x._id, label: x.name }))] },
        { name: 'status', label: 'Estado', type: 'select', options: ['pendiente', 'en_proceso', 'completada', 'cancelada', 'vencida'] },
      ],
      formData(values) {
        return { ...values, date: new Date(values.date).toISOString() };
      },
      extraActions(record) {
        const statuses = ['pendiente', 'en_proceso', 'completada', 'cancelada'];
        const options = statuses.map((s) => `<option value="${s}" ${s === record.status ? 'selected' : ''}>${s.replace(/_/g, ' ')}</option>`).join('');
        return `
          <select class="form-control" data-status style="display:inline-block;width:120px;padding:5px 8px;font-size:12px;" title="Cambiar estado">${options}</select>
          <button class="btn btn-secondary btn-sm" data-extra style="margin-left:4px;">Estado</button>
        `;
      },
      onExtraAction(record, btn, ctx) {
        const sel = btn.parentElement.querySelector('[data-status]');
        API.tasks
          .status(record._id, { status: sel.value })
          .then(() => {
            ctx.toast('Estado actualizado', 'success');
            ctx.reload();
          })
          .catch((error) => ctx.toast(error.message, 'error'));
      },
      onEdit: true,
      onRemove: true,
    });
  },
};
