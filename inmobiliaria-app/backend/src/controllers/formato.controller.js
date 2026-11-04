'use strict';

const path = require('path');
const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { Document } = require('../models');
const { POSICIONES, DEFAULT_LAYOUT } = require('../config/formatoPosiciones');
const logger = require('../services/logger.service');

const PLANTILLAS_DIR = path.join(__dirname, '../../../plantillas');

// Normaliza a NFC el nombre de plantilla recibido (URL) o leído del disco.
// En git/Linux los nombres vienen descompuestos (NFD: "Prestacio\u0301n"); los
// objetos PLANTILLAS_CONFIG usan forma compuesta (NFC: "Prestación"). Sin esta
// normalización, las plantillas con acentos serían "no encontradas" en el
// servidor aunque el archivo exista.
const norm = (s) => (typeof s === 'string' ? s.normalize('NFC') : s);

// Ubica el archivo real de la plantilla en disco comparando los nombres
// normalizados a NFC (robusto contra NFD/NFC en distintos sistemas de archivo).
function findPlantillaFile(id) {
  const target = norm(id);
  const files = fs.readdirSync(PLANTILLAS_DIR, { withFileTypes: true });
  const pdf = files.find(
    (f) => f.isFile() && f.name.toLowerCase().endsWith('.pdf') && norm(f.name.slice(0, -4)) === target
  );
  return pdf ? path.join(PLANTILLAS_DIR, pdf.name) : null;
}

