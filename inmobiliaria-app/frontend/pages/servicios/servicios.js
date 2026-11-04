'use strict';

// Página pública de SERVICIOS (servicios.html): contenido informativo +
// newsletter y asistente virtual.
window.ServiciosPage = (() => {
  async function init() {
    await window.PublicSite.initCommon();
    window.PublicSite.initNewsletter();
    window.PublicSite.initAssistant();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => window.ServiciosPage.init());