'use strict';

// Lógica de las páginas de guía (GUIA.HTML para administradores y
// GUIAUSUARIO.HTML para los demás usuarios): cambia entre la guía del
// administrador y la del usuario cuando ambas existen, copia el enlace y lo
// comparte por WhatsApp. Se mantiene en un archivo externo (no inline) porque
// la CSP del backend solo permite scripts servidos desde el propio dominio.
(function () {
  // El enlace que se copia/comparte es el de ESTA página (así el asesor
  // comparte la guía de usuario y el admin la guía completa).
  var pageFile = (function () {
    try {
      var name = window.location.pathname.split('/').pop();
      return name || 'GUIA.HTML';
    } catch (e) {
      return 'GUIA.HTML';
    }
  })();

  var guideUrl = (function () {
    try {
      return new URL(pageFile, window.location.href).href;
    } catch (e) {
      return pageFile;
    }
  })();

  document.querySelectorAll('#url-admin, #url-usuario').forEach(function (el) {
    el.textContent = guideUrl;
  });

  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  var panels = {
    admin: document.getElementById('guia-admin'),
    usuario: document.getElementById('guia-usuario'),
  };
  var available = Object.keys(panels).filter(function (k) { return !!panels[k]; });

  function show(name, push) {
    if (available.indexOf(name) === -1) name = available[0] || 'usuario';
    tabs.forEach(function (t) { t.classList.toggle('on', t.dataset.guide === name); });
    Object.keys(panels).forEach(function (k) {
      if (panels[k]) panels[k].hidden = k !== name;
    });
    document.title = (name === 'admin' ? 'Guía del Administrador' : 'Guía del Usuario') + ' · INMOBLES';
    if (push && window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '?g=' + name);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function () { show(t.dataset.guide, true); });
  });

  // Enlace directo: GUIA.HTML?g=usuario  (para compartir solo una guía).
  var params = new URLSearchParams(window.location.search);
  var initial = (params.get('g') || params.get('guia') || (available.indexOf('admin') !== -1 ? 'admin' : 'usuario')).toLowerCase();
  if (initial === 'usuarios' || initial === 'user') initial = 'usuario';
  show(initial, false);

  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  function copyLink() {
    var done = function () { toast('✓ Enlace copiado'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(guideUrl).then(done).catch(fallback);
    } else {
      fallback();
    }
    function fallback() {
      var input = document.createElement('textarea');
      input.value = guideUrl;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      try { document.execCommand('copy'); done(); }
      catch (e) { toast('Copia el enlace manualmente'); }
      document.body.removeChild(input);
    }
  }

  function shareWhatsapp() {
    var text = '📖 Guía de uso de INMOBLES:\n' + guideUrl;
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  }

  document.querySelectorAll('[data-copy]').forEach(function (b) { b.addEventListener('click', copyLink); });
  document.querySelectorAll('[data-wa]').forEach(function (b) { b.addEventListener('click', shareWhatsapp); });
})();