// Mapeo de campos para cada plantilla
const PLANTILLAS_CONFIG = {
  'Generales Arrendatario': {
    nombre: 'Generales Arrendatario',
    secciones: [
      {
        titulo: 'Datos del Inmueble',
        icono: '&#127968;',
        campos: [
          { name: 'direccionInmueble', label: 'Dirección del inmueble', type: 'text', required: true, full: true, pdfField: 'DIRECCION' },
          { name: 'destinadoA', label: 'Destinado a', type: 'select', options: ['Habitacional', 'Comercial', 'Industrial'], pdfField: 'DESTINADO' },
          { name: 'mascotas', label: 'Mascotas', type: 'select', options: ['Si', 'No'], pdfField: 'MASCOTAS' },
          { name: 'tiempoContrato', label: 'Tiempo de contrato', type: 'text', placeholder: 'Ej: 12 meses', pdfField: 'TIEMPO' },
          { name: 'importeRenta', label: 'Importe de renta', type: 'number', placeholder: 'Ej: 8500', pdfField: 'IMPORTE' },
          { name: 'formaPago', label: 'Forma de pago', type: 'select', options: ['Efectivo', 'Transferencia', 'Deposito'], pdfField: 'FORMA_PAGO' },
        ]
      },
      {
        titulo: 'Datos del Arrendatario',
        icono: '&#128100;',
        campos: [
          { name: 'nombreArrendatario', label: 'Nombre completo', type: 'text', required: true, pdfField: 'NOMBRE_ARRENDATARIO' },
          { name: 'telefonoArrendatario', label: 'Teléfono', type: 'tel', required: true, pdfField: 'TELEFONO_ARRENDATARIO' },
          { name: 'rfcArrendatario', label: 'RFC', type: 'text', placeholder: 'XXXXXXXXXXXX', pdfField: 'RFC_ARRENDATARIO' },
          { name: 'correoArrendatario', label: 'Correo electrónico', type: 'email', pdfField: 'CORREO_ARRENDATARIO' },
          { name: 'ocupacionArrendatario', label: 'Ocupación', type: 'text', pdfField: 'OCUPACION_ARRENDATARIO' },
          { name: 'empresaArrendatario', label: 'Empresa', type: 'text', pdfField: 'EMPRESA_ARRENDATARIO' },
        ]
      },
      {
        titulo: 'Referencia Personal',
        icono: '&#128101;',
        campos: [
          { name: 'nombreReferencia', label: 'Nombre de la referencia', type: 'text', required: true, pdfField: 'NOMBRE_REFERENCIA' },
          { name: 'telefonoReferencia', label: 'Teléfono', type: 'tel', required: true, pdfField: 'TELEFONO_REFERENCIA' },
          { name: 'parentescoReferencia', label: 'Parentesco', type: 'select', options: ['Familiar', 'Amigo', 'Compañero', 'Otro'], pdfField: 'PARENTESCO_REFERENCIA' },
        ]
      },
      {
        titulo: 'Co-obligado Solidario',
        icono: '&#128196;',
        campos: [
          { name: 'nombreCoObligado', label: 'Nombre completo', type: 'text', required: true, pdfField: 'NOMBRE_CO_OBLIGADO' },
          { name: 'telefonoCoObligado', label: 'Teléfono', type: 'tel', required: true, pdfField: 'TELEFONO_CO_OBLIGADO' },
          { name: 'rfcCoObligado', label: 'RFC', type: 'text', placeholder: 'XXXXXXXXXXXX', pdfField: 'RFC_CO_OBLIGADO' },
          { name: 'correoCoObligado', label: 'Correo electrónico', type: 'email', pdfField: 'CORREO_CO_OBLIGADO' },
          { name: 'ocupacionCoObligado', label: 'Ocupación', type: 'text', pdfField: 'OCUPACION_CO_OBLIGADO' },
          { name: 'empresaCoObligado', label: 'Empresa', type: 'text', pdfField: 'EMPRESA_CO_OBLIGADO' },
        ]
      }
    ]
  },

  'Generales Arrendador': {
    nombre: 'Generales Arrendador',
    secciones: [
      {
        titulo: 'Datos del Inmueble',
        icono: '&#127968;',
        campos: [
          { name: 'direccionInmueble', label: 'Dirección del inmueble', type: 'text', required: true, full: true, pdfField: 'DIRECCION' },
          { name: 'destinadoA', label: 'Destinado a', type: 'select', options: ['Habitacional', 'Comercial', 'Industrial'], pdfField: 'DESTINADO' },
          { name: 'tiempoContrato', label: 'Tiempo de contrato', type: 'text', placeholder: 'Ej: 12 meses', pdfField: 'TIEMPO' },
          { name: 'importeRenta', label: 'Importe de renta', type: 'number', placeholder: 'Ej: 8500', pdfField: 'IMPORTE' },
        ]
      },
      {
        titulo: 'Datos del Arrendador',
        icono: '&#128100;',
        campos: [
          { name: 'nombreArrendador', label: 'Nombre completo', type: 'text', required: true, pdfField: 'NOMBRE_ARRENDADOR' },
          { name: 'telefonoArrendador', label: 'Teléfono', type: 'tel', required: true, pdfField: 'TELEFONO_ARRENDADOR' },
          { name: 'rfcArrendador', label: 'RFC', type: 'text', pdfField: 'RFC_ARRENDADOR' },
          { name: 'correoArrendador', label: 'Correo electrónico', type: 'email', pdfField: 'CORREO_ARRENDADOR' },
        ]
      }
    ]
  },

  'Generales Arrendatario Empresa': {
    nombre: 'Generales Arrendatario Empresa',
    secciones: [
      {
        titulo: 'Datos del Inmueble',
        icono: '&#127968;',
        campos: [
          { name: 'direccionInmueble', label: 'Dirección del inmueble', type: 'text', required: true, full: true, pdfField: 'DIRECCION' },
          { name: 'destinadoA', label: 'Destinado a', type: 'select', options: ['Habitacional', 'Comercial', 'Industrial'], pdfField: 'DESTINADO' },
          { name: 'importeRenta', label: 'Importe de renta', type: 'number', pdfField: 'IMPORTE' },
        ]
      },
      {
        titulo: 'Datos de la Empresa Arrendataria',
        icono: '&#127970;',
        campos: [
          { name: 'razonSocial', label: 'Razón social', type: 'text', required: true, pdfField: 'RAZON_SOCIAL' },
          { name: 'rfcEmpresa', label: 'RFC Empresa', type: 'text', required: true, pdfField: 'RFC_EMPRESA' },
          { name: 'representanteLegal', label: 'Representante legal', type: 'text', required: true, pdfField: 'REPRESENTANTE_LEGAL' },
          { name: 'telefonoEmpresa', label: 'Teléfono', type: 'tel', required: true, pdfField: 'TELEFONO_EMPRESA' },
          { name: 'correoEmpresa', label: 'Correo electrónico', type: 'email', pdfField: 'CORREO_EMPRESA' },
          { name: 'domicilioFiscal', label: 'Domicilio fiscal', type: 'text', full: true, pdfField: 'DOMICILIO_FISCAL' },
        ]
      }
    ]
  },

  'Generales Comprador': {
    nombre: 'Generales Comprador',
    secciones: [
      {
        titulo: 'Datos de la Propiedad',
        icono: '&#127968;',
        campos: [
          { name: 'direccionPropiedad', label: 'Dirección de la propiedad', type: 'text', required: true, full: true, pdfField: 'DIRECCION' },
          { name: 'tipoPropiedad', label: 'Tipo de propiedad', type: 'select', options: ['Casa', 'Departamento', 'Local', 'Terreno', 'Oficina'], pdfField: 'TIPO_PROPIEDAD' },
          { name: 'precioVenta', label: 'Precio de venta', type: 'number', required: true, pdfField: 'PRECIO_VENTA' },
        ]
      },
      {
        titulo: 'Datos del Comprador',
        icono: '&#128100;',
        campos: [
          { name: 'nombreComprador', label: 'Nombre completo', type: 'text', required: true, pdfField: 'NOMBRE_COMPRADOR' },
          { name: 'telefonoComprador', label: 'Teléfono', type: 'tel', required: true, pdfField: 'TELEFONO_COMPRADOR' },
          { name: 'rfcComprador', label: 'RFC', type: 'text', pdfField: 'RFC_COMPRADOR' },
          { name: 'correoComprador', label: 'Correo electrónico', type: 'email', pdfField: 'CORREO_COMPRADOR' },
          { name: 'ocupacionComprador', label: 'Ocupación', type: 'text', pdfField: 'OCUPACION_COMPRADOR' },
          { name: 'origenFondos', label: 'Origen de fondos', type: 'select', options: ['Ahorro', 'Crédito hipotecario', 'Venta de propiedad', 'Herencia', 'Otro'], pdfField: 'ORIGEN_FONDOS' },
        ]
      }
    ]
  },

  'Generales Vendedor 5%': {
    nombre: 'Generales Vendedor 5%',
    secciones: [
      {
        titulo: 'Datos de la Propiedad',
        icono: '&#127968;',
        campos: [
          { name: 'direccionPropiedad', label: 'Dirección de la propiedad', type: 'text', required: true, full: true, pdfField: 'DIRECCION' },
          { name: 'tipoPropiedad', label: 'Tipo de propiedad', type: 'select', options: ['Casa', 'Departamento', 'Local', 'Terreno', 'Oficina'], pdfField: 'TIPO_PROPIEDAD' },
          { name: 'precioVenta', label: 'Precio de venta', type: 'number', required: true, pdfField: 'PRECIO_VENTA' },
          { name: 'comision', label: 'Comisión (%)', type: 'text', value: '5', pdfField: 'COMISION' },
        ]
      },
      {
        titulo: 'Datos del Vendedor',
        icono: '&#128100;',
        campos: [
          { name: 'nombreVendedor', label: 'Nombre completo', type: 'text', required: true, pdfField: 'NOMBRE_VENDEDOR' },
          { name: 'telefonoVendedor', label: 'Teléfono', type: 'tel', required: true, pdfField: 'TELEFONO_VENDEDOR' },
          { name: 'rfcVendedor', label: 'RFC', type: 'text', pdfField: 'RFC_VENDEDOR' },
          { name: 'correoVendedor', label: 'Correo electrónico', type: 'email', pdfField: 'CORREO_VENDEDOR' },
        ]
      }
    ]
  },

  'Generales Vendedor 6%': {
    nombre: 'Generales Vendedor 6%',
    secciones: [
      {
        titulo: 'Datos de la Propiedad',
        icono: '&#127968;',
        campos: [
          { name: 'direccionPropiedad', label: 'Dirección de la propiedad', type: 'text', required: true, full: true, pdfField: 'DIRECCION' },
          { name: 'tipoPropiedad', label: 'Tipo de propiedad', type: 'select', options: ['Casa', 'Departamento', 'Local', 'Terreno', 'Oficina'], pdfField: 'TIPO_PROPIEDAD' },
          { name: 'precioVenta', label: 'Precio de venta', type: 'number', required: true, pdfField: 'PRECIO_VENTA' },
          { name: 'comision', label: 'Comisión (%)', type: 'text', value: '6', pdfField: 'COMISION' },
        ]
      },
      {
        titulo: 'Datos del Vendedor',
        icono: '&#128100;',
        campos: [
          { name: 'nombreVendedor', label: 'Nombre completo', type: 'text', required: true, pdfField: 'NOMBRE_VENDEDOR' },
          { name: 'telefonoVendedor', label: 'Teléfono', type: 'tel', required: true, pdfField: 'TELEFONO_VENDEDOR' },
          { name: 'rfcVendedor', label: 'RFC', type: 'text', pdfField: 'RFC_VENDEDOR' },
          { name: 'correoVendedor', label: 'Correo electrónico', type: 'email', pdfField: 'CORREO_VENDEDOR' },
        ]
      }
    ]
  },

  'Generales Compra Localizada': {
    nombre: 'Generales Compra Localizada',
    secciones: [
      {
        titulo: 'Datos de la Propiedad',
        icono: '&#127968;',
        campos: [
          { name: 'direccionPropiedad', label: 'Dirección de la propiedad', type: 'text', required: true, full: true, pdfField: 'DIRECCION' },
          { name: 'tipoPropiedad', label: 'Tipo de propiedad', type: 'select', options: ['Casa', 'Departamento', 'Local', 'Terreno', 'Oficina'], pdfField: 'TIPO_PROPIEDAD' },
          { name: 'precioSugerido', label: 'Precio sugerido', type: 'number', pdfField: 'PRECIO_SUGERIDO' },
        ]
      },
      {
        titulo: 'Datos del Comprador',
        icono: '&#128100;',
        campos: [
          { name: 'nombreComprador', label: 'Nombre completo', type: 'text', required: true, pdfField: 'NOMBRE_COMPRADOR' },
          { name: 'telefonoComprador', label: 'Teléfono', type: 'tel', required: true, pdfField: 'TELEFONO_COMPRADOR' },
          { name: 'presupuesto', label: 'Presupuesto máximo', type: 'number', pdfField: 'PRESUPUESTO' },
          { name: 'necesidades', label: 'Necesidades específicas', type: 'textarea', full: true, pdfField: 'NECESIDADES' },
        ]
      }
    ]
  },

  'Oferta de Compraventa': {
    nombre: 'Oferta de Compraventa',
    secciones: [
      {
        titulo: 'Datos de la Propiedad',
        icono: '&#127968;',
        campos: [
          { name: 'direccionPropiedad', label: 'Dirección', type: 'text', required: true, full: true, pdfField: 'DIRECCION' },
          { name: 'precioVenta', label: 'Precio de venta', type: 'number', required: true, pdfField: 'PRECIO_VENTA' },
          { name: 'enganche', label: 'Enganche', type: 'number', pdfField: 'ENGANCHE' },
          { name: 'formaPago', label: 'Forma de pago', type: 'select', options: ['Contado', 'Crédito', 'Mixto'], pdfField: 'FORMA_PAGO' },
        ]
      },
      {
        titulo: 'Datos del Comprador',
        icono: '&#128100;',
        campos: [
          { name: 'nombreComprador', label: 'Nombre completo', type: 'text', required: true, pdfField: 'NOMBRE_COMPRADOR' },
          { name: 'telefonoComprador', label: 'Teléfono', type: 'tel', required: true, pdfField: 'TELEFONO_COMPRADOR' },
        ]
      },
      {
        titulo: 'Datos del Vendedor',
        icono: '&#128100;',
        campos: [
          { name: 'nombreVendedor', label: 'Nombre completo', type: 'text', required: true, pdfField: 'NOMBRE_VENDEDOR' },
          { name: 'telefonoVendedor', label: 'Teléfono', type: 'tel', required: true, pdfField: 'TELEFONO_VENDEDOR' },
        ]
      }
    ]
  },

  'Carta entrega Inmueble Tradicional': {
    nombre: 'Carta Entrega Inmueble Tradicional',
    secciones: [
      {
        titulo: 'Datos del Inmueble',
        icono: '&#127968;',
        campos: [
          { name: 'direccionInmueble', label: 'Dirección del inmueble', type: 'text', required: true, full: true, pdfField: 'DIRECCION' },
          { name: 'fechaEntrega', label: 'Fecha de entrega', type: 'date', required: true, pdfField: 'FECHA_ENTREGA' },
        ]
      },
      {
        titulo: 'Datos del Arrendatario',
        icono: '&#128100;',
        campos: [
          { name: 'nombreArrendatario', label: 'Nombre completo', type: 'text', required: true, pdfField: 'NOMBRE_ARRENDATARIO' },
          { name: 'telefonoArrendatario', label: 'Teléfono', type: 'tel', pdfField: 'TELEFONO_ARRENDATARIO' },
        ]
      },
      {
        titulo: 'Detalles de Entrega',
        icono: '&#128203;',
        campos: [
          { name: 'observaciones', label: 'Observaciones', type: 'textarea', full: true, pdfField: 'OBSERVACIONES' },
        ]
      }
    ]
  },

  'Carta entrega Inmueble Anticipada con garantia': {
    nombre: 'Carta Entrega Anticipada con Garantía',
    secciones: [
      {
        titulo: 'Datos del Inmueble',
        icono: '&#127968;',
        campos: [
          { name: 'direccionInmueble', label: 'Dirección del inmueble', type: 'text', required: true, full: true, pdfField: 'DIRECCION' },
          { name: 'fechaEntrega', label: 'Fecha de entrega', type: 'date', required: true, pdfField: 'FECHA_ENTREGA' },
          { name: 'montoGarantia', label: 'Monto de garantía', type: 'number', required: true, pdfField: 'MONTO_GARANTIA' },
        ]
      },
      {
        titulo: 'Datos del Arrendatario',
        icono: '&#128100;',
        campos: [
          { name: 'nombreArrendatario', label: 'Nombre completo', type: 'text', required: true, pdfField: 'NOMBRE_ARRENDATARIO' },
          { name: 'telefonoArrendatario', label: 'Teléfono', type: 'tel', pdfField: 'TELEFONO_ARRENDATARIO' },
        ]
      }
    ]
  },

  'Carta entrega Inmueble Anticipada sin garantia': {
    nombre: 'Carta Entrega Anticipada sin Garantía',
    secciones: [
      {
        titulo: 'Datos del Inmueble',
        icono: '&#127968;',
        campos: [
          { name: 'direccionInmueble', label: 'Dirección del inmueble', type: 'text', required: true, full: true, pdfField: 'DIRECCION' },
          { name: 'fechaEntrega', label: 'Fecha de entrega', type: 'date', required: true, pdfField: 'FECHA_ENTREGA' },
        ]
      },
      {
        titulo: 'Datos del Arrendatario',
        icono: '&#128100;',
        campos: [
          { name: 'nombreArrendatario', label: 'Nombre completo', type: 'text', required: true, pdfField: 'NOMBRE_ARRENDATARIO' },
          { name: 'telefonoArrendatario', label: 'Teléfono', type: 'tel', pdfField: 'TELEFONO_ARRENDATARIO' },
        ]
      }
    ]
  },

  'CARTA SIN RESPONSABILIDAD': {
    nombre: 'Carta sin Responsabilidad',
    secciones: [
      {
        titulo: 'Datos de la Carta',
        icono: '&#128221;',
        campos: [
          { name: 'nombreInteresado', label: 'Nombre del interesado', type: 'text', required: true, pdfField: 'NOMBRE_INTERESADO' },
          { name: 'motivo', label: 'Motivo', type: 'textarea', required: true, full: true, pdfField: 'MOTIVO' },
          { name: 'fecha', label: 'Fecha', type: 'date', required: true, pdfField: 'FECHA' },
        ]
      }
    ]
  },

  'Contato Prestación de Servicios Captación Venta 5%': {
    nombre: 'Contrato Prestación Servicios Venta 5%',
    secciones: [
      {
        titulo: 'Datos de la Propiedad',
        icono: '&#127968;',
        campos: [
          { name: 'direccionPropiedad', label: 'Dirección de la propiedad', type: 'text', required: true, full: true, pdfField: 'DIRECCION' },
          { name: 'tipoPropiedad', label: 'Tipo de propiedad', type: 'select', options: ['Casa', 'Departamento', 'Local', 'Terreno', 'Oficina'], pdfField: 'TIPO_PROPIEDAD' },
          { name: 'precioVenta', label: 'Precio de venta', type: 'number', required: true, pdfField: 'PRECIO_VENTA' },
          { name: 'comision', label: 'Comisión (%)', type: 'text', value: '5', pdfField: 'COMISION' },
        ]
      },
      {
        titulo: 'Datos del Cliente',
        icono: '&#128100;',
        campos: [
          { name: 'nombreCliente', label: 'Nombre completo', type: 'text', required: true, pdfField: 'NOMBRE_CLIENTE' },
          { name: 'telefonoCliente', label: 'Teléfono', type: 'tel', required: true, pdfField: 'TELEFONO_CLIENTE' },
          { name: 'rfcCliente', label: 'RFC', type: 'text', pdfField: 'RFC_CLIENTE' },
          { name: 'correoCliente', label: 'Correo electrónico', type: 'email', pdfField: 'CORREO_CLIENTE' },
        ]
      }
    ]
  },

  'Contato Prestación de Servicios Captación Venta 6%': {
    nombre: 'Contrato Prestación Servicios Venta 6%',
    secciones: [
      {
        titulo: 'Datos de la Propiedad',
        icono: '&#127968;',
        campos: [
          { name: 'direccionPropiedad', label: 'Dirección de la propiedad', type: 'text', required: true, full: true, pdfField: 'DIRECCION' },
          { name: 'tipoPropiedad', label: 'Tipo de propiedad', type: 'select', options: ['Casa', 'Departamento', 'Local', 'Terreno', 'Oficina'], pdfField: 'TIPO_PROPIEDAD' },
          { name: 'precioVenta', label: 'Precio de venta', type: 'number', required: true, pdfField: 'PRECIO_VENTA' },
          { name: 'comision', label: 'Comisión (%)', type: 'text', value: '6', pdfField: 'COMISION' },
        ]
      },
      {
        titulo: 'Datos del Cliente',
        icono: '&#128100;',
        campos: [
          { name: 'nombreCliente', label: 'Nombre completo', type: 'text', required: true, pdfField: 'NOMBRE_CLIENTE' },
          { name: 'telefonoCliente', label: 'Teléfono', type: 'tel', required: true, pdfField: 'TELEFONO_CLIENTE' },
          { name: 'rfcCliente', label: 'RFC', type: 'text', pdfField: 'RFC_CLIENTE' },
          { name: 'correoCliente', label: 'Correo electrónico', type: 'email', pdfField: 'CORREO_CLIENTE' },
        ]
      }
    ]
  },

  'Contrato de prestación de servicios, captación Renta': {
    nombre: 'Contrato Prestación Servicios Renta',
    secciones: [
      {
        titulo: 'Datos del Inmueble',
        icono: '&#127968;',
        campos: [
          { name: 'direccionInmueble', label: 'Dirección del inmueble', type: 'text', required: true, full: true, pdfField: 'DIRECCION' },
          { name: 'tipoInmueble', label: 'Tipo de inmueble', type: 'select', options: ['Casa', 'Departamento', 'Local', 'Oficina'], pdfField: 'TIPO_INMUEBLE' },
          { name: 'rentaMensual', label: 'Renta mensual', type: 'number', required: true, pdfField: 'RENTA_MENSUAL' },
          { name: 'comision', label: 'Comisión', type: 'text', pdfField: 'COMISION' },
        ]
      },
      {
        titulo: 'Datos del Propietario',
        icono: '&#128100;',
        campos: [
          { name: 'nombrePropietario', label: 'Nombre completo', type: 'text', required: true, pdfField: 'NOMBRE_PROPIETARIO' },
          { name: 'telefonoPropietario', label: 'Teléfono', type: 'tel', required: true, pdfField: 'TELEFONO_PROPIETARIO' },
          { name: 'rfcPropietario', label: 'RFC', type: 'text', pdfField: 'RFC_PROPIETARIO' },
        ]
      }
    ]
  },
};

