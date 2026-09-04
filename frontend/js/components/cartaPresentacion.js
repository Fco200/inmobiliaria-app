'use strict';

// Carta de Presentación Digital del asesor (estilo INMOBLES, toques dorados).
// Reutilizable desde el perfil y el landing.
// - Genera el HTML de la ficha y la abre en un overlay en la misma página con
//   botones "Descargar PDF / Imprimir" y "Cerrar". Esto evita ventanas popup
//   (bloqueadas en móvil) y garantiza que siempre se pueda salir sin cerrar la
//   app (el botón "Cerrar" siempre vuelve a la aplicación).
// - El código QR se genera con PublicQR (dataURL local) para que siempre se vea.
// - "Compartir por WhatsApp" abre el selector de compartir de WhatsApp (o el
//   share nativo del móvil), NO un chat con el número del asesor.
window.CartaPresentacion = (() => {
  const AGENCY = 'INMOBLES';
  const TAGLINE = 'Profesionales en Negocios Inmobiliarios';
  const SITE_URL = 'https://inmobles.com';
  const SITE_LABEL = 'inmobles.com';

  let cssInjected = false;

  function resolver(path) {
    if (!path) return '';
    if (window.AppConfig) return window.AppConfig.resolveUrl(path);
    return path;
  }

  // URL absoluta y con token de sesión (cargable en cualquier contexto, incluso
  // fuera de la página, p. ej. en el overlay de impresión).
  function absoluteUrl(path) {
    const base = window.AppConfig && window.AppConfig.BASE_URL
      ? window.AppConfig.BASE_URL
      : (document.location.origin && document.location.origin !== 'null' ? document.location.origin : '');
    if (!path) return '';
    const clean = String(path).replace(/^\//, '');
    let full = `${base}/${clean}`;
    if (window.AppConfig) full = window.AppConfig.resolveUrl(`/${clean}`);
    return full;
  }

  function digits(phone) {
    return String(phone || '').replace(/\D/g, '');
  }

  // Descarga una imagen (con el token de sesión si aplica) y la convierte a
  // dataURL (base64). Así la foto queda incrustada en la carta que se imprime /
  // exporta a PDF y no depende de la red ni del token en el momento de imprimir.
  function photoToDataUrl(path) {
    return new Promise((resolve) => {
      if (!path) return resolve('');
      const src = resolver(path);
      if (!src) return resolve('');
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch (error) {
          resolve(src);
        }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    });
  }

  // Enlace público que muestra el catálogo del asesor en la landing.
  function catalogLink(user) {
    const base = window.AppConfig && window.AppConfig.BASE_URL
      ? window.AppConfig.BASE_URL
      : (document.location.origin && document.location.origin !== 'null' ? document.location.origin : '');
    if (!user || !user._id) return `${base}/propiedades.html`;
    return `${base}/propiedades.html?asesorId=${encodeURIComponent(String(user._id))}`;
  }

  // Inyecta (una sola vez) el CSS de la carta y las reglas de impresión.
  function injectCss() {
    if (cssInjected) return;
    cssInjected = true;
    const style = document.createElement('style');
    style.id = 'ccarta-css';
    style.textContent = `
      .ccarta-overlay {
        position: fixed; inset: 0; z-index: 4000; background: rgba(10,10,26,.82);
        display: flex; flex-direction: column; align-items: center;
        overflow: auto; padding: 24px 16px 60px;
      }
      .ccarta-scroll { width: 100%; max-width: 780px; }
      .ccarta-toolbar {
        position: sticky; bottom: 0; margin-top: 18px; z-index: 10;
        display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;
        background: transparent;
      }
      .ccarta-toolbar .btn { box-shadow: 0 6px 18px rgba(0,0,0,.35); }
      .ccarta { width: 100%; background: #fff; box-shadow: 0 8px 30px rgba(0,0,0,.25); border-top: 6px solid #b9912f; color: #1a1a1a; font-family: 'Segoe UI', Arial, sans-serif; }
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
      .ccarta-servicios { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 18px; }
      .ccarta-servicio { background: #faf7ee; border: 1px solid #eadfc0; border-radius: 8px; padding: 10px 12px; font-size: 13px; color: #2d1048; font-weight: 600; }
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
      .ccarta-overlay .ccarta-loading-qr { display:flex; align-items:center; gap:8px; color:#8a6a1f; font-size:12px; }
      @media (max-width:560px) {
        .ccarta-head, .ccarta-body { padding-left: 18px; padding-right: 18px; }
        .ccarta-contact { grid-template-columns: auto 1fr; }
        .ccarta-servicios { grid-template-columns: 1fr; }
        .ccarta-overlay { padding: 12px 8px 70px; }
      }
      @media print {
        body.ccarta-printing > *:not(.ccarta-overlay) { display: none !important; }
        body.ccarta-printing .ccarta-overlay { position: static !important; background: none !important; padding: 12px !important; overflow: visible !important; }
        body.ccarta-printing .ccarta-toolbar { display: none !important; }
        body.ccarta-printing .ccarta { box-shadow: none !important; border-top-width: 4px !important; }
      }
    `;
    document.head.appendChild(style);
  }

  // HTML de la ficha. options: { print } para preparar rutas absolutas y
  // { photoData } para incrustar la foto como dataURL (ideal para imprimir/PDF).
  function buildCarta(user, opts = {}) {
    const photoResolved = (opts.photoData) ? opts.photoData : resolver(user && user.photo);
    const logo = opts.print ? absoluteUrl('logoinmobles.png') : resolver('logoinmobles.png');
    const photo = opts.print && photoResolved.slice(0, 5) !== 'data:' ? absoluteUrl(photoResolved) : photoResolved;
    const name = (user && user.name) || 'Asesor inmobiliario';
    const position = (user && user.position) || 'Asesor inmobiliario';
    const email = (user && user.email) || '';
    const phone = (user && user.phone) || '';
    const bio = (user && user.bio) || '';
    const url = catalogLink(user);

    return `
      <div class="ccarta" id="ccarta-print-area">
        <div class="ccarta-head">
          <img class="ccarta-logo" src="${logo.replace(/"/g, '&quot;')}" alt="${AGENCY}">
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

          <div class="ccarta-servicios">
            <div class="ccarta-servicio">&#128195; Asesoría personalizada</div>
            <div class="ccarta-servicio">&#128179; Financiamiento</div>
            <div class="ccarta-servicio">&#128279; Trámites y escrituración</div>
            <div class="ccarta-servicio">&#128737; Inversión inmobiliaria</div>
          </div>

          ${!opts.skipQr ? `
          <div class="ccarta-qr">
            <img class="ccarta-qr-img" data-ccarta-qr alt="Código QR del catálogo">
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
          <div class="ccarta-link">
            Sitio oficial: <strong>${SITE_LABEL}</strong>
          </div>
          ` : ''}
        </div>
        <div class="ccarta-rule"></div>
        <div class="ccarta-foot">
          ${AGENCY} · ${TAGLINE} · ${SITE_LABEL} · Todos los derechos reservados
        </div>
      </div>
    `;
  }

  // Llena el <img> del QR dentro de un contenedor (paginación del overlay).
  function populateQr(root, user) {
    const img = root && root.querySelector('[data-ccarta-qr]');
    if (!img) return;
    const url = catalogLink(user);
    const text = url;
    if (window.PublicQR && window.PublicQR.dataUrl) {
      const holder = document.createElement('div');
      holder.className = 'ccarta-loading-qr';
      holder.textContent = 'Generando código QR...';
      img.replaceWith(holder);
      window.PublicQR.dataUrl(text, 220)
        .then((src) => {
          const qrImg = document.createElement('img');
          qrImg.className = 'ccarta-qr-img';
          qrImg.alt = 'Código QR del catálogo';
          qrImg.src = src;
          if (holder && holder.parentNode) holder.replaceWith(qrImg);
        })
        .catch(() => {
          const qrImg = document.createElement('img');
          qrImg.className = 'ccarta-qr-img';
          qrImg.alt = 'Código QR del catálogo';
          qrImg.src = window.PublicQR.toDataUrl(text, 220);
          if (holder && holder.parentNode) holder.replaceWith(qrImg);
        });
    } else {
      img.src = window.PublicQR ? window.PublicQR.toDataUrl(text, 220) : `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(text)}`;
    }
  }

  // Restablece el estado tras la impresión (quita la clase que oculta la app).
  function endPrinting() {
    document.body.classList.remove('ccarta-printing');
  }

  // Abre la vista en pantalla completa de la carta con opciones de imprimir/PDF
  // y cerrar. La impresión se hace en la misma página (sin popup) y siempre se
  // puede salir con el botón "Cerrar" (funciona en PC y móvil).
  async function openPdf(user) {
    injectCss();
    // Precarga la foto como dataURL para que quede incrustada en la impresión/PDF.
    let photoData = '';
    if (user && user.photo) {
      photoData = await photoToDataUrl(user.photo);
    }
    const content = buildCarta(user, { print: true, skipQr: true, photoData });

    const overlay = document.createElement('div');
    overlay.className = 'ccarta-overlay';
    overlay.id = 'ccarta-overlay';
    overlay.innerHTML = `
      <div class="ccarta-scroll">
        ${content}
        <div class="ccarta-toolbar">
          <button class="btn btn-primary" type="button" data-ccarta-print>&#128424;&nbsp; Descargar PDF</button>
          <button class="btn btn-secondary" type="button" data-ccarta-close>&#10005;&nbsp; Cerrar</button>
          <button class="btn btn-wa" type="button" data-ccarta-wa>&#128172;&nbsp; Compartir por WhatsApp</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Construye el QR en la propia carta (dataURL, robusto ante librerías/web).
    populateQr(overlay, user);

    overlay.querySelector('[data-ccarta-close]').addEventListener('click', () => {
      endPrinting();
      overlay.remove();
    });

    overlay.querySelector('[data-ccarta-wa]').addEventListener('click', () => {
      endPrinting();
      shareWhatsApp(user);
    });

    overlay.querySelector('[data-ccarta-print]').addEventListener('click', () => {
      document.body.classList.add('ccarta-printing');
      window.print();
      // En algunos móviles no se dispara afterprint: restablece también al volver.
      setTimeout(endPrinting, 1500);
    });

    window.addEventListener('afterprint', endPrinting);
  }

  // Arma el texto de WhatsApp con el enlace al catálogo del asesor. No incluye
  // el nombre del asesor para que no parezca que se le escribe a él.
  function whatsappText(user) {
    return `Te comparto la carta de presentación de ${AGENCY}. Ve el catálogo de propiedades aquí: ${catalogLink(user)} · Sitio oficial: ${SITE_LABEL}`;
  }

  // Compartir la carta de presentación. Comportamiento uniforme en todos los
  // dispositivos, sin forzar un chat específico:
  //  1) Si el navegador tiene Web Share API (móvil / Chrome desktop) se abre la
  //     hoja de compartir del sistema: el usuario elige la app y el contacto.
  //  2) Si el usuario lo cancela, o no hay Web Share, cae de forma segura al
  //     selector de WhatsApp (sin número → NO es tu propio chat, es para elegir
  //     el destinatario) y además copia el texto al portapapeles por si el
  //     usuario prefiere pegarlo donde quiera.
  async function shareWhatsApp(user) {
    const name = (user && user.name) || 'Asesor INMOBLES';
    const text = whatsappText(user);
    const url = catalogLink(user);
    const full = `${text} ${url}`;
    const payload = { title: `Carta de presentación — ${name}`, text, url };

    if (navigator.share) {
      try {
        await navigator.share(payload);
        return; // Compartido (o cancelado por el usuario): no abrir nada más.
      } catch (error) {
        // Usuario canceló la hoja de compartir → caer al selector de WhatsApp.
      }
    }

    // Copia el texto al portapapeles y abre el selector de WhatsApp (sin número).
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(full);
      }
    } catch (error) { /* sin portapapeles: continuar igual */ }

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(full)}`, '_blank', 'noopener');
  }

  return {
    buildCarta,
    openPdf,
    whatsappText,
    shareWhatsApp,
    catalogLink,
    populateQr,
  };
})();
