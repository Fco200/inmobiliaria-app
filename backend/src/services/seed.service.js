'use strict';

const { Role, Permission, User, Setting, Config } = require('../models');
const { adminEmail, adminPassword, supportEmail, supportPassword } = require('../config/env');

const PERMISSIONS = [
  { code: 'dashboard_view', name: 'Ver dashboard', module: 'dashboard' },
  { code: 'users_manage', name: 'Administrar usuarios', module: 'users' },
  { code: 'roles_manage', name: 'Administrar roles', module: 'roles' },
  { code: 'clients_manage', name: 'Administrar clientes', module: 'clients' },
  { code: 'properties_manage', name: 'Administrar propiedades', module: 'properties' },
  { code: 'inventory_manage', name: 'Administrar inventario', module: 'inventory' },
  { code: 'businesses_manage', name: 'Administrar negocios', module: 'businesses' },
  { code: 'appointments_manage', name: 'Administrar citas', module: 'appointments' },
  { code: 'tasks_manage', name: 'Administrar tareas', module: 'tasks' },
  { code: 'goals_manage', name: 'Administrar metas', module: 'goals' },
  { code: 'documents_manage', name: 'Administrar documentos', module: 'documents' },
  { code: 'expenses_manage', name: 'Administrar gastos', module: 'expenses' },
  { code: 'tickets_manage', name: 'Administrar tickets', module: 'tickets' },
  { code: 'reports_view', name: 'Ver reportes', module: 'reports' },
  { code: 'reports_gerencia', name: 'Ver reportes de gerencia', module: 'reports' },
  { code: 'audit_view', name: 'Consultar auditoría', module: 'audit' },
  { code: 'settings_manage', name: 'Configurar sistema', module: 'settings' },
  { code: 'prospecting_manage', name: 'Administrar prospectación', module: 'prospecting' },
];

// Roles del sistema y módulos que habilita cada uno. Se crean/actualizan en
// CADA arranque (no solo en la primera siembra) para que una instalación
// existente reciba los roles nuevos sin perder usuarios ni datos.
const ROLE_DEFINITIONS = [
  {
    name: 'Administrador',
    code: 'admin',
    description: 'Control total del sistema',
    permissions: '*',
  },
  {
    name: 'Dirección',
    code: 'direccion',
    description: 'Administración total de la inmobiliaria',
    permissions: '*',
  },
  {
    name: 'Asistencia',
    code: 'asistencia',
    description: 'Clientes, asignación de prospectos, negocios, usuarios y formatos',
    permissions: [
      'dashboard_view',
      'users_manage',
      'clients_manage',
      'businesses_manage',
      'appointments_manage',
      'documents_manage',
      'prospecting_manage',
      'settings_manage',
    ],
  },
  {
    name: 'Gerencia',
    code: 'gerencia',
    description: 'Supervisión comercial, tareas, metas y reportes',
    permissions: [
      'dashboard_view',
      'clients_manage',
      'businesses_manage',
      'tasks_manage',
      'goals_manage',
      'reports_view',
      'reports_gerencia',
      'audit_view',
      'prospecting_manage',
    ],
  },
  {
    name: 'Escrituración',
    code: 'escrituracion',
    description: 'Etapas, conclusión, notas, checklist y documentos de negocios',
    permissions: [
      'dashboard_view',
      'clients_manage',
      'businesses_manage',
      'documents_manage',
      'reports_view',
    ],
  },
  {
    name: 'Asesor',
    code: 'asesor',
    description: 'Gestión comercial de sus clientes, prospectos y propiedades',
    permissions: [
      'dashboard_view',
      'clients_manage',
      'properties_manage',
      'businesses_manage',
      'appointments_manage',
      'tasks_manage',
      'goals_manage',
      'documents_manage',
      'expenses_manage',
      'tickets_manage',
      'reports_view',
      'prospecting_manage',
    ],
  },
  {
    name: 'SuperAdmin (Soporte Técnico)',
    code: 'superadmin',
    description: 'Soporte técnico con acceso total al sistema',
    permissions: '*',
  },
];

