'use strict';

window.AppInstall = (() => {
  let deferredPrompt = null;
  let installed = false;

  // iPhone/iPad/iPod clásicos + iPadOS 13+ que se hace pasar por Mac con pantalla táctil.
  const isIOS =
    (/iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(navigator.userAgent);
  const isDesktop = !isIOS && !isAndroid;
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true;

  function visibleButtons(show) {
    document.querySelectorAll('[data-install]').forEach((btn) => {
      btn.classList.toggle('visible', show);
    });
  }

  // Botones "Descargar app" (siempre visibles). Se ocultan si ya está instalada.
  function hideDownloadButtons() {
    document.querySelectorAll('[data-download-app]').forEach((btn) => {
      btn.style.display = 'none';
    });
  }

  function showIosInstructions() {
    if (typeof UI === 'undefined') return;
    UI.openModal({
      title: 'Instalar la aplicación',
      body: `
        <ol style="margin:0;padding-left:20px;line-height:2;">
          <li>Abre esta página en <strong>Safari</strong>.</li>
          <li>Toca el botón <strong>Compartir</strong>
            <span style="display:inline-block;padding:1px 8px;border-radius:6px;background:#0a84ff;color:#fff;font-weight:700;">&#8599;</span>
            de la barra inferior.</li>
          <li>Desliza y elige <strong>"Añadir a pantalla de inicio"</strong>.</li>
          <li>Toca <strong>"Añadir"</strong>. El icono quedará junto a tus apps.</li>
        </ol>
        <p class="text-muted" style="margin-bottom:0;">La app se abrirá a pantalla completa, como una aplicación nativa.</p>
      `,
      footer: '<button class="btn btn-primary" type="button" data-ok>Entendido</button>',
      size: 460,
    });
    const okBtn = document.querySelector('#modal-overlay [data-ok]');
    if (okBtn) okBtn.addEventListener('click', () => UI.closeModal());
  }

  function showDesktopInstructions() {
    if (typeof UI === 'undefined') return;
    const ua = navigator.userAgent || '';
    let steps = '';
    if (/firefox/i.test(ua)) {
      steps = `
        <ol style="margin:0;padding-left:20px;line-height:2;">
          <li>Toca o haz clic en la barra de direcciones.</li>
          <li>Busca el icono de <strong>instalar</strong> o el icono de página.</li>
          <li>Elige <strong>"Instalar"</strong> / <strong>"Añadir a pantalla de inicio"</strong>.</li>
        </ol>`;
    } else {
      steps = `
        <ol style="margin:0;padding-left:20px;line-height:2;">
          <li>Abre el menú del navegador
            <span style="display:inline-block;padding:1px 9px;border-radius:6px;background:#334155;color:#fff;font-weight:700;">&#8942;</span>
            (arriba a la derecha).</li>
          <li>Busca <strong>"Instalar aplicación"</strong>,<br>
              <strong>"Añadir a pantalla de inicio"</strong> o<br>
              <strong>"Crear acceso directo"</strong>.</li>
          <li>Confirma con <strong>"Instalar"</strong>.<br>
              <small class="text-muted">En iPhone la opción vive en Compartir &#8599; del Safari.</small></li>
        </ol>`;
    }
    UI.openModal({
      title: 'Instalar la aplicación',
      body: `
        ${steps}
        <p class="text-muted" style="margin-bottom:0;">
          ${installed
            ? 'La aplicación ya está instalada en este dispositivo.'
            : 'Consejo: usa Google Chrome, Edge o Samsung Internet para la instalación directa con un clic.'}
        </p>
      `,
      footer: '<button class="btn btn-primary" type="button" data-ok>Entendido</button>',
      size: 460,
    });
    const okBtn = document.querySelector('#modal-overlay [data-ok]');
    if (okBtn) okBtn.addEventListener('click', () => UI.closeModal());
  }

  function showAndroidInstructions() {
    if (typeof UI === 'undefined') return;
    UI.openModal({
      title: 'Instalar la aplicación',
      body: `
        <ol style="margin:0;padding-left:20px;line-height:2;">
          <li>Abre esta página en <strong>Google Chrome</strong> o <strong>Samsung Internet</strong>.</li>
          <li>Toca el menú
            <span style="display:inline-block;padding:1px 9px;border-radius:6px;background:#334155;color:#fff;font-weight:700;">&#8942;</span></li>
          <li>Busca <strong>"Instalar aplicación"</strong> o <strong>"Agregar a pantalla de inicio"</strong>.</li>
          <li>Confirma: se instalará como una app de pantalla completa.</li>
        </ol>
        <p class="text-muted" style="margin-bottom:0;">
          ${installed
            ? 'La aplicación ya está instalada en este dispositivo.'
            : 'Si usas Samsung Internet, puedes pulsar el icono del menú y elegir "Agregar página a pantalla de inicio".'}
        </p>
      `,
      footer: '<button class="btn btn-primary" type="button" data-ok>Entendido</button>',
      size: 460,
    });
    const okBtn = document.querySelector('#modal-overlay [data-ok]');
    if (okBtn) okBtn.addEventListener('click', () => UI.closeModal());
  }

  function showManualHint() {
    if (typeof UI === 'undefined') return;
    if (isIOS || installed) {
      showIosInstructions();
      return;
    }
    if (isAndroid) {
      showAndroidInstructions();
      return;
    }
    showDesktopInstructions();
  }

  // Ejecuta el flujo correcto al pulsar el botón: instalación nativa (Android/
  // PC con Chrome/Edge) si el navegador la ofreció; si no, instrucciones según
  // la plataforma. En iOS nunca hay prompt nativo: siempre instrucciones.
  async function runInstallFlow() {
    if (isIOS) {
      showIosInstructions();
      return;
    }
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } catch (error) { /* el usuario cerró el diálogo */ }
      deferredPrompt = null;
      return;
    }
    showManualHint();
  }

  function init() {
    // App ya instalada → no mostrar botones de instalación.
    if (isStandalone || installed) {
      hideDownloadButtons();
      return;
    }

    // iOS: no existe beforeinstallprompt; el/los botones abren instrucciones.
    if (isIOS) {
      visibleButtons(true);
    }

    window.addEventListener('beforeinstallprompt', (event) => {
      deferredPrompt = event;
      visibleButtons(true);
      // IMPORTANTE: NO se llama event.preventDefault() a propósito.
      // Si se llama, Chrome suprime su barra de instalación automática y
      // muestra el error "Banner not shown: beforeinstallprompt preventDefault() called".
      // Así el botón propio ([data-install]) y la barra del navegador conviven.
    });

    window.addEventListener('appinstalled', () => {
      installed = true;
      deferredPrompt = null;
      visibleButtons(false);
      hideDownloadButtons();
      if (typeof UI !== 'undefined') {
        UI.toast(isAndroid ? 'Aplicación instalada. Búscala en tus apps.' : 'Aplicación instalada correctamente.', 'success');
      }
    });

    // Un único manejador para ambos botones: "Instalar app" ([data-install]) y
    // "Descargar app" ([data-download-app]).
    document.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-install], [data-download-app]');
      if (!btn) return;
      event.preventDefault();
      runInstallFlow();
    });
  }

  return { init, isIOS, isAndroid, isDesktop, isStandalone };
})();
