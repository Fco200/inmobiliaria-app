'use strict';

const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const { Document } = require('../models');

const PLANTILLAS_DIR = path.join(__dirname, '../../../plantillas');
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

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
      const nombre = file.replace('.pdf', '');
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
    const config = PLANTILLAS_CONFIG[id];

    if (!config) {
      return res.status(404).json({ success: false, message: 'Plantilla no encontrada o sin formulario configurado' });
    }

    res.json({ success: true, plantilla: config });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener campos de la plantilla' });
  }
};

/**
 * Genera PDF rellenando una plantilla.
 * POST /api/formatos/generar/:plantillaId
 */
const generarPDF = async (req, res) => {
  try {
    const { plantillaId } = req.params;
    const config = PLANTILLAS_CONFIG[plantillaId];

    if (!config) {
      return res.status(404).json({ success: false, message: 'Plantilla no encontrada' });
    }

    const plantillaPath = path.join(PLANTILLAS_DIR, `${plantillaId}.pdf`);

    if (!fs.existsSync(plantillaPath)) {
      return res.status(404).json({ success: false, message: 'Archivo de plantilla no encontrado' });
    }

    const pdfBytes = fs.readFileSync(plantillaPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    // Crear mapa de campos PDF a valores
    const pdfFieldMap = {};
    for (const seccion of config.secciones) {
      for (const campo of seccion.campos) {
        if (campo.pdfField && req.body[campo.name] !== undefined) {
          pdfFieldMap[campo.pdfField] = req.body[campo.name];
        }
      }
    }

    // Rellenar campos del PDF
    for (const field of fields) {
      const name = field.getName();
      const value = pdfFieldMap[name];

      if (value !== undefined && value !== null && value !== '') {
        try {
          if (field.constructor.name === 'PDFTextField') {
            field.setText(String(value));
          } else if (field.constructor.name === 'PDFCheckBox') {
            if (value === 'Si' || value === 'true' || value === '1') {
              field.check();
            } else {
              field.uncheck();
            }
          } else if (field.constructor.name === 'PDFDropdown') {
            field.select(String(value));
          }
        } catch (e) {
          console.warn(`No se pudo llenar campo "${name}":`, e.message);
        }
      }
    }

    const modifiedPdfBytes = await pdfDoc.save();
    const safeNombre = String(config.nombre || 'formato').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'formato';
    const fileName = `${safeNombre}_${Date.now()}.pdf`;

    // Guardar el archivo generado en uploads y registrar el formato en la BD
    // para tener un historial (usuario, plantilla, datos, fecha, ruta).
    let fileUrl = null;
    try {
      if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      const diskPath = path.join(UPLOADS_DIR, fileName);
      fs.writeFileSync(diskPath, Buffer.from(modifiedPdfBytes));
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
    res.status(500).json({ success: false, message: 'Error al generar el PDF', error: error.message });
  }
};

/**
 * Descarga el PDF original de una plantilla (en blanco).
 * GET /api/formatos/plantillas/:id/descargar
 */
const descargarPlantilla = async (req, res) => {
  try {
    const { id } = req.params;
    const config = PLANTILLAS_CONFIG[id];

    if (!config) {
      return res.status(404).json({ success: false, message: 'Plantilla no encontrada' });
    }

    const plantillaPath = path.join(PLANTILLAS_DIR, `${id}.pdf`);

    if (!fs.existsSync(plantillaPath)) {
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
