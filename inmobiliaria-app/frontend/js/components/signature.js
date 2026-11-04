// Firma digital dibujada con el dedo o el ratón.
// Expone SignaturePad.create({ canvas, lineColor, lineWidth }).
// Soporta Pointer Events (con captura) y fallback mouse/touch en navegadores
// antiguos. La imagen se guarda en PNG con fondo blanco y se escala con el
// devicePixelRatio para que no salga borrosa al imprimir.
window.SignaturePad = (() => {
  'use strict';

  const DEFAULT_COLOR = '#1f2937';
  const DEFAULT_WIDTH = 2.5;

  function create(options) {
    const canvas = options && options.canvas;
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    const ctx = canvas.getContext('2d');
    const lineColor = (options && options.lineColor) || DEFAULT_COLOR;
    const lineWidth = (options && options.lineWidth) || DEFAULT_WIDTH;

    let drawing = false;
    let hasInk = false;
    let W = 0;
    let H = 0;

    function setup() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = window.devicePixelRatio || 1;
      W = rect.width;
      H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;
      clear();
    }

    function clear() {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      hasInk = false;
    }

    function pointFrom(event) {
      const rect = canvas.getBoundingClientRect();
      const hasTouch = event.touches && event.touches.length;
      const clientX = event.clientX != null ? event.clientX : (hasTouch ? event.touches[0].clientX : 0);
      const clientY = event.clientY != null ? event.clientY : (hasTouch ? event.touches[0].clientY : 0);
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function start(event) {
      event.preventDefault();
      drawing = true;
      if (canvas.setPointerCapture && event.pointerId != null) {
        try { canvas.setPointerCapture(event.pointerId); } catch (error) {}
      }
      const p = pointFrom(event);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    }

    function move(event) {
      if (!drawing) return;
      event.preventDefault();
      const p = pointFrom(event);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      hasInk = true;
    }

    function end(event) {
      if (!drawing) return;
      drawing = false;
      if (canvas.releasePointerCapture && event.pointerId != null) {
        try { canvas.releasePointerCapture(event.pointerId); } catch (error) {}
      }
    }

    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'crosshair';
    setup();

    if (window.PointerEvent) {
      canvas.addEventListener('pointerdown', start);
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);
    } else {
      canvas.addEventListener('mousedown', start);
      canvas.addEventListener('mousemove', move);
      canvas.addEventListener('mouseup', end);
      canvas.addEventListener('mouseleave', end);
      canvas.addEventListener('touchstart', start, { passive: false });
      canvas.addEventListener('touchmove', move, { passive: false });
      canvas.addEventListener('touchend', end);
    }

    window.addEventListener('resize', () => {
      // Solo se re-dimensiona si no hay trazo aún, para no borrar la firma.
      if (!hasInk && !drawing) setup();
    });

    // Redimensiona la firma a un ancho máximo antes de codificarla en PNG.
    // La firma viaja en el cuerpo del POST (/formatos/generar) y se persiste en
    // la BD, así que conviene que el dataURL sea ligero aun en pantallas de
    // altísima densidad (devicePixelRatio alto). Mantiene la legibilidad.
    function exportDataURL() {
      const MAX_W = 400;
      let source = canvas;
      if (canvas.width > MAX_W) {
        const scale = MAX_W / canvas.width;
        const tw = Math.max(1, Math.round(canvas.width * scale));
        const th = Math.max(1, Math.round(canvas.height * scale));
        const out = document.createElement('canvas');
        out.width = tw;
        out.height = th;
        const octx = out.getContext('2d');
        octx.fillStyle = '#ffffff';
        octx.fillRect(0, 0, tw, th);
        octx.drawImage(canvas, 0, 0, tw, th);
        source = out;
      }
      return source.toDataURL('image/png');
    }

    return {
      clear,
      save: exportDataURL,
      isEmpty: () => !hasInk,
      canvas,
    };
  }

  return { create };
})();