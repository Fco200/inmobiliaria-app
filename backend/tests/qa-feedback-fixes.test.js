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
