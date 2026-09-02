'use strict';

/*
 * Sonidos del sistema (Web Audio API).
 *
 * Genera tonos sutiles de forma programática (sin archivos externos) para
 * notificaciones, avisos del equipo, sonido de bienvenida al iniciar sesión y
 * vista previa. Se respeta la preferencia del usuario guardada en
 * localStorage ('crm_sounds_enabled', activa por defecto).
 */
window.Sounds = (() => {
  const KEY = 'crm_sounds_enabled';
  let ctx = null;

  function enabled() {
    try {
      return localStorage.getItem(KEY) !== '0';
    } catch (error) {
      return true;
    }
  }

  function setEnabled(on) {
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (error) {}
  }

  // Contexto de audio perezoso: se crea dentro de un gesto del usuario para
  // cumplir con la política de autoplay de los navegadores.
  function ensureCtx() {
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      ctx = new Ctx();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  // Toca una secuencia de notas; cada nota: { t: inicio, f: frecuencia, d: duración, v: volumen }.
  function playSequence(notes) {
    if (!enabled()) return;
    const audio = ensureCtx();
    if (!audio) return;
    const now = audio.currentTime;
    const master = audio.createGain();
    master.gain.value = 0.5;
    master.connect(audio.destination);
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
    });
  }

  // Sonido corto y neutro para una notificación individual.
  function notification() {
    playSequence([
      { t: 0, f: 660, d: 0.12, v: 0.3, type: 'sine' },
      { t: 0.12, f: 880, d: 0.18, v: 0.3, type: 'sine' },
    ]);
  }

  // Tono más notorio y/o grave para un aviso urgente / importante del equipo.
  function announcement() {
    playSequence([
      { t: 0, f: 520, d: 0.16, v: 0.35, type: 'triangle' },
      { t: 0.18, f: 660, d: 0.16, v: 0.35, type: 'triangle' },
      { t: 0.36, f: 780, d: 0.24, v: 0.35, type: 'triangle' },
    ]);
  }

  // Arpegio de bienvenida, alegre, al iniciar sesión o entrar al sistema.
  function welcome() {
    playSequence([
      { t: 0, f: 523.25, d: 0.18, v: 0.3, type: 'sine' },
      { t: 0.16, f: 659.25, d: 0.18, v: 0.3, type: 'sine' },
      { t: 0.32, f: 783.99, d: 0.18, v: 0.3, type: 'sine' },
      { t: 0.48, f: 1046.5, d: 0.4, v: 0.32, type: 'sine' },
    ]);
  }

  // Vista previa según el tipo, para el conmutador de Configuración.
  function preview(kind) {
    const map = { notification, announcement, welcome };
    const fn = map[kind] || notification;
    fn();
  }

  function init() {
    // Primer gesto (clic/cualquier tecla) para desbloquear el contexto de audio.
    const unlock = () => { ensureCtx(); };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
  }

  return { enabled, setEnabled, notification, announcement, welcome, preview, init };
})();
