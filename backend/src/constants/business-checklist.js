'use strict';

// Plantilla base de escrituración, en el orden oficial. Se aplica a cada negocio
// nuevo al crearlo y a los existentes la primera vez que se consulta su checklist.
// Los pendientes siguen siendo editables por el equipo: se pueden palomear
// (checkbox), eliminar individualmente y se pueden agregar tareas personalizadas.
//
// Estructura: sección (Vendedor(es) / Comprador(es)) > grupo (subtítulo) > pendiente.
//
// Si se modifica la lista o los títulos, subir CHECKLIST_TEMPLATE_VERSION:
//  - negocios nuevos: reciben la plantilla completa;
//  - negocios con una versión anterior: se actualizan sus secciones/títulos, y
//    solo se agregan pendientes que nunca se les aplicaron (no se reponen los
//    que el equipo eliminó a mano).
const CHECKLIST_TEMPLATE_VERSION = 2;

const SECCION_VENDEDOR = '1. SECCIÓN VENDEDOR(ES)';
const SECCION_COMPRADOR = '2. SECCIÓN COMPRADOR(ES)';

const GRUPO_GENERALES_VENDEDOR = 'Generales Vendedor(es)';
const GRUPO_DOCUMENTACION = 'Documentación de la Propiedad / Escrituras';
const GRUPO_GENERALES_COMPRADOR = 'Generales Comprador(es)';

const CHECKLIST_TEMPLATE = [
  { section: SECCION_VENDEDOR, group: GRUPO_GENERALES_VENDEDOR, text: 'INE / Pasaporte' },
  { section: SECCION_VENDEDOR, group: GRUPO_GENERALES_VENDEDOR, text: 'RFC' },
  { section: SECCION_VENDEDOR, group: GRUPO_GENERALES_VENDEDOR, text: 'Copia Acta de Nacimiento' },
  { section: SECCION_VENDEDOR, group: GRUPO_GENERALES_VENDEDOR, text: 'Copia Acta de Matrimonio' },
  { section: SECCION_VENDEDOR, group: GRUPO_GENERALES_VENDEDOR, text: 'Generales Cónyuge Vendedor (INE/Pasaporte, RFC, Copia Acta Nacimiento)' },

  { section: SECCION_VENDEDOR, group: GRUPO_DOCUMENTACION, text: 'Escrituras' },
  { section: SECCION_VENDEDOR, group: GRUPO_DOCUMENTACION, text: 'Recibo Predial' },
  { section: SECCION_VENDEDOR, group: GRUPO_DOCUMENTACION, text: 'Recibo Agua' },
  { section: SECCION_VENDEDOR, group: GRUPO_DOCUMENTACION, text: 'Recibo CFE' },
  { section: SECCION_VENDEDOR, group: GRUPO_DOCUMENTACION, text: 'C. Valor Catastral' },
  { section: SECCION_VENDEDOR, group: GRUPO_DOCUMENTACION, text: 'C. de Terminación de Obra' },
  { section: SECCION_VENDEDOR, group: GRUPO_DOCUMENTACION, text: 'Uso de Suelo' },
  { section: SECCION_VENDEDOR, group: GRUPO_DOCUMENTACION, text: 'Carta Saldo' },
  { section: SECCION_VENDEDOR, group: GRUPO_DOCUMENTACION, text: 'Estado de Cuenta Banco' },
  { section: SECCION_VENDEDOR, group: GRUPO_DOCUMENTACION, text: 'Lista Nominal INE' },
  { section: SECCION_VENDEDOR, group: GRUPO_DOCUMENTACION, text: 'CURP' },
  { section: SECCION_VENDEDOR, group: GRUPO_DOCUMENTACION, text: 'Comprobante de Domicilio' },
  { section: SECCION_VENDEDOR, group: GRUPO_DOCUMENTACION, text: '¿Hipoteca? (Especificar con qué institución)' },
  { section: SECCION_VENDEDOR, group: GRUPO_DOCUMENTACION, text: 'Cancelación de Hipoteca' },
  { section: SECCION_VENDEDOR, group: GRUPO_DOCUMENTACION, text: 'CNA Predial' },
  { section: SECCION_VENDEDOR, group: GRUPO_DOCUMENTACION, text: 'CNA Agua' },
  { section: SECCION_VENDEDOR, group: GRUPO_DOCUMENTACION, text: 'CNA CFE' },
  { section: SECCION_VENDEDOR, group: GRUPO_DOCUMENTACION, text: 'CIR' },
  { section: SECCION_VENDEDOR, group: GRUPO_DOCUMENTACION, text: 'Exentar ISR (Sí/No - Especificar cómo)' },

  { section: SECCION_COMPRADOR, group: GRUPO_GENERALES_COMPRADOR, text: 'INE / Pasaporte (Comprador 1 y Comprador 2)' },
  { section: SECCION_COMPRADOR, group: GRUPO_GENERALES_COMPRADOR, text: 'Lista Nominal INE (Comprador 1 y Comprador 2)' },
  { section: SECCION_COMPRADOR, group: GRUPO_GENERALES_COMPRADOR, text: 'RFC (Comprador 1 y Comprador 2)' },
  { section: SECCION_COMPRADOR, group: GRUPO_GENERALES_COMPRADOR, text: 'CURP (Comprador 1 y Comprador 2)' },
  { section: SECCION_COMPRADOR, group: GRUPO_GENERALES_COMPRADOR, text: 'Acta de Nacimiento (Comprador 1 y Comprador 2)' },
  { section: SECCION_COMPRADOR, group: GRUPO_GENERALES_COMPRADOR, text: 'Acta de Matrimonio' },
  { section: SECCION_COMPRADOR, group: GRUPO_GENERALES_COMPRADOR, text: 'SIC (Comprador 1 y Comprador 2)' },
  { section: SECCION_COMPRADOR, group: GRUPO_GENERALES_COMPRADOR, text: 'Anexo C (Comprador 1 y Comprador 2)' },
  { section: SECCION_COMPRADOR, group: GRUPO_GENERALES_COMPRADOR, text: 'Solicitud de Avalúo (Comprador 1 y Comprador 2)' },
  { section: SECCION_COMPRADOR, group: GRUPO_GENERALES_COMPRADOR, text: 'Taller Saber Más (Comprador 1 y Comprador 2)' },
  { section: SECCION_COMPRADOR, group: GRUPO_GENERALES_COMPRADOR, text: 'Precalificación' },
  { section: SECCION_COMPRADOR, group: GRUPO_GENERALES_COMPRADOR, text: 'Solicitud de Inscripción' },
  { section: SECCION_COMPRADOR, group: GRUPO_GENERALES_COMPRADOR, text: 'Acuse (Comprador 1 y Comprador 2)' },
  { section: SECCION_COMPRADOR, group: GRUPO_GENERALES_COMPRADOR, text: 'Aviso Previo' },
  { section: SECCION_COMPRADOR, group: GRUPO_GENERALES_COMPRADOR, text: 'Comprobante de Domicilio' },
  { section: SECCION_COMPRADOR, group: GRUPO_GENERALES_COMPRADOR, text: 'Revisar RFC y CURP en cuenta' },
  { section: SECCION_COMPRADOR, group: GRUPO_GENERALES_COMPRADOR, text: 'Revisar Aportaciones Patronales' },
];

module.exports = { CHECKLIST_TEMPLATE, CHECKLIST_TEMPLATE_VERSION };
