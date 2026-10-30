'use strict';

window.Pages = window.Pages || {};

window.Pages.goals = {
  title: 'Metas',

  async render(container) {
    // Imagen de la meta pendiente por subir (se guarda en Goal.image).
    const uploadGoalImage = async (body) => {
      const input = document.getElementById('fld-image_file');
      if (!input || !input.files || !input.files[0]) return;
      UI.toast('Subiendo imagen...', 'info');
      const res = await API.documents.upload(input.files[0]);
      body.image = res.fileUrl;
    };

    let me = null;
    let users = [];
    try {
      const [m, u] = await Promise.all([
        API.auth.me().catch(() => null),
        API.users.list({ limit: 100 }).catch(() => ({ data: [] })),
      ]);
      me = m;
      users = u.data;
    } catch (error) {
      // sin opciones
    }

    if (!users.length && me) users = [me];

    const totalWeeks = (r) => {
      const start = new Date(r.startDate).getTime();
      const end = new Date(r.endDate).getTime();
      const days = Math.max(1, Math.ceil((end - start) / 86400000));
      return Math.max(1, Math.ceil(days / 7));
    };
    const weeklyTarget = (r) => (Number(r.objectiveAmount) || 0) / totalWeeks(r);
    const weeksElapsed = (r) => {
      const start = new Date(r.startDate).getTime();
      const days = Math.max(0, Math.floor((Date.now() - start) / 86400000));
      return Math.min(totalWeeks(r), Math.floor(days / 7) + 1);
    };
    const expectedSoFar = (r) => weeklyTarget(r) * weeksElapsed(r);

    crudPage(container, {
      title: 'Metas',
      newLabel: 'Nueva meta',
      service: {
        list: (params) => API.goals.list(params),
        create: async (body) => { await uploadGoalImage(body); return API.goals.create(body); },
        update: async (id, body) => { await uploadGoalImage(body); return API.goals.update(id, body); },
        remove: (id) => API.goals.remove(id),
      },
      statusOptions: ['activa', 'cumplida', 'vencida', 'cancelada'],
      columns: [
        { key: 'name', label: 'Meta', render: (r) => (r.image ? `<img src="${UI.escapeHtml(window.AppConfig.resolveUrl(r.image))}" alt="" style="width:36px;height:36px;border-radius:6px;object-fit:cover;vertical-align:middle;margin-right:8px;">` : '') + `<strong>${UI.escapeHtml(r.name)}</strong><br><small class="text-muted">${UI.escapeHtml(r.description || '')}</small>` },
        { key: 'objectiveAmount', label: 'Objetivo', render: (r) => Format.currency(r.objectiveAmount) },
        { key: 'currentResult', label: 'Avance', render: (r) => {
            const pct = (r.currentResult / r.objectiveAmount) * 100;
            const behind = r.currentResult < expectedSoFar(r);
            return `${UI.progressBar(pct)}<small style="color:${behind ? '#dc2626' : 'var(--text-muted)'};font-weight:${behind ? '700' : '400'};">${pct.toFixed(1)}% · ${behind ? 'Atrasada ⚠' : 'Al día'}</small>`;
          } },
        { key: 'weekly', label: 'Meta semanal', render: (r) => `${Format.currency(weeklyTarget(r))}<br><small class="text-muted">Semana ${weeksElapsed(r)} de ${totalWeeks(r)} · esperado ${Format.currency(expectedSoFar(r))}</small>` },
        { key: 'missingAmount', label: 'Faltante', render: (r) => Format.currency(r.objectiveAmount - r.currentResult) },
        { key: 'projection', label: 'Proyección', render: (r) => `${Format.currency(r.projection)}<br><small class="text-muted">Al ritmo actual</small>` },
        { key: 'endDate', label: 'Límite', render: (r) => {
            const days = Math.max(0, Math.ceil((new Date(r.endDate).getTime() - Date.now()) / 86400000));
            return `${Format.date(r.endDate)}<br><small class="text-muted">${days} ${Format.plural(days, 'día', 'días')} restantes</small>`;
          } },
        { key: 'status', label: 'Estado', render: (r) => UI.statusBadge(r.status) },
      ],
      fields: [
        { name: 'name', label: 'Nombre de la meta', type: 'text', required: true, full: true },
        { name: 'image', label: 'URL de la imagen', type: 'text', hint: 'Imagen motivacional o de referencia' },
        { name: 'image_file', label: 'O subir imagen desde el dispositivo', type: 'file', accept: 'image/jpeg,image/png,image/gif,image/webp,image/avif,image/heic,image/heif', full: true, hint: 'Si subes un archivo reemplaza la URL (máx. 15 MB).' },
        { name: 'description', label: 'Descripción', type: 'textarea', full: true },
        { name: 'objectiveAmount', label: 'Monto objetivo', type: 'number', required: true },
        { name: 'currentResult', label: 'Resultado actual', type: 'number' },
        { name: 'startDate', label: 'Fecha de inicio', type: 'datetime-local', required: true, value: (r) => Format.toLocalInput(r.startDate) },
        { name: 'endDate', label: 'Fecha límite', type: 'datetime-local', required: true, value: (r) => Format.toLocalInput(r.endDate) },
        { name: 'ticketsObjective', label: 'Tickets objetivo', type: 'number' },
        { name: 'ticketsGenerated', label: 'Tickets generados', type: 'number' },
        { name: 'ticketsCollected', label: 'Tickets cobrados', type: 'number' },
        { name: 'user', label: 'Asesor', type: 'select', sinOtros: true, value: me ? me._id : '', options: users.map((x) => ({ value: x._id, label: x.name })) },
        { name: 'status', label: 'Estado', type: 'select', options: ['activa', 'cumplida', 'vencida', 'cancelada'] },
      ],
      formData(values) {
        return {
          ...values,
          startDate: new Date(values.startDate).toISOString(),
          endDate: new Date(values.endDate).toISOString(),
        };
      },
      extraActions(record) {
        return record.image
          ? `<button class="btn btn-secondary btn-sm" data-extra data-goal-image data-record="${record._id}" style="margin-left:6px;" title="Ver imagen de la meta">&#128247;&nbsp; Imagen</button>`
          : '';
      },
      onExtraAction(record, btn) {
        if (btn.dataset.goalImage) {
          UI.showImages([record.image], `Meta: ${record.name}`);
        }
      },
      onEdit: true,
      onRemove: true,
    });
  },
};
