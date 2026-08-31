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

async function seed() {
  let permissions = [];
  if ((await Permission.countDocuments()) === 0) {
    permissions = await Permission.insertMany(PERMISSIONS);
    console.log(`Permisos sembrados: ${permissions.length}`);
  } else {
    permissions = await Permission.find();
  }

  const permissionCodes = new Set(permissions.map((p) => p.code));

  if ((await Role.countDocuments()) === 0) {
    const roleDefs = [
      {
        name: 'Administrador',
        code: 'admin',
        description: 'Control total del sistema',
        isSystem: true,
        permissions: permissions.map((p) => p._id),
      },
      {
        name: 'Gerencia',
        code: 'gerencia',
        description: 'Supervisión y consulta de reportes',
        isSystem: true,
        permissions: permissions
          .filter((p) =>
            ['reports_view', 'reports_gerencia', 'dashboard_view', 'audit_view'].includes(p.code)
          )
          .map((p) => p._id),
      },
      {
        name: 'Asesor',
        code: 'asesor',
        description: 'Gestión comercial de sus clientes y negocios',
        isSystem: true,
        permissions: permissions
          .filter((p) =>
            [
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
            ].includes(p.code)
          )
          .map((p) => p._id),
      },
      {
        name: 'SuperAdmin (Soporte Técnico)',
        code: 'superadmin',
        description: 'Soporte técnico con acceso total al sistema',
        isSystem: true,
        permissions: permissions.map((p) => p._id),
      },
    ];

    const roles = await Role.insertMany(roleDefs);
    console.log(`Roles sembrados: ${roles.length}`);

    if ((await User.countDocuments()) === 0) {
      const adminRole = roles.find((r) => r.code === 'admin');
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
  }

  // Asegurar rol SUPERADMIN y usuario de soporte técnico TAMBIÉN en sistemas
  // ya existentes (actualización), no solo en la primera siembra.
  let superadminRole = await Role.findOne({ code: 'superadmin' });
  if (!superadminRole) {
    superadminRole = await Role.create({
      name: 'SuperAdmin (Soporte Técnico)',
      code: 'superadmin',
      description: 'Soporte técnico con acceso total al sistema',
      isSystem: true,
      permissions: permissions.map((p) => p._id),
    });
    console.log('Rol SuperAdmin (Soporte Técnico) creado');
  }

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
        key: 'mantenimiento.on',
        value: 'false',
        group: 'mantenimiento',
        description: 'Estado de mantenimiento ON/OFF para todo el sistema.',
      },
    ]);
    console.log('Configuración global por defecto sembrada');
  }

  return { permissions, permissionCodes };
}

module.exports = seed;