/**
 * Lista las plantillas disponibles.
 * GET /api/formatos/plantillas
 */
const listarPlantillas = async (req, res) => {
  try {
    if (!fs.existsSync(PLANTILLAS_DIR)) {
      return res.json({ success: true, plantillas: [] });
    }

    const files = fs.readdirSync(PLANTILLAS_DIR).filter(f => f.endsWith('.pdf'));
    const plantillas = files.map((file) => {
      const nombre = norm(file.replace('.pdf', ''));
      const config = PLANTILLAS_CONFIG[nombre];
      return {
        id: nombre,
        nombre: config ? config.nombre : nombre,
        archivo: file,
        tieneFormulario: Boolean(config),
      };
    });

    res.json({ success: true, plantillas });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al listar plantillas' });
  }
};

/**
 * Obtiene los campos de una plantilla específica.
 * GET /api/formatos/plantillas/:id/campos
 */
const obtenerCamposPlantilla = async (req, res) => {
  try {
    const { id } = req.params;
    const config = PLANTILLAS_CONFIG[norm(id)];

    if (!config) {
      return res.status(404).json({ success: false, message: 'Plantilla no encontrada o sin formulario configurado' });
    }

    res.json({ success: true, plantilla: config });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener campos de la plantilla' });
  }
};

