'use strict';

/**
 * Posiciones para "sobreponer" los valores de un formato sobre la plantilla
 * PDF original (que NO tiene campos AcroForm editables).
 *
 * Coordenadas FRACCIONALES (0 a 1) medidas desde la ESQUINA SUPERIOR IZQUIERDA
 * de la página, lo que permite escalarlas al tamaño real leído en runtime.
 *
 * Estructura:
 *   POSICIONES = {
 *     '<id de plantilla (nombre del archivo sin .pdf)>': {
 *       '<pdfField>: { page, x, y, size, align }
 *     }
 *   }
 *   - page : índice 0-based de la página de la plantilla donde se dibuja.
 *   - x,y  : posición fraccional (y = 0 arriba). Opcional.
 *   - size : tamaño de letra en puntos (opcional, default 10).
 *   - align: 'left' | 'center' | 'right' (opcional, default 'left').
 *
 * Si un campo NO tiene posición definida, el generador usa automáticamente
 * una tabla legible (caja blanca semitransparente con «Etiqueta: valor»)
 * dibujada sobre la plantilla, por lo que el PDF siempre es útil incluso con
 * el mapa vacío.
 *
 * Ajuste fino: abre la plantilla en un visor, mide la posición de cada línea
 * o espacio en blanco y anota la fracción (x/anchura, y/altura).
 */
const POSICIONES = {};

// Configuración del relleno automático (caja + filas «Etiqueta: valor»).
const DEFAULT_LAYOUT = {
  // Margen horizontal inicial (fracción del ancho de página).
  marginX: 0.08,
  // Altura inicial de la caja desde el tope de la página (fracción).
  startY: 0.12,
  // Separación entre filas (en puntos).
  rowHeight: 16,
  // Tamaño de letra de las filas.
  fontSize: 10,
  // Transparencia de la caja blanca (0 = invisible, 1 = opaca).
  fillOpacity: 0.88,
};

module.exports = { POSICIONES, DEFAULT_LAYOUT };