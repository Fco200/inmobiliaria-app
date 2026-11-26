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

// El módulo Citas se integró en Calendario, pero se conserva toda su lógica
// (campos, filtros, normalización y validación) para no perder ninguna cita.
// Calendario monta este mismo panel y recibe onChanged para repintar los eventos.
window.AppointmentsUI = {
  async mount(container, options = {}) {
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

    // `auth.me` devuelve el usuario con `id` y `_id`; se acepta cualquiera de
    // los dos y se cae al usuario guardado para no dejar el asesor vacío.
    const currentUser = me || ApiClient.getStoredUser();
    const currentUserId = currentUser ? (currentUser._id || currentUser.id || '') : '';
    const userOptions = users.length
      ? UI.sortByLabel(users, (x) => x.name).map((x) => ({ value: x._id, label: x.name }))
      : [{ value: currentUserId, label: currentUser ? currentUser.name : '' }];

    const notifyChanged = () => {
      if (typeof options.onChanged === 'function') options.onChanged();
    };

    const ctrl = crudPage(container, {
      title: 'Citas',
      newLabel: 'Nueva cita',
      service: {
        list: (params) => API.appointments.list(params),
        create: async (body) => {
          const created = await API.appointments.create(body);
          notifyChanged();
          return created;
        },
        update: async (id, body) => {
          const updated = await API.appointments.update(id, body);
          notifyChanged();
          return updated;
        },
        remove: async (id) => {
          const removed = await API.appointments.remove(id);
          notifyChanged();
          return removed;
        },
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
        { key: 'property', label: 'Propiedad', render: (r) => (r.property ? UI.escapeHtml(UI.propertyOptionLabel(r.property)) : '—') },
        { key: 'type', label: 'Tipo', render: (r) => UI.badge(appointmentTypeLabel(r), 'info') },
        { key: 'status', label: 'Estado', render: (r) => UI.statusBadge(r.status) },
        { key: 'user', label: 'Asesor', render: (r) => UI.escapeHtml(r.user ? r.user.name : '—') },
      ],
      fields: [
        { name: 'date', label: 'Fecha y hora', type: 'datetime-local', required: true, value: (r) => Format.toLocalInput(r.date) },
        { name: 'client', label: 'Cliente', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.client, options: [{ value: '', label: '— Sin cliente —' }, ...UI.sortByLabel(clients, (x) => x.name).map((x) => ({ value: x._id, label: x.name }))] },
        { name: 'property', label: 'Propiedad', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.property, options: [{ value: '', label: '— Sin propiedad —' }, ...UI.sortByLabel(properties, UI.propertyOptionLabel).map((x) => ({ value: x._id, label: UI.propertyOptionLabel(x) }))] },
        { name: 'business', label: 'Negocio', type: 'select', sinOtros: true, search: true, searchSource: UI.remoteSources.business, options: [{ value: '', label: '— Sin negocio —' }, ...UI.sortByLabel(businesses, (x) => x.name).map((x) => ({ value: x._id, label: x.name }))] },
        { name: 'user', label: 'Asesor (se asigna automáticamente)', type: 'select', sinOtros: true, value: (r) => (r && r.user && (r.user._id || r.user)) || currentUserId, options: userOptions, hint: 'Al agendar, la cita queda asignada al asesor de la sesión.' },
        { name: 'type', label: 'Tipo de cita', type: 'select', sinOtros: true, options: APPOINTMENT_TYPES, value: (r) => (r.type === 'firma' ? 'firma_notario' : r.type) },
        { name: 'typeOther', label: 'Especifica el tipo de cita', type: 'text', placeholder: 'Ej. Revisión de escrituras…' },
        { name: 'status', label: 'Estado', type: 'select', sinOtros: true, options: ['pendiente', 'confirmada', 'realizada', 'cancelada', 'no_asistio'], value: (r) => r.status || 'pendiente' },
        { name: 'concepto', label: 'Concepto de la cita', type: 'text', full: true, placeholder: 'Ej. Presentar propuesta de compra' },
        { name: 'isPersonal', label: 'Cita personal (no se comparte con el equipo)', type: 'checkbox', full: true },
        { name: 'reminder', label: 'Recordatorio (opcional)', type: 'datetime-local', hint: '¿Cuándo quieres que te recordemos la cita? Déjalo vacío si no quieres recordatorio.', value: (r) => Format.toLocalInput(r.reminder) },
        { name: 'place', label: 'Lugar', type: 'text', full: true },
        { name: 'notes', label: 'Notas', type: 'textarea', full: true },
      ],
      formData(values, record) {
        const { reminder, typeOther, ...rest } = values;
        const rawType = values.type || 'visita_propiedad';
        const isKnownType = APPOINTMENT_TYPES.some((t) => t.value === rawType);
        // Si llega un valor que no está en el catálogo (datos antiguos o texto
        // libre de un "Otro" genérico), se guarda como "otro" con el detalle en
        // typeOther en vez de dejar que el backend rechace la cita.
        const type = isKnownType ? rawType : 'otro';
        const detail = isKnownType ? typeOther : (typeOther || rawType);
        // "Otro (especificar)" ya NO bloquea el guardado: si el usuario no
        // escribe el detalle, se conserva el texto opcional vacío y la cita
        // se crea con el tipo genérico "otro".
        return {
          ...rest,
          // Sólo al CREAR se fuerza al asesor de la sesión (el backend también
          // lo impone). Al editar se conserva el responsable original.
          ...(record ? {} : { user: currentUserId }),
          type,
          typeOther: type === 'otro' ? String(detail || '').trim() : '',
          date: Format.fromLocalInput(values.date),
          reminder: reminder ? Format.fromLocalInput(reminder) : null,
        };
      },
      onFormMount(form) {
        // El asesor no se elige a mano: se asigna desde la sesión al crear.
        const userSel = form.querySelector('#fld-user');
        if (userSel) {
          userSel.disabled = true;
          userSel.style.opacity = '0.75';
          userSel.style.cursor = 'not-allowed';
        }

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

        // Al crear una cita se propone la hora actual (redondeada a los 5
        // minutos) para no tener que escribirla siempre.
        const dateEl = form.querySelector('#fld-date');
        if (dateEl && !dateEl.value) {
          const d = new Date();
          d.setMinutes(Math.round(d.getMinutes() / 5) * 5, 0, 0);
          dateEl.value = Format.toLocalInput(d);
        }
      },
      onEdit: true,
      onRemove: true,
      onReady(openForm) {
        if (typeof options.onReady === 'function') options.onReady(openForm);
      },
    });
    return ctrl;
  },
  appointmentTypeLabel,
};

// Compatibilidad: si alguien abre directamente el antiguo módulo, usa el mismo panel.
window.Pages.appointments = {
  title: 'Citas',
  render(container) {
    return window.AppointmentsUI.mount(container);
  },
};