/**
 * Genera PDF sobreponiendo los datos sobre la plantilla original.
 *
 * Las plantillas NO tienen campos AcroForm editables, por lo que se imprime
 * cada página original como fondo y se dibujan los valores encima usando el
 * mapa de posiciones (backend/src/config/formatoPosiciones.js). Los campos
 * sin posición definida se dibujan en una caja automática legible para que el
 * PDF siempre sea útil.
 * POST /api/formatos/generar/:plantillaId
 */
const generarPDF = async (req, res) => {
  try {
    const plantillaId = norm(req.params.plantillaId);
    const config = PLANTILLAS_CONFIG[plantillaId];

    if (!config) {
      return res.status(404).json({ success: false, message: 'Plantilla no encontrada' });
    }

    const plantillaPath = findPlantillaFile(plantillaId);

    if (!plantillaPath || !fs.existsSync(plantillaPath)) {
      return res.status(404).json({ success: false, message: 'Archivo de plantilla no encontrado' });
    }

    // Datos recibidos del formulario (name de cada campo -> valor).
    const values = req.body || {};
    // lista de campos con valor, para relleno automático (label + pdfField).
    const rows = [];
    for (const seccion of config.secciones) {
      for (const campo of seccion.campos) {
        const val = values[campo.name];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          rows.push({ pdfField: campo.pdfField, label: campo.label, value: String(val) });
        }
      }
    }

    const originalBytes = fs.readFileSync(plantillaPath);
    const original = await PDFDocument.load(originalBytes);
    const output = await PDFDocument.create();
    const helvetica = await output.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await output.embedFont(StandardFonts.HelveticaBold);
    const posiciones = POSICIONES[plantillaId] || {};

    const positioned = rows.filter((r) => posiciones[r.pdfField]);
    const automatic = rows.filter((r) => !posiciones[r.pdfField]);

    // 1) Copiar cada página de la plantilla como fondo.
    const pageCount = original.getPageCount();
    const copiedPages = await output.copyPages(original, Array.from({ length: pageCount }, (_, i) => i));
    copiedPages.forEach((copied, idx) => {
      output.addPage(copied);
      const w = copied.getWidth();
      const h = copied.getHeight();

      // 2) Valores con posición exacta definida sobre la plantilla.
      for (const row of positioned) {
        const pos = posiciones[row.pdfField];
        if (pos.page !== undefined && pos.page !== idx) continue;
        const size = pos.size || 10;
        const x = (pos.x !== undefined ? pos.x : DEFAULT_LAYOUT.marginX) * w;
        const yTop = pos.y !== undefined ? pos.y : DEFAULT_LAYOUT.startY;
        const y = h - yTop * h - size;
        const align = pos.align || 'left';
        const width = helvetica.widthOfTextAtSize(row.value, size) + 4;
        let tx = x;
        if (align === 'center') tx = x - width / 2;
        else if (align === 'right') tx = x - width;
        copied.drawRectangle({
          x: tx,
          y: y - 2,
          width,
          height: size + 4,
          color: rgb(1, 1, 1),
          opacity: DEFAULT_LAYOUT.fillOpacity,
        });
        copied.drawText(row.value, {
          x: tx + 2,
          y,
          size,
          font: helvetica,
          color: rgb(0.08, 0.05, 0.15),
        });
      }

      // 3) Relleno automático: caja blanca legible con «Etiqueta: valor».
      //    Se dibuja en la última página para no tapar el contenido inicial.
      if (idx === pageCount - 1 && automatic.length) {
        drawAutoBox(copied, automatic, helvetica, helveticaBold, w, h);
      }
    });

    // 4) Firma digital: si el formulario incluyó la firma dibujada (PNG en
    //    base64), se incrusta sobre el área inferior de la última página.
    const firmaDataUrl = typeof values.firma === 'string' && values.firma.startsWith('data:image/png;base64,')
      ? values.firma.slice('data:image/png;base64,'.length)
      : null;
    if (firmaDataUrl && pageCount) {
      try {
        const png = await output.embedPng(Buffer.from(firmaDataUrl, 'base64'));
        const last = copiedPages[pageCount - 1];
        const w = last.getWidth();
        const h = last.getHeight();
        const ratio = png.width / png.height || 3;
        const boxH = 44;
        const boxW = Math.min(200, boxH * ratio, w * 0.5);
        const x = w * 0.08;
        const y = 44;
        last.drawRectangle({
          x: x - 4,
          y: y - 4,
          width: boxW + 8,
          height: boxH + 20,
          color: rgb(1, 1, 1),
          borderColor: rgb(0.4, 0.35, 0.5),
          borderWidth: 0.8,
        });
        last.drawImage(png, { x, y, width: boxW, height: boxH });
        last.drawText('Firma digital', {
          x,
          y: y + boxH + 8,
          size: 8,
          font: helvetica,
          color: rgb(0.42, 0.42, 0.5),
        });
      } catch (firmaError) {
        console.warn('[Formatos] No se pudo incrustar la firma en el PDF:', firmaError.message);
      }
    }

    const modifiedPdfBytes = await output.save();
    const safeNombre = String(config.nombre || 'formato').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'formato';
    const fileName = `${safeNombre}_${Date.now()}.pdf`;

    // Guardar el archivo generado en el almacenamiento (/uploads) y registrar el
    // formato en la BD para tener un historial (usuario, plantilla, datos, fecha,
    // ruta). Si R2 está configurado el PDF se sube al bucket; si no, queda en
    // disco local.
    let fileUrl = null;
    try {
      // Se sube directamente el buffer al almacenamiento persistente (GridFS/R2)
      // SIN escribir nada en el disco del servidor (backend/uploads es efímero).
      await require('../services/storage.service').putBuffer(fileName, Buffer.from(modifiedPdfBytes), 'application/pdf');
      fileUrl = `/uploads/${fileName}`;

      await Document.create({
        name: config.nombre || plantillaId,
        type: 'formato',
        date: new Date(),
        uploadedBy: req.user ? req.user._id : null,
        fileName,
        fileUrl,
        status: 'pendiente',
        observations: `Formato generado: ${plantillaId}`,
        templateFields: [],
        filledData: req.body || {},
        filledBy: req.user ? req.user._id : null,
        filledAt: new Date(),
      });
    } catch (saveError) {
      // La descarga del PDF no debe fallar aunque el guardado falle; solo se
      // registra la advertencia.
      console.warn('[Formatos] No se pudo persistir el PDF generado:', saveError.message);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(Buffer.from(modifiedPdfBytes));
  } catch (error) {
    console.error('Error al generar PDF:', error);
    logger.error('Falla al generar PDF', { plantilla: req.params.plantillaId, reason: error.message }, 'pdf');
    res.status(500).json({ success: false, message: 'Error al generar el PDF', error: error.message });
  }
};

