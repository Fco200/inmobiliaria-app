'use strict';

window.Pages = window.Pages || {};

// Tipos de cita en el orden exacto en que los ofrece el formulario.
// 'otro' abre el campo "especificar" (typeOther) y 'firma' es el valor legado
// que se migra a 'firma_notario' al editar.
const APPOINTMENT_TYPES = [
  { value: 'visita_propiedad', label: 'Visita propiedad' },
  { value: 'oficina', label: 'Oficina' },
  { value: 'promesa', label: 'Promesa' },
  { value: 'avaluo', label: 'Avalúo' },
  { value: 'seguimiento', label: 'Seguimiento' },
  { value: 'firma_notario', label: 'Firma Notario' },
  { value: 'entrega', label: 'Entrega' },
  { value: 'comisiones', label: 'Comisiones' },
  { value: 'otro', label: 'Otro (especificar)' },
];

const APPOINTMENT_TYPE_LABELS = APPOINTMENT_TYPES.reduce((acc, t) => {
  acc[t.value] = t.label;
  return acc;
}, { firma: 'Firma Notario' });

const appointmentTypeLabel = (r) => {
  const type = r.type === 'firma' ? 'firma_notario' : r.type;
  const base = APPOINTMENT_TYPE_LABELS[type] || String(type || '').replace(/_/g, ' ');
  return r.type === 'otro' && r.typeOther ? `${base}: ${r.typeOther}` : base;
};

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
      // Filtros de la barra superior: cliente, propiedad, negocio y tipo, todos
      // con búsqueda remota (no despliegan la lista completa).
      filters: [
        { key: 'client', label: 'Cliente', searchSource: UI.remoteSources.client, placeholder: 'Todos los clientes' },
        { key: 'property', label: 'Propiedad', searchSource: UI.remoteSources.property, placeholder: 'Todas las propiedades' },
        { key: 'business', label: 'Negocio', searchSource: UI.remoteSources.business, placeholder: 'Todos los negocios' },
        { key: 'type', label: 'Tipo', placeholder: 'Todos los tipos', options: APPOINTMENT_TYPES.map((t) => ({ value: t.value, label: t.label })) },
      ],
      columns: [
        { key: 'date', label: 'Fecha y hora', render: (r) => Format.dateTime(r.date) },
        { key: 'client', label: 'Cliente', render: (r) => UI.escapeHtml(r.client ? r.client.name : '—') },
        { key: 'property', label: 'Propiedad', render: (r) => (r.property ? `${UI.escapeHtml(r.property.zone)} ${UI.escapeHtml(r.property.city)}` : '—') },
        { key: 'type', label: 'Tipo', render: (r) => UI.badge(appointmentTypeLabel(r), 'info') },
        { key: 'status', label: 'Estado', render: (r) => UI.statusBadge(r.status) },
        { key: 'user', label: 'Asesor', render: (r) => UI.escapeHtml(r.user ? r.user.name : '—') },
      ],
      fields: [
        { name: 'date', label: 'Fecha y hora', type: 'datetime-local', required: true, value: (r) => Format.toLocalInput(r.date) },
        { name: 'client', label: 'Cliente', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.client, options: [{ value: '', label: '— Sin cliente —' }, ...clients.map((x) => ({ value: x._id, label: x.name }))] },
        { name: 'property', label: 'Propiedad', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.property, options: [{ value: '', label: '— Sin propiedad —' }, ...properties.map((x) => ({ value: x._id, label: `${x.type} — ${x.zone} ${x.city}` }))] },
        { name: 'business', label: 'Negocio', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.business, options: [{ value: '', label: '— Sin negocio —' }, ...businesses.map((x) => ({ value: x._id, label: x.name }))] },
        { name: 'user', label: 'Asesor', type: 'select', sinOtros: true, value: me ? me._id : '', options: userOptions },
        { name: 'type', label: 'Tipo de cita', type: 'select', sinOtros: true, options: APPOINTMENT_TYPES, value: (r) => (r.type === 'firma' ? 'firma_notario' : r.type) },
        { name: 'typeOther', label: 'Especifica el tipo de cita', type: 'text', placeholder: 'Ej. Revisión de escrituras…' },
        { name: 'status', label: 'Estado', type: 'select', options: ['pendiente', 'confirmada', 'realizada', 'cancelada', 'no_asistio'] },
        { name: 'reminder', label: 'Recordatorio', type: 'datetime-local', hint: 'Aviso antes de la cita', value: (r) => Format.toLocalInput(r.reminder) },
        { name: 'place', label: 'Lugar', type: 'text', full: true },
        { name: 'notes', label: 'Notas', type: 'textarea', full: true },
      ],
      formData(values) {
        const { reminder, typeOther, ...rest } = values;
        const type = values.type || 'visita_propiedad';
        // "Otro (especificar)": exige el texto y lo guarda aparte del enum.
        if (type === 'otro' && !String(typeOther || '').trim()) {
          throw new Error('Especifica el tipo de cita.');
        }
        return {
          ...rest,
          type,
          typeOther: type === 'otro' ? String(typeOther).trim() : '',
          date: new Date(values.date).toISOString(),
          reminder: reminder ? new Date(reminder).toISOString() : null,
        };
      },
      onFormMount(form) {
        // El campo "especificar" sólo se muestra con el tipo "Otro".
        const typeSel = form.querySelector('#fld-type');
        const otherWrap = (() => {
          const el = form.querySelector('#fld-typeOther');
          return el ? el.parentElement : null;
        })();
        const sync = () => {
          if (otherWrap) otherWrap.style.display = typeSel && typeSel.value === 'otro' ? '' : 'none';
        };
        if (typeSel) typeSel.addEventListener('change', sync);
        sync();
      },
      onEdit: true,
      onRemove: true,
    });
  },
};
