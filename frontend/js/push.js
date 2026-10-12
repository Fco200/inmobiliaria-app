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

  // Muestra un aviso (una sola vez cada 7 días) invitando a activar las
  // notificaciones del sistema. No pide permiso solo: espera a que el usuario
  // toque "Activar", requisito de los navegadores (sobre todo iOS) para poder
  // mostrar el diálogo de permiso.
  const PROMPT_KEY = 'crm_push_prompt_dismissed_at';
  const PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

  function promptIfNeeded() {
    try {
      if (!supported() || permission() !== 'default') return;
      if (!window.ApiClient || !window.ApiClient.isAuthenticated()) return;
      if (document.getElementById('push-prompt-banner')) return;
      const dismissedAt = Number(localStorage.getItem(PROMPT_KEY) || 0);
      if (dismissedAt && Date.now() - dismissedAt < PROMPT_COOLDOWN_MS) return;

      const host = document.getElementById('app-content') || document.querySelector('.main');
      if (!host) return;

      const banner = document.createElement('div');
      banner.id = 'push-prompt-banner';
      banner.className = 'push-prompt-banner';
      banner.innerHTML =
        '<span class="push-prompt-icon">&#128276;</span>' +
        '<div class="push-prompt-text">' +
        '<strong>Activa las notificaciones</strong>' +
        '<span>Recibe los avisos del CRM en tu teléfono, aunque la app esté cerrada.</span>' +
        '</div>' +
        '<button class="btn btn-primary btn-sm" type="button" data-push-enable>Activar</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-push-later>Ahora no</button>';

      const rememberDismiss = () => {
        try { localStorage.setItem(PROMPT_KEY, String(Date.now())); } catch (error) { /* noop */ }
      };
      banner.querySelector('[data-push-later]').addEventListener('click', () => {
        rememberDismiss();
        banner.remove();
      });
      banner.querySelector('[data-push-enable]').addEventListener('click', async () => {
        const btn = banner.querySelector('[data-push-enable]');
        btn.disabled = true;
        btn.textContent = 'Activando...';
        try {
          await enable();
          banner.remove();
          if (window.UI) window.UI.toast('Notificaciones activadas en este dispositivo', 'success');
        } catch (error) {
          btn.disabled = false;
          btn.textContent = 'Activar';
          if (window.UI) window.UI.toast(error.message, 'error');
        }
      });

      if (host.parentNode && host.parentNode.classList.contains('main')) {
        host.parentNode.insertBefore(banner, host);
      } else {
        host.insertBefore(banner, host.firstChild);
      }
    } catch (error) { /* noop */ }
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

  return { supported, permission, enable, disable, status, syncAfterLogin, sendTest, promptIfNeeded, urlBase64ToUint8Array };
})();
