'use strict';

window.Pages = window.Pages || {};

window.Pages.expenses = {
  title: 'Gastos e inversiones',

  async render(container) {
    let me = null;
    let businesses = [];
    try {
      const [m, b] = await Promise.all([
        API.auth.me().catch(() => null),
        API.businesses.list({ limit: 100 }).catch(() => ({ data: [] })),
      ]);
      me = m;
      businesses = b.data;
    } catch (error) {
      // sin opciones
    }

    // Comprobante pendiente por subir (se guarda en Expense.receipt).
    const uploadReceipt = async (body) => {
      const input = document.getElementById('fld-receipt_file');
      if (!input || !input.files || !input.files[0]) return;
      UI.toast('Subiendo comprobante...', 'info');
      const res = await API.documents.upload(input.files[0]);
      body.receipt = res.fileUrl;
    };

    crudPage(container, {
      title: 'Gastos e inversiones',
      newLabel: 'Nuevo gasto',
      service: {
        list: (params) => API.expenses.list(params),
        create: async (body) => { await uploadReceipt(body); return API.expenses.create(body); },
        update: async (id, body) => { await uploadReceipt(body); return API.expenses.update(id, body); },
        remove: (id) => API.expenses.remove(id),
      },
      columns: [
        { key: 'concept', label: 'Concepto', render: (r) => `<strong>${UI.escapeHtml(r.concept)}</strong><br><small class="text-muted">${UI.escapeHtml(r.activity || '')}</small>` },
        { key: 'category', label: 'Categoría', render: (r) => UI.badge(String(r.category || '').replace(/_/g, ' '), 'info') },
        { key: 'amount', label: 'Monto', render: (r) => Format.currency(r.amount) },
        { key: 'date', label: 'Fecha', render: (r) => Format.date(r.date) },
        { key: 'business', label: 'Negocio', render: (r) => UI.escapeHtml(r.business ? r.business.name : '—') },
        { key: 'user', label: 'Asesor', render: (r) => UI.escapeHtml(r.user ? r.user.name : '—') },
      ],
      fields: [
        { name: 'concept', label: 'Concepto', type: 'text', required: true },
        { name: 'category', label: 'Categoría', type: 'select', options: ['gasolina', 'publicidad', 'lonas', 'tarjetas', 'volantes', 'imagen', 'traslados', 'material', 'impresiones', 'otros'] },
        { name: 'amount', label: 'Monto', type: 'number', required: true },
        { name: 'date', label: 'Fecha', type: 'datetime-local', required: true, value: (r) => Format.toLocalInput(r.date) },
        { name: 'activity', label: 'Actividad', type: 'text' },
        { name: 'business', label: 'Negocio relacionado', type: 'select', options: [{ value: '', label: '— Sin negocio —' }, ...businesses.map((x) => ({ value: x._id, label: x.name }))] },
        { name: 'observations', label: 'Observaciones', type: 'textarea', full: true },
        { name: 'receipt_file', label: 'Comprobante (factura/ticket)', type: 'file', accept: 'image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,application/pdf', full: true, hint: 'Opcional. Imagen o PDF que queda guardado con el gasto (máx. 15 MB).' },
      ],
      extraActions(record) {
        return record.receipt
          ? `<a class="btn btn-secondary btn-sm" data-extra href="${window.AppConfig.resolveUrl(record.receipt)}" target="_blank" rel="noopener" title="Ver comprobante">&#128196;&nbsp; Comprobante</a>`
          : '';
      },
      formData(values) {
        return { ...values, date: new Date(values.date).toISOString() };
      },
      onEdit: true,
      onRemove: true,
    });
  },
};
