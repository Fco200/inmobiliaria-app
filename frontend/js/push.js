'use strict';

/**
 * Notificaciones push nativas (Web Push) en el navegador.
 *
 * Cadena completa:
 *   1. Notification.requestPermission()  -> permiso del usuario
 *   2. navigator.serviceWorker.ready      -> esperar el Service Worker (sw.js)
 *   3. pushManager.subscribe({ applicationServerKey: llave VAPID })
 *   4. POST /api/push/subscribe           -> el backend guarda la suscripción
 *
 * Después, cada aviso interno del CRM dispara web-push desde el servidor y el
 * Service Worker muestra la notificación aunque la app esté cerrada.
 */
window.PushNotify = (() => {
  const STORE_KEY = 'crm_push_enabled';

  function supported() {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }

  function permission() {
    return supported() ? Notification.permission : 'unsupported';
  }

  // iPhone/iPad/iPod clásicos + iPadOS 13+ (que se hace pasar por Mac táctil).
  function isIos() {
    if (typeof navigator === 'undefined') return false;
    return (
      (/iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  }

  // La app abierta como PWA instalada (pantalla completa), no como pestaña.
  function isStandalone() {
    try {
      return (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        window.navigator.standalone === true
      );
    } catch (error) {
      return false;
    }
  }

  // En iPhone/iPad las notificaciones push SOLO funcionan si la app está
  // agregada a la pantalla de inicio (iOS 16.4+). Mientras se use en Safari
  // como pestaña normal ni siquiera existen las APIs de push.
  function needsIosInstall() {
    return isIos() && !isStandalone();
  }

  // Guía paso a paso (se muestra también cuando push aún no está disponible,
  // porque en Safari de iPhone no lo está hasta instalar la app).
  function showIosNotificationGuide() {
    if (typeof UI === 'undefined') return;
    UI.openModal({
      title: 'Notificaciones en iPhone',
      body: `
        <p style="margin-top:0;">En iPhone las notificaciones solo funcionan si agregas la app a la pantalla de inicio (requiere iOS 16.4 o superior).</p>
        <ol style="margin:0;padding-left:20px;line-height:2;">
          <li>Abre el CRM en <strong>Safari</strong>.</li>
          <li>Toca el botón <strong>Compartir</strong>
            <span style="display:inline-block;padding:1px 8px;border-radius:6px;background:#0a84ff;color:#fff;font-weight:700;">&#8599;</span>
            de la barra inferior.</li>
          <li>Desliza y elige <strong>"Añadir a pantalla de inicio"</strong>.</li>
          <li>Toca <strong>"Añadir"</strong> y <strong>cierra Safari</strong>.</li>
          <li>Abre la app desde el <strong>nuevo icono</strong> e inicia sesión.</li>
          <li>Cuando aparezca el aviso, toca <strong>"Activar"</strong> y luego <strong>"Permitir"</strong>
            (o ve a Configuración &rarr; Alertas).</li>
        </ol>
        <p class="text-muted" style="margin-bottom:0;">Si antes tocaste "No permitir", borra el icono de la pantalla de inicio y vuelve a agregarlo para reiniciar el permiso.</p>
      `,
      footer: '<button class="btn btn-primary" type="button" data-ok>Entendido</button>',
      size: 480,
    });
    const okBtn = document.querySelector('#modal-overlay [data-ok]');
    if (okBtn) okBtn.addEventListener('click', () => UI.closeModal());
  }

  // La API de suscripción pide la llave pública VAPID en base64url y el
  // navegador necesita los bytes crudos (Uint8Array).
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i += 1) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function vapidPublicKey() {
    const data = await window.ApiClient.get('/push/vapid-public-key');
    return (data && data.publicKey) || '';
  }

  async function currentSubscription() {
    if (!supported()) return null;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return null;
      return await reg.pushManager.getSubscription();
    } catch (error) {
      return null;
    }
  }

  /**
   * Activa las notificaciones push en este dispositivo.
   * `silent: true` (usa tras iniciar sesión) NO vuelve a pedir permiso: solo
   * re-registra la suscripción si el usuario ya lo concedió antes.
   */
  async function enable({ silent = false } = {}) {
    if (!supported()) {
      throw new Error('Este navegador no soporta notificaciones push.');
    }
    if (!window.ApiClient.isAuthenticated()) {
      throw new Error('Inicia sesión para activar las notificaciones.');
    }

    let currentPermission = Notification.permission;
    if (currentPermission !== 'granted') {
      if (silent) return false;
      currentPermission = await Notification.requestPermission();
      if (currentPermission !== 'granted') {
        throw new Error('Permiso de notificaciones denegado. Actívalo en la configuración del sitio.');
      }
    }

    const publicKey = await vapidPublicKey();
    if (!publicKey) {
      throw new Error('El servidor no tiene las llaves VAPID configuradas (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).');
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const json = subscription.toJSON ? subscription.toJSON() : subscription;
    await window.ApiClient.post('/push/subscribe', {
      subscription: {
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent,
      },
    });

    try { localStorage.setItem(STORE_KEY, '1'); } catch (error) { /* sin almacenamiento */ }
    return true;
  }

  async function disable() {
    const subscription = await currentSubscription();
    if (subscription) {
      try {
        await window.ApiClient.post('/push/unsubscribe', { endpoint: subscription.endpoint });
      } catch (error) { /* el backend puede no estar disponible */ }
      try { await subscription.unsubscribe(); } catch (error) { /* ignorar */ }
    }
    try { localStorage.removeItem(STORE_KEY); } catch (error) { /* ignorar */ }
    return true;
  }

  async function status() {
    const subscription = supported() ? await currentSubscription() : null;
    return {
      supported: supported(),
      permission: permission(),
      enabled: Boolean(subscription) && permission() === 'granted',
    };
  }

  // Re-sincroniza la suscripción con el servidor después de iniciar sesión.
  // Nunca muestra el diálogo de permiso (solo si ya fue concedido).
  async function syncAfterLogin() {
    if (!supported() || permission() !== 'granted') return false;
    try {
      return await enable({ silent: true });
    } catch (error) {
      return false;
    }
  }

  // Botón "Probar" de Configuración → Alertas.
  async function sendTest() {
    const result = await window.ApiClient.post('/push/test', {});
    return result;
  }

  // Pregunta al usuario (UNA vez por sesión de navegación) si quiere activar
  // las notificaciones. El permiso del navegador solo puede pedirse tras un
  // toque del usuario, por eso se muestra un modal con "Sí, activar".
  // Si dice "Ahora no", se le recuerda que puede activarlas más tarde desde
  // su Perfil → Notificaciones.
  const SESSION_ASK_KEY = 'crm_push_asked_session';

  async function askOnNewSession() {
    try {
      if (!window.ApiClient || !window.ApiClient.isAuthenticated()) return;
      try {
        if (sessionStorage.getItem(SESSION_ASK_KEY)) return;
      } catch (error) { /* sin almacenamiento */ }

      const iosInstall = needsIosInstall();
      // Solo se pregunta si todavía no se decidió (permiso en "default") o si
      // es iPhone sin instalar. Con permiso denegado o ya activado no se pide.
      if (!iosInstall && (!supported() || permission() !== 'default')) return;
      if (!iosInstall) {
        const sub = await currentSubscription();
        if (sub) return;
      }

      // Nunca volver a preguntar en esta misma pestaña/sesión.
      try { sessionStorage.setItem(SESSION_ASK_KEY, '1'); } catch (error) { /* noop */ }
      showAskSessionModal(iosInstall);
    } catch (error) { /* noop */ }
  }

  function showAskSessionModal(iosInstall) {
    if (typeof UI === 'undefined') return;
    const body = iosInstall
      ? '<p>En iPhone las notificaciones llegan cuando la app está <strong>agregada a la pantalla de inicio</strong>.</p><p class="text-muted" style="margin-bottom:0;">Te mostramos cómo hacerlo paso a paso.</p>'
      : '<p>Recibe en este dispositivo los avisos del CRM (mensajes, citas, recordatorios), aunque la app esté cerrada.</p>';

    UI.openModal({
      title: '¿Quieres activar las notificaciones?',
      body,
      footer:
        '<button class="btn btn-secondary" type="button" data-push-not-now>Ahora no</button>' +
        `<button class="btn btn-primary" type="button" data-push-yes>${iosInstall ? 'Cómo hacerlo' : 'Sí, activar'}</button>`,
      size: 480,
    });

    document.querySelector('#modal-overlay [data-push-not-now]').addEventListener('click', () => {
      UI.closeModal();
      if (window.UI) {
        window.UI.toast('Puedes activarlas más tarde desde tu Perfil → Notificaciones.', 'info');
      }
    });

    document.querySelector('#modal-overlay [data-push-yes]').addEventListener('click', async () => {
      const btn = document.querySelector('#modal-overlay [data-push-yes]');
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = iosInstall ? 'Abriendo guía...' : 'Activando...';
      try {
        if (iosInstall) {
          UI.closeModal();
          showIosNotificationGuide();
          return;
        }
        await enable();
        UI.closeModal();
        if (window.UI) window.UI.toast('Notificaciones activadas en este dispositivo', 'success');
      } catch (error) {
        btn.disabled = false;
        btn.textContent = iosInstall ? 'Cómo hacerlo' : 'Sí, activar';
        if (window.UI) window.UI.toast(error.message, 'error');
      }
    });
  }

  // El Service Worker detectó que el servicio de push rotó la suscripción
  // (pushsubscriptionchange). Se re-sincroniza con el servidor sin volver a
  // pedir permiso; así las notificaciones no se pierden aunque el usuario lleve
  // días sin abrir la app.
  if (supported() && navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data || {};
      if (data.type === 'PUSH_RESYNC_REQUIRED') {
        syncAfterLogin().catch(() => {});
      }
    });
  }

  return { supported, permission, enable, disable, status, syncAfterLogin, sendTest, askOnNewSession, needsIosInstall, isIos, isStandalone, showIosNotificationGuide, urlBase64ToUint8Array };
})();
