'use strict';

// Página pública de contacto — SIN base de datos.
// El formulario arma el mensaje y lo envía por WhatsApp o correo (mailto).
window.ContactoPage = (() => {
  const state = { whatsapp: '', email: '', phone: '', agencyName: 'Inmobiliaria' };

  function digits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function buildMessage() {
    const name = document.getElementById('c-name').value.trim();
    const phone = document.getElementById('c-phone').value.trim();
    const email = document.getElementById('c-email').value.trim();
    const interest = document.getElementById('c-interest');
    const message = document.getElementById('c-message').value.trim();

    const interests = {
      comprar: 'Comprar un inmueble',
      rentar: 'Rentar un inmueble',
      vender: 'Vender mi propiedad',
      avaluo: 'Avalúo / asesoría',
      otro: 'Otro tema',
    };

    const lines = [
      `Hola, soy ${name || 'un cliente interesado'}.`,
      `Tema: ${interests[interest.value] || interest.value}.`,
    ];
    if (phone) lines.push(`Teléfono: ${phone}`);
    if (email) lines.push(`Correo: ${email}`);
    lines.push('', message);

    return lines.join('\n');
  }

  function showFeedback(text, isError = false) {
    const box = document.getElementById('contact-feedback');
    if (!box) return;
    box.className = `alert ${isError ? 'alert-error' : 'alert-success'}`;
    box.textContent = text;
    setTimeout(() => box.classList.add('hide'), 6000);
  }

  function sendWhatsApp() {
    const name = document.getElementById('c-name').value.trim();
    const message = document.getElementById('c-message').value.trim();

    if (!name || !message) {
      showFeedback('Completa tu nombre y tu mensaje para continuar.', true);
      return;
    }
    if (!state.whatsapp) {
      showFeedback('WhatsApp no está disponible por el momento, usa la opción de correo.', true);
      return;
    }

    const url = `https://wa.me/${state.whatsapp}?text=${encodeURIComponent(buildMessage())}`;
    window.open(url, '_blank', 'noopener');
    showFeedback('Abrimos WhatsApp con tu mensaje listo. Solo presiona enviar. ¡Gracias!');
  }

  function sendEmail() {
    const name = document.getElementById('c-name').value.trim();
    const message = document.getElementById('c-message').value.trim();

    if (!name || !message) {
      showFeedback('Completa tu nombre y tu mensaje para continuar.', true);
      return;
    }
    if (!state.email) {
      showFeedback('No hay correo de contacto configurado.', true);
      return;
    }

    const subject = encodeURIComponent(`Contacto web — ${name}`);
    window.location.href = `mailto:${state.email}?subject=${subject}&body=${encodeURIComponent(buildMessage())}`;
    showFeedback('Abrimos tu app de correo con el mensaje listo.');
  }

  function applyConfig(settings) {
    const l = settings.landing || {};
    state.agencyName = settings.agencyName || 'Inmobiliaria';
    state.whatsapp = l.whatsappNumber || settings.whatsappNumber || '';
    state.email = l.contactEmail || settings.contactEmail || '';
    state.phone = settings.phone || '';

    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el && value) el.textContent = value;
    };
    set('brand-name', state.agencyName);
    set('footer-name', `${state.agencyName} Bienes Raíces`);
    set('contacto-title', `Contacto — ${state.agencyName}`);

    if (state.whatsapp) {
      const wa = document.getElementById('info-wa-link');
      wa.href = `https://wa.me/${state.whatsapp}?text=${encodeURIComponent('Hola, quiero información sobre los inmuebles disponibles.')}`;
      wa.textContent = `WhatsApp +${state.whatsapp}`;
    }
    if (state.phone) {
      const tel = document.getElementById('info-tel-link');
      tel.href = `tel:+${digits(state.phone)}`;
      tel.textContent = `Llamar al +${digits(state.phone)}`;
    } else {
      document.getElementById('info-tel-link').closest('.card').style.display = 'none';
    }
    if (state.email) {
      const mail = document.getElementById('info-mail-link');
      mail.href = `mailto:${state.email}`;
      mail.textContent = state.email;
    } else {
      document.getElementById('info-mail-link').closest('.card').style.display = 'none';
      document.getElementById('btn-send-mail').style.display = 'none';
    }
  }

  async function init() {
    const year = document.getElementById('footer-year');
    if (year) year.textContent = String(new Date().getFullYear());

    // PWA: registra el service worker también en la página pública.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    try {
      const settings = await window.API.settings.public();
      applyConfig(settings);
    } catch (error) {
      // Sin backend la página sigue funcionando con las opciones básicas.
    }

    document.getElementById('contact-form').addEventListener('submit', (e) => {
      e.preventDefault();
      sendWhatsApp();
    });
    document.getElementById('btn-send-mail').addEventListener('click', sendEmail);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => window.ContactoPage.init());
