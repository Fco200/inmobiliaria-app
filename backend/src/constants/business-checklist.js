'use strict';

// Plantilla base de escrituración. Se aplica automáticamente a cada negocio
// nuevo y a los existentes la primera vez que se abre su checklist. Los
// pendientes son editables por el equipo (se pueden palomear o eliminar y se
// pueden agregar tareas adicionales).
//
// Si se modifica la lista, subir CHECKLIST_TEMPLATE_VERSION: los negocios con
// una versión anterior reciben los pendientes nuevos que aún no tengan.
const CHECKLIST_TEMPLATE_VERSION = 1;

const CHECKLIST_TEMPLATE = [
  { group: 'Generales Vendedor(es)', text: 'INE / Pasaporte' },
  { group: 'Generales Vendedor(es)', text: 'RFC' },
  { group: 'Generales Vendedor(es)', text: 'Copia Acta de Nacimiento' },
  { group: 'Generales Vendedor(es)', text: 'Copia Acta de Matrimonio' },
  { group: 'Generales Vendedor(es)', text: 'Generales Cónyuge Vendedor (INE/Pasaporte, RFC, Copia Acta Nacimiento)' },

  { group: 'Escrituras', text: 'Escrituras' },
  { group: 'Escrituras', text: 'Recibo Predial' },
  { group: 'Escrituras', text: 'Recibo Agua' },
  { group: 'Escrituras', text: 'Recibo CFE' },
  { group: 'Escrituras', text: 'C. Valor Catastral' },
  { group: 'Escrituras', text: 'C. de Terminación de Obra' },
  { group: 'Escrituras', text: 'Uso de Suelo' },
  { group: 'Escrituras', text: 'Carta Saldo' },
  { group: 'Escrituras', text: 'Estado de Cuenta Banco' },
  { group: 'Escrituras', text: 'Lista Nominal INE' },
  { group: 'Escrituras', text: 'CURP' },
  { group: 'Escrituras', text: 'Comprobante de Domicilio' },
  { group: 'Escrituras', text: '¿Hipoteca? (Especificar con qué institución)' },
  { group: 'Escrituras', text: 'Cancelación de Hipoteca' },
  { group: 'Escrituras', text: 'CNA Predial' },
  { group: 'Escrituras', text: 'CNA Agua' },
  { group: 'Escrituras', text: 'CNA CFE' },
  { group: 'Escrituras', text: 'CIR' },
  { group: 'Escrituras', text: 'Exentar ISR (Sí/No - Especificar cómo)' },

  { group: 'Generales Comprador(es)', text: 'INE / Pasaporte (Comprador 1 y Comprador 2)' },
  { group: 'Generales Comprador(es)', text: 'Lista Nominal INE (Comprador 1 y Comprador 2)' },
  { group: 'Generales Comprador(es)', text: 'RFC (Comprador 1 y Comprador 2)' },
  { group: 'Generales Comprador(es)', text: 'CURP (Comprador 1 y Comprador 2)' },
  { group: 'Generales Comprador(es)', text: 'Acta de Nacimiento (Comprador 1 y Comprador 2)' },
  { group: 'Generales Comprador(es)', text: 'Acta de Matrimonio' },
  { group: 'Generales Comprador(es)', text: 'SIC (Comprador 1 y Comprador 2)' },
  { group: 'Generales Comprador(es)', text: 'Anexo C (Comprador 1 y Comprador 2)' },
  { group: 'Generales Comprador(es)', text: 'Solicitud de Avalúo (Comprador 1 y Comprador 2)' },
  { group: 'Generales Comprador(es)', text: 'Taller Saber Más (Comprador 1 y Comprador 2)' },
  { group: 'Generales Comprador(es)', text: 'Precalificación' },
  { group: 'Generales Comprador(es)', text: 'Solicitud de Inscripción' },
  { group: 'Generales Comprador(es)', text: 'Acuse (Comprador 1 y Comprador 2)' },
  { group: 'Generales Comprador(es)', text: 'Aviso Previo' },
  { group: 'Generales Comprador(es)', text: 'Comprobante de Domicilio' },
  { group: 'Generales Comprador(es)', text: 'Revisar RFC y CURP en cuenta' },
  { group: 'Generales Comprador(es)', text: 'Revisar Aportaciones Patronales' },
];

module.exports = { CHECKLIST_TEMPLATE, CHECKLIST_TEMPLATE_VERSION };
