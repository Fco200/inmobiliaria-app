'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

test('editar una cita sin cambiar la fecha ya no exige "La fecha es obligatoria"', () => {
  const validator = read('backend', 'src', 'validators', 'appointment.validators.js');
  const routes = read('backend', 'src', 'routes', 'appointment.routes.js');

  assert.match(validator, /appointmentUpdateRules/, 'debe existir un validador de actualización');
  assert.match(
    validator,
    /dateRequired[\s\S]*body\('date'\)\.optional\(\{ values: 'falsy' \}\)\.isISO8601\(\)/,
    'en edición la fecha debe ser opcional pero validarse si viene'
  );
  assert.match(routes, /appointmentRouter\.put\('\/:id', idParam, appointmentUpdateRules/, 'PUT debe usar el validador de actualización');
  assert.match(routes, /taskRouter\.put\('\/:id', idParam, taskUpdateRules/, 'las tareas también deben permitir cambios parciales');
});

test('editar un gasto o una meta no exige reenviar todos los campos', () => {
  const validator = read('backend', 'src', 'validators', 'finance.validators.js');
  const routes = read('backend', 'src', 'routes', 'finance.routes.js');

  assert.match(validator, /expenseUpdateRules/, 'debe existir un validador de gasto para edición');
  assert.match(validator, /goalUpdateRules/, 'debe existir un validador de meta para edición');
  assert.match(routes, /expenseUpdateRules/, 'PUT de gastos debe usarlo');
  assert.match(routes, /goalUpdateRules/, 'PUT de metas debe usarlo');
});

test('al elegir "Recomendación" aparece de inmediato la pregunta ¿Quién te recomendó?', () => {
  const clients = read('frontend', 'pages', 'clients', 'clients.js');

  assert.match(clients, /data-otro-box/, 'el campo condicional debe tener su propio contenedor');
  assert.match(clients, /data-otro-label/, 'debe existir un label propio para la pregunta');
  assert.match(clients, /labelEl\.textContent = otroLabels\[select\.value\]/, 'el label debe cambiar según la opción');
  assert.match(clients, /box\.style\.display = show \? 'block' : 'none'/, 'el bloque debe mostrarse al seleccionar la opción');
  assert.match(clients, /¿Quién te recomendó\? \*/, 'el texto debe preguntar quién recomendó');
  // Los data-* llevan JSON con comillas: deben escaparse para atributo o el
  // navegador corta el valor y "Recomendación" deja de coincidir con ['Otro'].
  assert.match(clients, /const escAttr = .*replace\(\/"\/g, '&quot;'\)/, 'debe existir un escape para atributos con comillas');
  assert.match(clients, /data-otro-when="\$\{escAttr\(JSON\.stringify\(otroWhen\)\)\}"/, 'data-otro-when debe usar escAttr');
  assert.doesNotMatch(clients, /data-otro-when="\$\{esc\(JSON\.stringify/, 'esc() no escapa comillas y rompe el atributo');
});

test('el reporte de gerencia filtra tickets por fechas y entrega la relación de tickets y gastos', () => {
  const report = read('backend', 'src', 'controllers', 'report.controller.js');

  assert.match(report, /function ticketDateExpr/, 'los tickets deben respetar el rango Desde/Hasta');
  assert.match(report, /function ticketPeriodExpr/, 'el detalle de tickets debe filtrarse por generación o cobro');
  assert.match(report, /Ticket\.find\(ticketFilter\)/, 'debe devolver el detalle de tickets por asesor');
  assert.match(report, /expenses: expenseList/, 'debe devolver la relación de gastos');
  assert.match(report, /CLOSURE_OPERATIONS/, 'el valor de cierres debe limitarse a venta, renta y compra localizada');
});

test('el reporte "Mis reportes" incluye fechas y separa tickets de comisiones', () => {
  const reports = read('frontend', 'pages', 'reports', 'reports.js');
  const dashboard = read('backend', 'src', 'controllers', 'dashboard.controller.js');
  const service = read('frontend', 'js', 'services', 'index.js');

  assert.match(reports, /id="report-from"/, 'debe existir filtro Desde');
  assert.match(reports, /id="report-to"/, 'debe existir filtro Hasta');
  assert.match(dashboard, /const \{ from, to \} = req\.query/, 'el backend debe aceptar el rango');
  assert.match(dashboard, /ticketsPending/, 'debe exponer tickets por cobrar como cantidad');
  assert.match(service, /userReport: \(userId, params\) => ApiClient\.get\(`\/dashboard\/user\/\$\{userId\}`, params\)/, 'el frontend debe enviar el rango');
  assert.doesNotMatch(reports, /card\('Comisiones'/, 'no debe duplicar tickets cobrados como comisiones');
});

test('la gerencia muestra tickets de asesores y la relación de gastos hechos', () => {
  const management = read('frontend', 'pages', 'management', 'management.js');

  assert.match(management, /Tickets de los asesores/, 'debe listar los tickets por asesor');
  assert.match(management, /Relación de gastos hechos/, 'debe listar los gastos realizados');
  assert.match(management, /ticketsPending/, 'debe mostrar tickets por cobrar');
});

test('la relación de gastos se puede filtrar por fechas y exportar con los mismos filtros', () => {
  const expenses = read('frontend', 'pages', 'expenses', 'expenses.js');
  const crudPage = read('frontend', 'js', 'components', 'crudPage.js');
  const controller = read('backend', 'src', 'controllers', 'expense.controller.js');

  assert.match(expenses, /key: 'dateFrom'/, 'el listado debe tener filtro Desde');
  assert.match(expenses, /key: 'dateTo'/, 'el listado debe tener filtro Hasta');
  assert.match(expenses, /csvExport: \(params\) => API\.expenses\.exportCsv\(params\)/, 'el CSV debe recibir los filtros');
  assert.match(crudPage, /config\.csvExport\(\{/, 'crudPage debe pasar búsqueda y filtros al CSV');
  assert.match(controller, /dateField: 'date'/, 'el CRUD de gastos debe filtrar por fecha');
  assert.match(controller, /req\.query\.dateFrom/, 'la exportación debe respetar Desde');
  assert.match(controller, /req\.query\.dateTo/, 'la exportación debe respetar Hasta');
});

test('elegir "Otro (especificar)" no invalida el tipo de cita', () => {
  const ui = read('frontend', 'js', 'components', 'ui.js');
  const appointments = read('frontend', 'pages', 'appointments', 'appointments.js');

  assert.match(ui, /name="\$\{name\}" data-ui-sin-otros/, 'los selects con su propio "Otro" deben marcarse');
  assert.match(ui, /hasAttribute\('data-ui-sin-otros'\)/, 'el manejador genérico debe ignorarlos');
  assert.match(appointments, /name: 'type'[^\n]*sinOtros: true/, 'el tipo de cita tiene su campo "Especifica" propio');
  assert.match(appointments, /isKnownType/, 'un valor fuera del catálogo se normaliza a "otro"');
  assert.match(appointments, /typeOther: type === 'otro'/g, 'el detalle viaja en typeOther, no en type');
});

test('compartir una propiedad ya no incluye un enlace que no lleva a ningún lado', () => {
  const publicCatalog = read('frontend', 'pages', 'propiedades', 'propiedades.js');
  const advisorPage = read('frontend', 'pages', 'asesor', 'asesor.js');

  assert.doesNotMatch(publicCatalog, /propertyLink|data-share|Copiar enlace|Compartir por WhatsApp|Ver: \$\{share\}/);
  assert.doesNotMatch(advisorPage, /propertyLink|data-share|Copiar enlace|Compartir por WhatsApp|Ver: \$\{share\}/);
  assert.match(publicCatalog, /PS\.whatsappLink\(waMsg, waPhone\)/, 'el contacto por WhatsApp sigue disponible sin enlace');
  assert.match(advisorPage, /PS\.whatsappLink\(waMsg, waPhone\)/, 'la ficha del asesor sigue ofreciendo WhatsApp sin enlace');
});

test('el login ya no muestra el aviso de actualizar la app', () => {
  const loginHtml = read('frontend', 'index.html');
  const loginJs = read('frontend', 'js', 'login.js');

  assert.doesNotMatch(loginHtml, /login-security-notice|btn-login-update|ACTUALIZA TU APP POR CUESTIONES DE SEGURIDAD/);
  assert.doesNotMatch(loginJs, /versionNotice|login-security-notice|btn-login-update/);
  assert.match(loginJs, /showVersion\(\)/, 'se conserva sólo la etiqueta de versión');
});

test('Formatos tiene una sola subida de compartidos y ya no existe el sistema de plantillas', () => {
  const documents = read('frontend', 'pages', 'documents', 'documents.js');
  const routes = read('backend', 'src', 'routes', 'formato.routes.js');
  const shared = read('backend', 'src', 'controllers', 'sharedFormat.controller.js');

  assert.equal((documents.match(/id="shared-form"/g) || []).length, 1, 'solo un formulario de subida');
  assert.doesNotMatch(
    documents,
    /listarPlantillas|openPlantillasSelector|data-open-formatos|data-new-template|Generar Formato PDF|Formatos rápidos/,
    'no debe quedar ningún bloque de plantillas ni el listado duplicado del modal'
  );
  assert.match(documents, /UI\.confirm\('¿Eliminar este formato compartido\?[\s\S]*base de datos/, 'el borrado pide confirmación');
  assert.doesNotMatch(routes, /plantillas|generar\//, 'la API de plantillas debe estar eliminada');
  assert.match(routes, /router\.get\('\/compartidos'/, 'se conserva el listado compartido');
  assert.match(routes, /router\.delete\('\/compartidos\/:id'/, 'se conserva el borrado');
  assert.match(shared, /await item\.deleteOne\(\)/, 'el registro se borra de la base de datos');
  assert.match(shared, /deleteFileIfUnused\(fileUrl\)/, 'el archivo también se elimina');
  assert.equal(fs.existsSync(path.join(ROOT, 'plantillas')), false, 'la carpeta física debe desaparecer');
  assert.equal(
    fs.existsSync(path.join(ROOT, 'backend', 'src', 'services', 'plantillas.service.js')),
    false,
    'el servicio de plantillas debe desaparecer'
  );
});

test('el embudo del dashboard mezcla clientes, negocios y citas con un mismo vocabulario', () => {
  const dashboard = read('backend', 'src', 'controllers', 'dashboard.controller.js');
  const dashboardUi = read('frontend', 'pages', 'dashboard', 'dashboard.js');
  const realtime = read('frontend', 'js', 'realtime.js');

  assert.match(dashboard, /FUNNEL_STAGES = \['prospecto', 'contacto', 'cita', 'negociacion', 'promesa', 'cierre'\]/);
  assert.match(dashboard, /async function buildFunnel/, 'debe existir una única fuente del embudo');
  assert.match(dashboard, /Client\.find\(clientMatch\)/);
  assert.match(dashboard, /Business\.find\(businessMatch\)/);
  assert.match(dashboard, /Appointment\.find\(appointmentMatch\)/);
  assert.doesNotMatch(dashboard, /currentStage: 'negociacion'|currentStage: 'promesa'/, 'ya no se consultan alias legacy');
  assert.match(dashboardUi, /key: 'contacto'/, 'el frontend debe pintar la etapa de contacto');
  assert.match(realtime, /socket\.on\('data-changed'/, 'el embudo se refresca cuando cambian los datos');
});

test('Clientes estrena un aviso animado "Lo nuevo llegó" reabrible desde la barra', () => {
  const whatsNew = read('frontend', 'js', 'whatsNew.js');
  const clients = read('frontend', 'pages', 'clients', 'clients.js');
  const clientsHtml = read('frontend', 'clients.html');
  const css = read('frontend', 'css', 'base.css');

  assert.match(whatsNew, /window\.WhatsNew = \(\(\) => \{/, 'debe existir el módulo de novedades');
  assert.match(whatsNew, /¡Lo nuevo llegó!/, 'el título debe anunciar la implementación');
  assert.match(whatsNew, /const RELEASE = 'clientes-2026-11'/, 'la bandera debe estar ligada al release');
  assert.match(whatsNew, /crm_clients_whatsnew_\$\{RELEASE\}_\$\{id\}/, 'la clave debe incluir release y usuario');
  assert.match(whatsNew, /function maybeShow/, 'debe poder mostrarse automáticamente');
  assert.match(whatsNew, /#welcome-overlay, #modal-overlay/, 'no debe apilarse sobre otros overlays');
  assert.match(whatsNew, /e\.key === 'Escape'/, 'debe cerrarse con Escape');
  assert.match(clientsHtml, /<script src="js\/whatsNew\.js"><\/script>/, 'Clientes debe cargar el módulo');
  assert.match(clients, /id="clients-whatsnew"/, 'debe existir el botón Novedades');
  assert.match(clients, /window\.WhatsNew\.open\(\)/, 'el botón debe reabrir el aviso');
  assert.match(clients, /window\.WhatsNew\.maybeShow\(\)/, 'al abrir Clientes debe mostrarse una vez');
  assert.match(css, /\.whatsnew-overlay/, 'debe tener overlay propio');
  assert.match(css, /@keyframes whatsnewParticle/);
  assert.match(css, /@keyframes whatsnewBadge/);
  assert.match(css, /@keyframes whatsnewItem/);
});

test('gerencia y dirección ven el reporte de tickets con permisos coherentes', () => {
  const report = read('backend', 'src', 'controllers', 'report.controller.js');
  const shell = read('frontend', 'js', 'multipage.js');

  assert.match(report, /function canViewManagement/, 'permiso centralizado para el reporte');
  assert.match(report, /isBoss\(req\) \|\| \(isCustomRole\(req\) && hasPermission\(req, 'reports_gerencia'\)\)/);
  assert.doesNotMatch(report, /\['admin', 'gerencia', 'asesor'\]/, 'dirección y superadmin deben entrar en la relación');
  assert.doesNotMatch(report, /\['admin', 'direccion', 'gerencia', 'superadmin'\]\.includes/, 'la whitelist codificada debe desaparecer');
  assert.match(shell, /\['admin', 'direccion', 'gerencia', 'superadmin'\]\.includes\(role\.code\)/, 'gerencia no depende de permisos guardados');
  assert.match(shell, /\['admin', 'direccion', 'gerencia', 'superadmin'\]\.includes\(role\)/, 'isBoss del frontend incluye gerencia');
});
