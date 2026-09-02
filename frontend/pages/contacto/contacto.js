'use strict';

// Página pública de CONTACTO (contacto.html): formulario que arma el mensaje
// y lo envía por WhatsApp o correo (mailto). Sin base de datos.
window.ContactoPage = (() => {
  const PS = window.PublicSite;

  function buildMessage() {
    const get = (id) => (document.getElementById(id) || {}).value || '';
    const name = get('c-name').trim();
    const phone = get('c-phone').trim();
    const email = get('c-email').trim();
    const interest = get('c-interest');
    const message = get('c-message').trim();

    const interests = {
      comprar: 'Comprar un inmueble',
      rentar: 'Rentar un inmueble',
      vender: 'Vender mi propiedad',
      avaluo: 'Avalúo / asesoría',
      otro: 'Otro tema',
    };

    const lines = [
      `Hola, soy ${name || 'un cliente interesado'}.`,
      `Tema: ${interests[interest] || interest}.`,
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
    clearTimeout(box._t);
    box._t = setTimeout(() => box.classList.add('hide'), 6000);
  }

  function validForm() {
    const name = (document.getElementById('c-name') || {}).value || '';
    const message = (document.getElementById('c-message') || {}).value || '';
    if (!name.trim() || !message.trim()) {
      showFeedback('Completa tu nombre y tu mensaje para continuar.', true);
      return false;
    }
    return true;
  }

  function sendWhatsApp() {
    if (!validForm()) return;
    if (!PS.OWNER_WHATSAPP) {
      showFeedback('WhatsApp no está disponible por el momento, usa la opción de correo.', true);
      return;
    }
    const url = `https://wa.me/${PS.OWNER_WHATSAPP}?text=${encodeURIComponent(buildMessage())}`;
    window.open(url, '_blank', 'noopener');
    showFeedback('Abrimos WhatsApp con tu mensaje listo. Solo presiona enviar. ¡Gracias!');
  }

  function sendEmail() {
    if (!validForm()) return;
    if (!PS.OWNER_EMAIL) {
      showFeedback('No hay correo de contacto configurado.', true);
      return;
    }
    const name = (document.getElementById('c-name') || {}).value || '';
    const subject = encodeURIComponent(`Contacto web — ${name}`);
    window.location.href = `mailto:${PS.OWNER_EMAIL}?subject=${subject}&body=${encodeURIComponent(buildMessage())}`;
    showFeedback('Abrimos tu app de correo con el mensaje listo.');
  }

  function initForm() {
    const form = document.getElementById('contact-form');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      sendWhatsApp();
    });
    const mailBtn = document.getElementById('btn-send-mail');
    if (mailBtn) mailBtn.addEventListener('click', sendEmail);
  }

  async function init() {
    await PS.initCommon();
    initForm();
    PS.initNewsletter();
    PS.initAssistant();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => window.ContactoPage.init());