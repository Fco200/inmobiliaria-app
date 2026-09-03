'use strict';

/*
 * Sonidos del sistema (Web Audio API).
 *
 * Genera tonos de forma programática (sin archivos externos) para
 * notificaciones, avisos del equipo, chat, confirmaciones y bienvenida.
 * Se respeta la preferencia del usuario en localStorage
 * ('crm_sounds_enabled', activa por defecto).
 *
 * TODOS los métodos que reproducen sonido devuelven una Promise que se
 * resuelve al terminar la secuencia. Se adjunta .catch() silencioso por
 * defecto para que errores de audio NUNCA detengan otros scripts.
 */
window.Sounds = (() => {
  const KEY = 'crm_sounds_enabled';
  let ctx = null;
  let unlocked = false;

  function enabled() {
    try {
      return localStorage.getItem(KEY) !== '0';
    } catch (_) {
      return true;
    }
  }

  function setEnabled(on) {
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) {}
  }

  // Crea o reanuda el AudioContext. Si el contexto está suspendido, intenta
  // reanudarlo (solo funciona dentro de un gesto del usuario).
  function ensureCtx() {
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      ctx = new Ctx();
    }
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => { unlocked = true; }).catch(() => {});
    } else {
      unlocked = true;
    }
    return ctx;
  }

  /**
   * Toca una secuencia de notas.
   * Cada nota: { t: inicio, f: frecuencia, d: duración, v: volumen, type: tipo }
   * Devuelve una Promise que se resuelve al terminar la última nota.
   * Silencia errores de audio con .catch() para no romper otros scripts.
   */
  function playSequence(notes) {
    if (!enabled()) return Promise.resolve();
    const audio = ensureCtx();
    if (!audio) return Promise.resolve();

    return new Promise((resolve) => {
      try {
        const now = audio.currentTime;
        const master = audio.createGain();
        master.gain.value = 0.5;
        master.connect(audio.destination);
        let lastEnd = 0;
        notes.forEach((n) => {
          const osc = audio.createOscillator();
          const gain = audio.createGain();
          osc.type = n.type || 'sine';
          osc.frequency.value = n.f;
          const start = now + (n.t || 0);
          const dur = n.d;
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(n.v || 0.3, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
          osc.connect(gain);
          gain.connect(master);
          osc.start(start);
          osc.stop(start + dur + 0.05);
          const end = start + dur + 0.05;
          if (end > lastEnd) lastEnd = end;
        });
        // Resolver cuando termina la última nota.
        setTimeout(resolve, Math.ceil((lastEnd - audio.currentTime) * 1000) + 50);
      } catch (_) {
        resolve();
      }
    }).catch(() => {});
  }

  // ---- Sonidos del sistema ----

  // Notificación individual (sutil, dos tonos ascendentes).
  function notification() {
    return playSequence([
      { t: 0, f: 660, d: 0.12, v: 0.3, type: 'sine' },
      { t: 0.12, f: 880, d: 0.18, v: 0.3, type: 'sine' },
    ]);
  }

  // Aviso del equipo / urgente (tres tonos en triangle, más notorio).
  function announcement() {
    return playSequence([
      { t: 0, f: 520, d: 0.16, v: 0.35, type: 'triangle' },
      { t: 0.18, f: 660, d: 0.16, v: 0.35, type: 'triangle' },
      { t: 0.36, f: 780, d: 0.24, v: 0.35, type: 'triangle' },
    ]);
  }

  // Arpegio de bienvenida (alegre, 4 notas ascendentes).
  function welcome() {
    return playSequence([
      { t: 0, f: 523.25, d: 0.18, v: 0.3, type: 'sine' },
      { t: 0.16, f: 659.25, d: 0.18, v: 0.3, type: 'sine' },
      { t: 0.32, f: 783.99, d: 0.18, v: 0.3, type: 'sine' },
      { t: 0.48, f: 1046.5, d: 0.4, v: 0.32, type: 'sine' },
    ]);
  }

  // Confirmación de acción (guardar, enviar, PDF generado, etc.).
  function confirmation() {
    return playSequence([
      { t: 0, f: 523, d: 0.1, v: 0.25, type: 'sine' },
      { t: 0.08, f: 659, d: 0.1, v: 0.25, type: 'sine' },
      { t: 0.18, f: 784, d: 0.2, v: 0.3, type: 'sine' },
    ]);
  }

  // Mensaje enviado en el chat (tono corto y rápido, descendente).
  function sendMessage() {
    return playSequence([
      { t: 0, f: 880, d: 0.06, v: 0.2, type: 'sine' },
      { t: 0.05, f: 660, d: 0.1, v: 0.2, type: 'sine' },
    ]);
  }

  // Mensaje recibido en el chat (tono suave, ascendente).
  function receiveMessage() {
    return playSequence([
      { t: 0, f: 440, d: 0.06, v: 0.2, type: 'sine' },
      { t: 0.05, f: 587, d: 0.1, v: 0.22, type: 'sine' },
    ]);
  }

  // Paso completado / tick de progreso (muy sutil, para guías y onboarding).
  function step() {
    return playSequence([
      { t: 0, f: 700, d: 0.06, v: 0.15, type: 'sine' },
    ]);
  }

  // Vista previa de un tipo de sonido (para Configuración).
  function preview(kind) {
    const map = { notification, announcement, welcome, confirmation, sendMessage, receiveMessage, step };
    const fn = map[kind] || notification;
    return fn();
  }

  /**
   * Desbloquea el AudioContext en el primer gesto del usuario (clic / tecla).
   * Debe llamarse temprano (en el login o al cargar el shell) para que los
   * primeros sonidos (bienvenida) se reproduzcan sin problemas.
   *
   * Se registran listeners permanentes (no {once: true}) porque la página
   * puede necesitar desbloquear el contexto en cualquier momento tras una
   * recarga o navegación.
   */
  function init() {
    if (unlocked && ctx && ctx.state === 'running') return;
    const unlock = () => { ensureCtx(); };
    document.addEventListener('pointerdown', unlock, { capture: true });
    document.addEventListener('keydown', unlock, { capture: true });
  }

  return {
    enabled,
    setEnabled,
    notification,
    announcement,
    welcome,
    confirmation,
    sendMessage,
    receiveMessage,
    step,
    preview,
    init,
  };
})();
