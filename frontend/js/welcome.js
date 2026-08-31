'use strict';

window.Welcome = (() => {
  const LS_SEEN_KEY = 'crm_welcome_seen';

  // La bandera de "visto" es POR USUARIO (no por navegador): así el mensaje se
  // muestra a cada persona en su primera sesión, incluso si otro usuario usó
  // el mismo navegador/dispositivo antes.
  function userKey() {
    const user = (window.ApiClient && window.ApiClient.getStoredUser()) || {};
    const id = user._id || user.id || user.username || 'anon';
    return `${LS_SEEN_KEY}_${id}`;
  }

  const PHRASES = [
    {
      icon: '&#127919;',
      text: 'Cada venta exitosa comienza con un pequeño paso. ¡Hoy es un gran día para lograrlo!',
    },
    {
      icon: '&#128170;',
      text: 'Tu constancia construye tu éxito. Sigue adelante, ¡los resultados llegarán!',
    },
    {
      icon: '&#127808;',
      text: 'El éxito es la suma de pequeños esfuerzos repetidos día tras día.',
    },
    {
      icon: '&#11088;',
      text: 'Cada cliente es una oportunidad. Cada llamada, un paso más cerca de la meta.',
    },
    {
      icon: '&#128640;',
      text: 'No cuentes los días, haz que los días cuenten. ¡A trabajar!',
    },
    {
      icon: '&#127757;',
      text: 'El que persigue un sueño con disciplina, alcanza sus metas. ¡Tú puedes!',
    },
    {
      icon: '&#128293;',
      text: 'La actitud lo es todo. Tu energía positiva atrae resultados positivos.',
    },
    {
      icon: '&#127942;',
      text: 'Grandes logros requieren grandes esfuerzos. Hoy es el día de empezar.',
    },
  ];

  let active = false;

  function markSeen(force) {
    try { localStorage.setItem(userKey(), force ? String(Date.now()) : '1'); } catch (e) {}
  }

  function isFirstTimeToday() {
    try {
      const last = localStorage.getItem(userKey());
      if (!last) return true;
      const today = new Date().toDateString();
      const lastDate = new Date(Number(last) || Date.now()).toDateString();
      return today !== lastDate;
    } catch (e) {
      return true;
    }
  }

  function randomPhrase() {
    return PHRASES[Math.floor(Math.random() * PHRASES.length)];
  }

  function createParticles(container) {
    for (let i = 0; i < 18; i += 1) {
      const p = document.createElement('span');
      p.className = 'welcome-particle';
      p.style.left = `${Math.random() * 100}%`;
      p.style.animationDuration = `${3 + Math.random() * 5}s`;
      p.style.animationDelay = `${Math.random() * 2}s`;
      p.style.width = `${3 + Math.random() * 6}px`;
      p.style.height = p.style.width;
      container.appendChild(p);
    }
  }

  function open(opts) {
    if (active) return;
    active = true;

    markSeen(true);

    const onClose = (opts && opts.onClose) || null;

    const overlay = document.createElement('div');
    overlay.id = 'welcome-overlay';
    overlay.className = 'welcome-overlay';

    const phrase = randomPhrase();

    const user = (window.ApiClient && window.ApiClient.getStoredUser()) || {};
    const name = (user.name || user.username || '').split(' ')[0];

    overlay.innerHTML = `
      <div class="welcome-particles" id="welcome-particles"></div>
      <div class="welcome-card">
        <div class="welcome-logo">
          <img src="logoinmobles.png" alt="INMOBLES">
        </div>
        <div class="welcome-icon">${phrase.icon}</div>
        <h2 class="welcome-title">¡Bienvenido, ${UI.escapeHtml(name || 'usuario')}!</h2>
        <p class="welcome-phrase">${UI.escapeHtml(phrase.text)}</p>
        <div class="welcome-brand-row">
          <img class="welcome-brand-logo" src="logoinmobles.png" alt="INMOBLES">
          <span class="welcome-brand-plus">&#43;</span>
          <img class="welcome-brand-dev" src="fv_digital_logo.png.webp" alt="FV DIGITAL">
        </div>
        <p class="welcome-note">INMOBLES &times; FV DIGITAL</p>
        <button class="btn btn-primary welcome-btn" type="button" id="welcome-continue">&#128075;&nbsp; Continuar</button>
      </div>
    `;

    document.body.appendChild(overlay);
    createParticles(overlay.querySelector('#welcome-particles'));

    const close = () => {
      overlay.classList.add('closing');
      setTimeout(() => {
        overlay.remove();
        active = false;
        if (onClose) onClose();
      }, 450);
    };

    overlay.querySelector('#welcome-continue').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    setTimeout(() => overlay.classList.add('show'), 30);
    return { close };
  }

  function maybeShow(opts) {
    if (!isFirstTimeToday()) return false;
    open(opts);
    return true;
  }

  return { open, maybeShow };
})();
