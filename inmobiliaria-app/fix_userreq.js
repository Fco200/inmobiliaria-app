const fs = require('fs');
const p = 'C:/Users/oralia/OneDrive/Escritorio/paginas/INMOBILIARIA/backend/src/controllers/userRequest.controller.js';
let c = fs.readFileSync(p, 'utf8');

const marker = "  res.json({ success: true, message: `Solicitud marcada como ${action}.`, data: requestDoc });";
const insert = `  // Si fue aprobada, crear usuario y enviar correo
  if (action === 'aprobada') {
    try {
      const RoleModel = require('../models/role.model');
      let roleDoc = null;
      if (requestDoc.role === 'admin') roleDoc = await RoleModel.findOne({ code: 'admin' });
      else if (requestDoc.role === 'gerencia') roleDoc = await RoleModel.findOne({ code: 'gerencia' });
      else roleDoc = await RoleModel.findOne({ code: 'asesor' });
      if (!roleDoc) roleDoc = await RoleModel.findOne({ code: 'asesor' });
      let user = await User.findOne({ email: requestDoc.email });
      if (!user) {
        const tempPassword = generatePassword ? generatePassword(10) : Math.random().toString(36).slice(-10);
        const base = (requestDoc.email.split('@')[0] || 'usuario').toLowerCase().replace(/[^a-z0-9]/g, '');
        const username = base.length >= 3 ? base : base + '123';
        user = await User.create({
          name: requestDoc.name,
          email: requestDoc.email,
          username: username,
          phone: requestDoc.phone || '',
          role: roleDoc ? roleDoc._id : undefined,
          password: tempPassword,
          status: 'activo',
        });
        try {
          await sendMail({
            to: requestDoc.email,
            subject: 'Tu acceso al CRM ha sido habilitado',
            html: '<p>Hola ' + requestDoc.name + ',</p><p>Tu solicitud de acceso al CRM INMOBLES ha sido aprobada y tu cuenta ya esta habilitada.</p><p>Puedes ingresar desde: <a href="' + (process.env.FRONTEND_URL || 'https://crm.inmobles.com') + '/index.html">' + (process.env.FRONTEND_URL || 'https://crm.inmobles.com') + '/index.html</a></p><p>Te recomendamos cambiar tu contrasena al primer inicio de sesion.</p>',
            text: 'Hola ' + requestDoc.name + ', tu acceso ha sido habilitado. Ingresa a ' + (process.env.FRONTEND_URL || 'https://crm.inmobles.com') + '/index.html. Cambia tu contrasena al primer ingreso.'
          });
        } catch (e) { /* ignore */ }
      }
    } catch (e) {
      console.error('Error al crear usuario desde solicitud:', e);
    }
  }

`;

if (!c.includes('Correo enviado')) {
  c = c.replace(marker, insert + marker);
  fs.writeFileSync(p, c);
  console.log('updated');
} else {
  console.log('skip');
}