// Dibuja la caja automática «Etiqueta: valor» sobre la página destino.
function drawAutoBox(page, rows, font, fontBold, width, height) {
  const { marginX, startY, rowHeight, fontSize, fillOpacity } = DEFAULT_LAYOUT;
  const boxWidth = width * (1 - marginX * 2);
  const boxHeight = rows.length * rowHeight + 18;
  const x = width * marginX;
  const yTop = startY * height;
  const y = height - yTop - boxHeight;

  page.drawRectangle({
    x,
    y,
    width: boxWidth,
    height: boxHeight,
    color: rgb(0.98, 0.97, 1),
    opacity: fillOpacity,
    borderColor: rgb(0.35, 0.29, 0.5),
    borderWidth: 1,
  });
  page.drawText('DATOS DEL FORMATO', {
    x: x + 8,
    y: y + boxHeight - 14,
    size: 10,
    font: fontBold,
    color: rgb(0.32, 0.15, 0.55),
  });

  rows.forEach((row, i) => {
    const ry = y + boxHeight - (i + 1) * rowHeight - 20;
    const label = `${row.label}:`;
    page.drawText(label, {
      x: x + 8,
      y: ry,
      size: fontSize,
      font: fontBold,
      color: rgb(0.15, 0.12, 0.25),
    });
    const labelWidth = font.widthOfTextAtSize(label, fontSize);
    page.drawText(row.value, {
      x: x + 8 + labelWidth + 6,
      y: ry,
      size: fontSize,
      font,
      color: rgb(0.08, 0.05, 0.15),
    });
  });
}

/**
 * Descarga el PDF original de una plantilla (en blanco).
 * GET /api/formatos/plantillas/:id/descargar
 */
const descargarPlantilla = async (req, res) => {
  try {
    const { id } = req.params;
    const config = PLANTILLAS_CONFIG[norm(id)];

    if (!config) {
      return res.status(404).json({ success: false, message: 'Plantilla no encontrada' });
    }

    const plantillaPath = findPlantillaFile(id);

    if (!plantillaPath || !fs.existsSync(plantillaPath)) {
      return res.status(404).json({ success: false, message: 'Archivo de plantilla no encontrado' });
    }

    const fileName = `${config.nombre.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.sendFile(plantillaPath);
  } catch (error) {
    console.error('Error al descargar plantilla:', error);
    res.status(500).json({ success: false, message: 'Error al descargar la plantilla' });
  }
};

module.exports = {
  listarPlantillas,
  obtenerCamposPlantilla,
  generarPDF,
  descargarPlantilla,
};
