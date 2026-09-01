'use strict';

/*
 * Pantalla de MANTENIMIENTO (mantenimiento.html).
 *
 * Muestra el mensaje y la fecha/hora estimada de fin enviados por el servidor
 * (o por la API pública de mantenimiento), y reintenta de forma automática /
 * pulsando el botón cuando el modo termine.
 *
 * Comportamiento según el estado:
 *   - Si sigue ACTIVO: muestra mensaje/fecha reales.
 *   - Si está en CUENTA REGRESIVA (aún no activo): reenvía al login, porque la
 *     plataforma aún está operativa.
 *   - Si terminó: reenvía al login.
 */
(function () {
  function setMensaje(msg) {
    var m1 = document.getElementById('mt-msg');
    var m2 = document.getElementById('mensajeMantenimiento');
    var text = (msg || '').trim();
    if (!text) {
      if (m1) m1.style.display = 'none';
      if (m2) m2.style.display = 'none';
      return;
    }
    if (m1) { m1.style.display = ''; m1.textContent = text; }
    if (m2) { m2.style.display = ''; m2.textContent = text; }
  }

  function setHasta(hasta) {
    var finEl = document.getElementById('mt-fin');
    var finTxt = document.getElementById('mt-fin-txt');
    if (!finEl || !finTxt) return;
    if (!hasta) { finEl.classList.remove('show'); return; }
    var d = new Date(hasta);
    if (!isNaN(d.getTime())) {
      finTxt.textContent = 'Volveremos el ' + d.toLocaleString('es-MX', {
        day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
      });
    } else {
      finTxt.textContent = 'Volveremos: ' + hasta;
    }
    finEl.classList.add('show');
  }

  // Estado inicial desde los parámetros URL (respaldo si la API no responde).
  function readParams() {
    var params = new URLSearchParams(window.location.search);
    var msg = params.get('m');
    if (msg && msg.trim()) setMensaje(msg);
    var hasta = params.get('hasta');
    if (hasta) setHasta(hasta);
  }

  function apiUrl() {
    return (window.AppConfig && window.AppConfig.API_URL)
      ? window.AppConfig.API_URL + '/config/mantenimiento'
      : '/api/config/mantenimiento';
  }

  function checkStatus() {
    // MANTENIMIENTO DESACTIVADO: la pantalla de mantenimiento ya no bloquea.
    // Esta página redirige siempre al login para que ningún usuario quede
    // atrapado, aunque la URL llegue cacheada o por enlaces antiguos.
    goLogin();
  }

  function goLogin() {
    window.location.replace('index.html');
  }

  function init() {
    var btnRetry = document.getElementById('btn-retry');
    if (btnRetry) btnRetry.addEventListener('click', function () {
      btnRetry.disabled = true;
      checkStatus();
      // Redirige de inmediato al login; si el mantenimiento sigue activo, el
      // propio index.html muestra de nuevo la capa de bloqueo.
      setTimeout(function () { window.location.replace('index.html'); }, 600);
    });

    // Respaldo tipográfico dorado si el logo (webp) no carga.
    var logoImg = document.getElementById('mt-logo-img');
    var logoText = document.getElementById('mt-logo-text');
    if (logoImg && logoText) {
      logoImg.addEventListener('error', function () {
        logoImg.style.display = 'none';
        logoText.style.display = 'inline-flex';
      });
    }

    readParams();
    checkStatus();
    // Comprobación automática cada 20 s del estado.
    setInterval(checkStatus, 20000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
