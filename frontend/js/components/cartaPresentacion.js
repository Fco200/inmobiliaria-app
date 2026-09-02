'use strict';

// Carta de Presentación Digital del asesor (estilo INMOBLES, toques dorados).
// Reutilizable desde el perfil y el landing: genera el HTML de la ficha, lo
// abre en una ventana de impresión (Guardar como PDF) y arma el mensaje de
// WhatsApp con el enlace al catálogo público del asesor.
window.CartaPresentacion = (() => {
  const AGENCY = 'INMOBLES';
  const TAGLINE = 'Profesionales en Negocios Inmobiliarios';

  function resolver(path) {
    if (!path) return '';
    return window.AppConfig ? window.AppConfig.resolveUrl(path) : path;
  }

  function digits(phone) {
    return String(phone || '').replace(/\D/g, '');
  }

  function waLink(phone, text) {
    const num = digits(phone);
    if (!num) return '';
    return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  }

  // Código QR con el enlace al catálogo del asesor (servicio externo gratuito).
  function qrDataUrl(data) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=6&data=${encodeURIComponent(data)}`;
  }

  // Enlace público que muestra el catálogo del asesor en la landing.
  function catalogLink(user) {
    if (!user || !user._id) return document.location.origin + '/landing.html';
    const base = document.location.origin + '/landing.html';
    return `${base}?asesorId=${encodeURIComponent(String(user._id))}`;
  }

  // HTML de la ficha (imprimible). Se usa tanto en la vista previa del perfil
  // como en la ventana de impresión para generar el PDF.
  function buildCarta(user, opts = {}) {
    const photo = resolver(user && user.photo);
    const name = (user && user.name) || 'Asesor inmobiliario';
    const position = (user && user.position) || 'Asesor inmobiliario';
    const email = (user && user.email) || '';
    const phone = (user && user.phone) || '';
    const bio = (user && user.bio) || '';
    const url = catalogLink(user);

    return `
      <div class="ccarta">
        <div class="ccarta-head">
          <img class="ccarta-logo" src="${resolver('logoinmobles.png').replace(/"/g, '&quot;')}" alt="${AGENCY}">
          <div class="ccarta-head-txt">
            <strong>${AGENCY}</strong>
            <span>${TAGLINE}</span>
          </div>
        </div>
        <div class="ccarta-rule"></div>
        <div class="ccarta-body">
          <table class="ccarta-top">
            <tr>
              <td class="ccarta-avatar-cell">
                ${photo
                  ? `<img class="ccarta-photo" src="${photo.replace(/"/g, '&quot;')}" alt="">`
                  : `<div class="ccarta-photo ccarta-photo-fallback">${(name || 'A').charAt(0).toUpperCase()}</div>`}
              </td>
              <td>
                <div class="ccarta-role">Carta de presentación</div>
                <h1 class="ccarta-name">${name}</h1>
                <div class="ccarta-position">${position}</div>
              </td>
            </tr>
          </table>

          ${bio ? `<p class="ccarta-bio">${bio}</p>` : ''}

          ${!opts.skipQr ? `
          <div class="ccarta-qr">
            <img class="ccarta-qr-img" src="${qrDataUrl(url)}" alt="Código QR del catálogo">
            <div class="ccarta-qr-txt">
              <small>Escanea para ver</small>
              <strong>Mis propiedades en línea</strong>
            </div>
          </div>
          ` : ''}

          <div class="ccarta-contact">
            ${phone ? `<div class="ccarta-contact-item">&#128222;</div><div><small>Teléfono</small><strong>${phone}</strong></div>` : ''}
            ${email ? `<div class="ccarta-contact-item">&#128231;</div><div><small>Correo</small><strong>${email}</strong></div>` : ''}
            <div class="ccarta-contact-item">&#127968;&#65039;</div><div><small>Catálogo</small><strong>Mis propiedades en línea</strong></div>
          </div>

          ${!opts.skipLink ? `
          <div class="ccarta-link">
            Ve mi catálogo de propiedades: <strong>${url}</strong>
          </div>
          ` : ''}
        </div>
        <div class="ccarta-rule"></div>
        <div class="ccarta-foot">
          ${AGENCY} · ${TAGLINE} · Todos los derechos reservados
        </div>
      </div>
    `;
  }

  // Abre la ventana de impresión con la carta maquetada (el usuario guarda PDF).
  function openPdf(user) {
    const content = buildCarta(user);
    const win = window.open('', '_blank', 'width=820,height=1000');
    if (!win) {
      if (typeof UI !== 'undefined') UI.toast('Permite ventanas emergentes para generar el PDF.', 'warning');
      return;
    }
    win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Carta de presentación — ${(user && user.name) || 'Asesor INMOBLES'}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0efe9; display: flex; justify-content: center; padding: 24px; color: #1a1a1a; }
  .ccarta { width: 100%; max-width: 740px; background: #fff; box-shadow: 0 8px 30px rgba(0,0,0,.18); border-top: 6px solid #b9912f; }
  .ccarta-head { display: flex; align-items: center; gap: 14px; padding: 28px 32px 6px; }
  .ccarta-logo { height: 46px; width: auto; }
  .ccarta-head-txt { display: flex; flex-direction: column; }
  .ccarta-head-txt strong { font-size: 18px; letter-spacing: .02em; color: #2d1048; }
  .ccarta-head-txt span { font-size: 11px; color: #8a6a1f; text-transform: uppercase; letter-spacing: .12em; }
  .ccarta-rule { height: 2px; margin: 16px 32px 0; background: linear-gradient(90deg, #b9912f, #e8d28a, #b9912f); }
  .ccarta-body { padding: 22px 32px; }
  .ccarta-top { width: 100%; border-collapse: collapse; }
  .ccarta-avatar-cell { width: 118px; vertical-align: top; padding-right: 18px; }
  .ccarta-photo { width: 112px; height: 112px; border-radius: 50%; object-fit: cover; border: 4px solid #b9912f; box-shadow: 0 0 0 6px rgba(45,16,72,.12); }
  .ccarta-photo-fallback { display: flex; align-items: center; justify-content: center; font-size: 40px; font-weight: 700; color: #fff; background: linear-gradient(135deg, #b9912f, #8a6a1f); }
  .ccarta-role { text-transform: uppercase; letter-spacing: .14em; font-size: 11px; color: #8a6a1f; font-weight: 700; margin-bottom: 6px; }
  .ccarta-name { font-size: 28px; color: #2d1048; margin: 0 0 4px; }
  .ccarta-position { font-size: 15px; color: #555; }
  .ccarta-bio { margin-top: 18px; font-size: 14px; line-height: 1.65; color: #333; }
  .ccarta-qr { margin-top: 20px; display: flex; align-items: center; gap: 16px; padding: 16px 18px; background: #faf7ee; border: 1px solid #eadfc0; border-radius: 8px; }
  .ccarta-qr-img { width: 120px; height: 120px; border: 1px solid #e8d28a; border-radius: 6px; }
  .ccarta-qr-txt small { display: block; font-size: 10px; color: #8a6a1f; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 4px; }
  .ccarta-qr-txt strong { font-size: 14px; color: #2d1048; }
  .ccarta-contact { display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 10px 14px; margin-top: 20px; padding: 18px; background: #faf7ee; border: 1px solid #eadfc0; border-radius: 8px; align-items: center; }
  .ccarta-contact small { display: block; font-size: 10px; color: #8a6a1f; text-transform: uppercase; letter-spacing: .08em; }
  .ccarta-contact strong { font-size: 13px; }
  .ccarta-contact-item { font-size: 18px; }
  .ccarta-link { margin-top: 18px; font-size: 13px; color: #555; background: #f3f3f3; border-radius: 8px; padding: 12px 14px; overflow-wrap: break-word; }
  .ccarta-foot { padding: 14px 32px 26px; font-size: 11px; color: #8a8a8a; }
  @media print { body { background: none; padding: 0; } .ccarta { box-shadow: none; border-top-width: 4px; } }
</style>
</head>
<body>${content}</body>
</html>`);
    win.document.close();
    win.focus();
    const finish = () => {
      win.print();
    };
    setTimeout(finish, 350);
  }

  // Arma el texto de WhatsApp con el enlace al catálogo del asesor.
  function whatsappText(user) {
    const name = (user && user.name) || 'Asesor INMOBLES';
    return `Hola ${name}, te comparto mi carta de presentación. Soy parte del equipo de ${AGENCY}. Puedes ver mi perfil y mi catálogo de propiedades aquí: ${catalogLink(user)}`;
  }

  function shareWhatsApp(user) {
    const text = whatsappText(user);
    const target = text && user && user.phone ? waLink(user.phone, text) : null;
    if (!target) {
      if (typeof UI !== 'undefined') UI.toast('Registra tu teléfono en tu perfil para compartir por WhatsApp.', 'warning');
      return;
    }
    window.open(target, '_blank', 'noopener');
  }

  return {
    buildCarta,
    openPdf,
    whatsappText,
    shareWhatsApp,
    catalogLink,
  };
})();