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
      filters: [
        { key: 'client', label: 'Cliente', searchSource: UI.remoteSources.client, placeholder: 'Todos los clientes' },
        { key: 'property', label: 'Propiedad', searchSource: UI.remoteSources.property, placeholder: 'Todas las propiedades' },
        { key: 'business', label: 'Negocio', searchSource: UI.remoteSources.business, placeholder: 'Todos los negocios' },
      ],
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
        { name: 'priority', label: 'Prioridad', type: 'select', options: ['baja', 'media', 'alta', 'urgente'], value: 'media' },
        { name: 'assignedTo', label: 'Responsable', type: 'select', sinOtros: true, required: true, value: me ? me._id : '', options: UI.sortByLabel(users, (x) => x.name).map((x) => ({ value: x._id, label: x.name })) },
        { name: 'client', label: 'Cliente', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.client, options: [{ value: '', label: '— Sin cliente —' }, ...UI.sortByLabel(clients, (x) => x.name).map((x) => ({ value: x._id, label: x.name }))] },
        { name: 'status', label: 'Estado', type: 'select', required: true, options: ['pendiente', 'en_proceso', 'completada', 'cancelada', 'vencida'] },
      ],
      formData(values) {
        return { ...values, date: new Date(values.date).toISOString() };
      },
      extraActions(record) {
        const statuses = ['pendiente', 'en_proceso', 'completada', 'cancelada', 'vencida'];
        const priorities = ['baja', 'media', 'alta', 'urgente'];
        const statusOptions = statuses.map((s) => `<option value="${s}" ${s === record.status ? 'selected' : ''}>${s.replace(/_/g, ' ')}</option>`).join('');
        const priorityOptions = priorities.map((p) => `<option value="${p}" ${p === record.priority ? 'selected' : ''}>${p}</option>`).join('');
        // Ambos selects guardan solos al cambiar (data-extra-auto): ya no hay
        // que pulsar el botón "Estado".
        return `
          <select class="form-control" data-status data-extra-auto data-field="status" data-record="${record._id}" style="display:inline-block;width:120px;padding:5px 8px;font-size:12px;" title="Cambiar estado (se guarda al elegir)">${statusOptions}</select>
          <select class="form-control" data-priority data-extra-auto data-field="priority" data-record="${record._id}" style="display:inline-block;width:100px;padding:5px 8px;font-size:12px;margin-left:4px;" title="Cambiar prioridad (se guarda al elegir)">${priorityOptions}</select>
        `;
      },
      onExtraAction(record, sel, ctx) {
        // Cambio de prioridad: no hay endpoint dedicado, así que se reenvía la
        // tarea con los campos obligatorios actuales y la prioridad nueva.
        if (sel.matches && sel.matches('select[data-priority]')) {
          const assignedTo = record.assignedTo ? (record.assignedTo._id || record.assignedTo) : '';
          API.tasks
            .update(record._id, {
              title: record.title,
              date: record.date,
              assignedTo,
              priority: sel.value,
            })
            .then(() => {
              ctx.toast('Prioridad actualizada', 'success');
              if (window.Sounds) window.Sounds.step().catch(() => {});
              ctx.reload();
            })
            .catch((error) => {
              ctx.toast(error.message, 'error');
              ctx.reload();
            });
          return;
        }
        // Cambio de estado: endpoint dedicado PATCH /tasks/:id/status.
        const statusSel = (sel.matches && sel.matches('select[data-status]'))
          ? sel
          : (sel.parentElement && sel.parentElement.querySelector('[data-status]'));
        if (!statusSel) return;
        API.tasks
          .status(record._id, { status: statusSel.value })
          .then(() => {
            ctx.toast('Estado actualizado', 'success');
            // Sonido de confirmación, y especial cuando se completa la tarea.
            if (window.Sounds) {
              if (statusSel.value === 'completada') window.Sounds.confirmation().catch(() => {});
              else window.Sounds.step().catch(() => {});
            }
            ctx.reload();
          })
          .catch((error) => {
            ctx.toast(error.message, 'error');
            ctx.reload();
          });
      },
      onEdit: true,
      onRemove: true,
    });
  },
};