async function seed() {
  let permissions = [];
  if ((await Permission.countDocuments()) === 0) {
    permissions = await Permission.insertMany(PERMISSIONS);
    console.log(`Permisos sembrados: ${permissions.length}`);
  } else {
    permissions = await Permission.find();
  }

  const permissionCodes = new Set(permissions.map((p) => p.code));
  const allPermissionIds = permissions.map((p) => p._id);
  const idsFor = (codes) => permissions
    .filter((p) => codes.includes(p.code))
    .map((p) => p._id);

  let rolesCreated = 0;
  let rolesUpdated = 0;
  for (const def of ROLE_DEFINITIONS) {
    const permissionIds = def.permissions === '*' ? allPermissionIds : idsFor(def.permissions);
    const existing = await Role.findOne({ code: def.code });
    if (existing) {
      existing.name = def.name;
      existing.description = def.description;
      existing.isSystem = true;
      existing.permissions = permissionIds;
      existing.status = 'activo';
      await existing.save();
      rolesUpdated += 1;
    } else {
      await Role.create({
        name: def.name,
        code: def.code,
        description: def.description,
        isSystem: true,
        permissions: permissionIds,
        status: 'activo',
      });
      rolesCreated += 1;
    }
  }
  if (rolesCreated || rolesUpdated) {
    console.log(`Roles del sistema asegurados: ${rolesCreated} nuevo(s), ${rolesUpdated} actualizado(s).`);
  }

  if ((await User.countDocuments()) === 0) {
    const adminRole = await Role.findOne({ code: 'admin' });
    await User.create({
      name: 'Administrador',
      username: 'admin',
      email: adminEmail,
      password: adminPassword,
      role: adminRole._id,
      position: 'Administrador del sistema',
    });
    console.log(`Administrador inicial creado: ${adminEmail}`);
  }

  // Asegurar rol SUPERADMIN y usuario de soporte técnico TAMBIÉN en sistemas
  // ya existentes (actualización), no solo en la primera siembra.
  let superadminRole = await Role.findOne({ code: 'superadmin' });

  // Usuario de soporte técnico: se crea solo si no existe. El admin/asesores
  // no deben poder eliminarlo ni degradarlo.
  const existingSupport = await User.findOne({ email: supportEmail });
  if (!existingSupport && superadminRole) {
    await User.create({
      name: 'Soporte Técnico',
      username: 'soporte',
      email: supportEmail,
      password: supportPassword,
      role: superadminRole._id,
      position: 'Soporte Técnico FV DIGITAL',
      status: 'activo',
    });
    console.log(`Usuario de soporte técnico creado: ${supportEmail}`);
  }


  if ((await Setting.countDocuments()) === 0) {
    await Setting.insertMany([
      {
        key: 'inventory.publicUrl',
        value: '',
        group: 'inventario',
        description: 'URL de la página web pública de inventario (integración futura).',
      },
      {
        key: 'whatsapp.countryCode',
        value: '52',
        group: 'contacto',
        description: 'Código de país para enlaces de WhatsApp.',
      },
      {
        key: 'whatsapp.number',
        value: '',
        group: 'contacto',
        description: 'Número de WhatsApp para el catálogo público.',
      },
      {
        key: 'business.agencyName',
        value: 'Inmobiliaria',
        group: 'negocio',
        description: 'Nombre de la inmobiliaria.',
      },
      {
        key: 'landing.heroTitle',
        value: 'Encuentra el inmueble ideal',
        group: 'landing',
        description: 'Título del encabezado del catálogo público.',
      },
      {
        key: 'landing.heroSubtitle',
        value: 'Casas, departamentos, locales y terrenos en venta y renta.',
        group: 'landing',
        description: 'Subtítulo del encabezado del catálogo público.',
      },
      {
        key: 'landing.contactTitle',
        value: '¿Te interesa algún inmueble?',
        group: 'landing',
        description: 'Título de la sección de contacto del catálogo.',
      },
      {
        key: 'landing.contactText',
        value: 'Escríbenos por WhatsApp o entra a la plataforma para agendar una visita.',
        group: 'landing',
        description: 'Texto de la sección de contacto del catálogo.',
      },
      {
        key: 'landing.footerText',
        value: 'Bienes Raíces',
        group: 'landing',
        description: 'Texto del pie de página del catálogo.',
      },
      {
        key: 'landing.enabled',
        value: 'true',
        group: 'landing',
        description: 'Permite ver el catálogo público.',
      },
    ]);
    console.log('Ajustes por defecto sembrados');
  }

  if ((await Config.countDocuments()) === 0) {
    await Config.insertMany([
      {
        key: 'empresa.nombre',
        value: 'INMOBILIARIA',
        group: 'empresa',
        description: 'Nombre de la inmobiliaria.',
      },
      {
        key: 'empresa.telefonos',
        value: '',
        group: 'empresa',
        description: 'Teléfonos de contacto separados por comas.',
      },
      {
        key: 'empresa.logo',
        value: '',
        group: 'empresa',
        description: 'URL del logo de la inmobiliaria.',
      },
      {
        key: 'comisiones.base',
        value: '5',
        group: 'comisiones',
        description: 'Porcentaje base de comisiones.',
      },
      {
        key: 'mantenimiento.activo',
        value: false,
        group: 'mantenimiento',
        description: 'Bloqueo duro del modo mantenimiento (mantenimientoActivo).',
      },
      {
        key: 'mantenimiento.fechaProgramada',
        value: null,
        group: 'mantenimiento',
        description: 'Fecha/hora programada de inicio del mantenimiento.',
      },
      {
        key: 'mantenimiento.mensaje',
        value: '',
        group: 'mantenimiento',
        description: 'Mensaje mostrado en la pantalla de mantenimiento.',
      },
      {
        key: 'mantenimiento.mostrarAvisoPrevio',
        value: false,
        group: 'mantenimiento',
        description: '¿Mostrar aviso previo de 5 minutos antes del mantenimiento?',
      },
    ]);
    console.log('Configuración global por defecto sembrada');
  }

  return { permissions, permissionCodes };
}

module.exports = seed;
