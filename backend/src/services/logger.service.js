'use strict';

// Logger en memoria con buffer circular para el visor de logs en tiempo real
// del panel de soporte técnico. Cada entrada conserva el nivel (ERROR, WARN,
// INFO), un mensaje, datos opcionales y la marca de tiempo. Cuando hay un
// servidor de Socket.io registrado se emite 'server-log' para que el panel se
// actualice al instante sin recargar.
//
// Nota: el buffer vive en memoria del proceso; se reinicia con cada arranque
// del servidor. Para persistencia a largo plazo se usa el ActivityLog.

const LEVELS = ['INFO', 'WARN', 'ERROR'];

function makeEntry(level, message, data = null, source = '') {
  return {
    id: Buffer.from(
      `${Date.now()}-${Math.random().toString(16).slice(2)}`
    ).toString('hex'),
    level,
    message: String(message || ''),
    data: data == null ? null : data,
    source: String(source || ''),
    timestamp: new Date().toISOString(),
  };
}

class RealtimeLogger {
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.buffer = [];
    this.io = null;
  }

  // Registra el servidor de Socket.io para que cada entrada nueva se transmita.
  setIo(io) {
    this.io = io;
  }

  _push(level, message, data, source) {
    const entry = makeEntry(level, message, data, source);
    this.buffer.push(entry);
    if (this.buffer.length > this.maxSize) {
      this.buffer.splice(0, this.buffer.length - this.maxSize);
    }
    if (this.io && typeof this.io.emit === 'function') {
      try { this.io.emit('server-log', entry); } catch (e) { /* silencioso */ }
    }
    return entry;
  }

  info(message, data, source) { return this._push('INFO', message, data, source); }
  warn(message, data, source) { return this._push('WARN', message, data, source); }
  error(message, data, source) { return this._push('ERROR', message, data, source); }

  // Devuelve las últimas `limit` entradas opcionalmente filtradas por nivel.
  getLogs({ limit = 100, level = null } = {}) {
    const max = Math.min(parseInt(limit, 10) || 100, 500);
    const levelNorm = String(level || '').toUpperCase();
    let filtered = this.buffer;
    if (LEVELS.includes(levelNorm)) {
      filtered = this.buffer.filter((l) => l.level === levelNorm);
    }
    return filtered.slice(-max).reverse();
  }

  clear() {
    const count = this.buffer.length;
    this.buffer = [];
    return count;
  }
}

module.exports = new RealtimeLogger();
module.exports.LEVELS = LEVELS;
