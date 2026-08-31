'use strict';

window.Pages = window.Pages || {};

window.Pages.ayuda = {
  title: 'Ayuda y soporte',

  async render(container) {
    container.innerHTML = '<div class="loading">Cargando ayuda...</div>';

    let me = null;
    let support = {};
    try {
      me = await API.auth.me();
      const pub = await API.settings.public().catch(() => null);
      support = (pub && pub.support) || {};
    } catch (error) {
      me = window.ApiClient.getStoredUser() || {};
    }

    const name = (me.name || me.username || '').split(' ')[0];

    const supportName = support.name || 'Soporte';
    const supportTitle = support.title || 'Atención a clientes y equipo';
    const supportWhatsapp = support.whatsapp || '';
    const supportEmail = support.email || '';
    const supportPhoto = support.photo || '';
    const supportIntro = support.intro || '¿Necesitas ayuda? Escríbenos y con gusto te atendemos.';
    const waLink = supportWhatsapp
      ? `https://wa.me/${String(supportWhatsapp).replace(/[^\d]/g, '')}?text=${encodeURIComponent('Hola, necesito ayuda con el sistema INMOBLES.')}`
      : '#';

    const photoHtml = supportPhoto
      ? `<img class="ayuda-avatar" src="${window.AppConfig.resolveUrl(supportPhoto)}" alt="${UI.escapeHtml(supportName)}">`
      : `<span class="ayuda-avatar ayuda-avatar-fallback">${UI.escapeHtml(String(supportName).charAt(0).toUpperCase())}</span>`;

    const whatsappCard = supportWhatsapp
      ? `<a class="card ayuda-contact-card anim-fade-in-up anim-delay-1" href="${waLink}" target="_blank" rel="noopener">
           <span class="ayuda-contact-icon" style="background:#25d366;">&#128172;</span>
           <span class="ayuda-contact-body">
             <strong>WhatsApp de soporte</strong>
             <small>Respuesta rápida para cualquier duda</small>
           </span>
           <span class="btn btn-sm" style="background:#25d366;color:#fff;border:none;">&#9998;&nbsp; Escribir</span>
         </a>`
      : '';

    const emailCard = supportEmail
      ? `<a class="card ayuda-contact-card anim-fade-in-up anim-delay-2" href="mailto:${UI.escapeHtml(supportEmail)}">
           <span class="ayuda-contact-icon" style="background:#7B3FA0;">&#9993;</span>
           <span class="ayuda-contact-body">
             <strong>Correo electrónico</strong>
             <small>${UI.escapeHtml(supportEmail)}</small>
           </span>
         </a>`
      : '';

    container.innerHTML = `
      <div class="page-header">
        <h2>&#128172;&nbsp; Ayuda y soporte</h2>
      </div>

      <div class="ayuda-hero">
        <div class="ayuda-hero-col">
          <div class="ayuda-hero-brands">
            <img src="logoinmobles.png" alt="INMOBLES" class="ayuda-brand-logo">
            <span class="ayuda-brand-plus">&#43;</span>
            <img src="fv_digital_logo.png.webp" alt="FV DIGITAL" class="ayuda-brand-dev">
          </div>
          <h2>¡Hola, ${UI.escapeHtml(name || 'usuario')}!</h2>
          <p>${UI.escapeHtml(supportIntro)}</p>
        </div>
      </div>

      <div class="ayuda-support-row">
        <div class="card ayuda-support-card">
          <div class="ayuda-support-head">
            ${photoHtml}
            <div class="ayuda-support-info">
              <h3>${UI.escapeHtml(supportName)}</h3>
              <p>${UI.escapeHtml(supportTitle)}</p>
              <div class="ayuda-badge-online"><span class="status-dot"></span> Disponible</div>
            </div>
          </div>
          <div class="ayuda-support-contact">
            ${whatsappCard}
            ${emailCard}
            ${support.facebook ? `<a class="card ayuda-contact-card anim-fade-in-up anim-delay-3" href="${UI.escapeHtml(support.facebook)}" target="_blank" rel="noopener">
              <span class="ayuda-contact-icon" style="background:#1877f2;">f</span>
              <span class="ayuda-contact-body"><strong>Facebook</strong><small>@${UI.escapeHtml(support.facebook.replace(/^https?:\/\/(www\.)?(facebook\.com|fb\.com)\//, ''))}</small></span>
            </a>` : ''}
            ${support.instagram ? `<a class="card ayuda-contact-card anim-fade-in-up anim-delay-4" href="${UI.escapeHtml(support.instagram)}" target="_blank" rel="noopener">
              <span class="ayuda-contact-icon" style="background:linear-gradient(45deg,#f58529,#dd2a7b,#8134af);">&#128247;</span>
              <span class="ayuda-contact-body"><strong>Instagram</strong><small>@${UI.escapeHtml(support.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, ''))}</small></span>
            </a>` : ''}
          </div>
        </div>

        <div class="ayuda-actions-col">
          <div class="card ayuda-action-card anim-fade-in-up anim-delay-1">
            <div class="ayuda-action-icon">&#128640;</div>
            <div>
              <strong>Guía rápida</strong>
              <p>Repasa el tutorial de bienvenida cuando quieras.</p>
            </div>
            <button class="btn btn-primary btn-sm" type="button" data-guia>&#128279;&nbsp; Ver guía</button>
          </div>

          <div class="card ayuda-action-card anim-fade-in-up anim-delay-2">
            <div class="ayuda-action-icon">&#128218;</div>
            <div>
              <strong>Manual de usuario</strong>
              <p>Manual completo por módulos para aprovechar toda la plataforma.</p>
            </div>
            <button class="btn btn-primary btn-sm" type="button" data-manual>&#128214;&nbsp; Abrir manual</button>
          </div>

          <div class="card ayuda-action-card anim-fade-in-up anim-delay-3">
            <div class="ayuda-action-icon">&#128100;</div>
            <div>
              <strong>Mi perfil</strong>
              <p>Actualiza tus datos personales y foto.</p>
            </div>
            <a class="btn btn-secondary btn-sm" href="profile.html">Ir a perfil</a>
          </div>

          <div class="card ayuda-action-card anim-fade-in-up anim-delay-4">
            <div class="ayuda-action-icon">&#128274;</div>
            <div>
              <strong>Cambiar contraseña</strong>
              <p>Actualiza tu contraseña de acceso.</p>
            </div>
            <button class="btn btn-secondary btn-sm" type="button" data-password>&#9998;&nbsp; Cambiar</button>
          </div>

          <div class="card ayuda-action-card anim-fade-in-up anim-delay-5">
            <div class="ayuda-action-icon">&#128203;</div>
            <div>
              <strong>Asistente IA</strong>
              <p>Pregunta por propiedades, clientes, citas y más.</p>
            </div>
            <button class="btn btn-secondary btn-sm" type="button" data-assistant>&#129302;&nbsp; Preguntar</button>
          </div>
        </div>
      </div>

      <div class="card ayuda-footer anim-fade-in-up anim-delay-5">
        <div class="ayuda-footer-brands">
          <img src="logoinmobles.png" alt="INMOBLES" class="ayuda-foot-brand">
          <span class="ayuda-brand-plus">&#43;</span>
          <img src="fv_digital_logo.png.webp" alt="FV DIGITAL" class="ayuda-foot-dev">
        </div>
        <p>
          <strong>INMOBLES</strong> &times; <strong style="background:linear-gradient(135deg,#7B3FA0,#5B2D8E);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">FV DIGITAL</strong>
        </p>
        <small class="text-muted">&copy; ${new Date().getFullYear()} INMOBLES · Desarrollado por FV Digital · Soluciones Digitales y Desarrollo</small>
      </div>
    `;

    const guiaBtn = container.querySelector('[data-guia]');
    if (guiaBtn) {
      guiaBtn.addEventListener('click', () => {
        if (window.Onboarding) window.Onboarding.show();
        else if (window.App && window.App.reopenOnboarding) window.App.reopenOnboarding();
      });
    }

    const manualBtn = container.querySelector('[data-manual]');
    if (manualBtn) manualBtn.addEventListener('click', openManual);

    const passBtn = container.querySelector('[data-password]');
    if (passBtn) passBtn.addEventListener('click', openPasswordModal);

    const assistBtn = container.querySelector('[data-assistant]');
    if (assistBtn) {
      assistBtn.addEventListener('click', () => {
        const panel = document.getElementById('assistant-panel');
        if (panel) {
          panel.hidden = panel.hidden ? false : true;
          const q = document.getElementById('assistant-question');
          if (q && !panel.hidden) q.focus();
        } else {
          UI.toast('Abre el asistente desde el botón flotante &#129302;', 'info');
        }
      });
    }

    function openManual() {
      const sections = [
        {
          id: 'inicio',
          icon: '&#127968;',
          title: 'Introducción',
          body: `
            <p><strong>INMOBLES</strong> es la plataforma de gestión inmobiliaria de la empresa. Te permite administrar <strong>propiedades</strong>, <strong>clientes</strong>, <strong>negocios</strong>, <strong>citas</strong>, <strong>tareas</strong>, <strong>metas</strong>, <strong>gastos</strong> y <strong>documentos</strong> desde un solo lugar, además de comunicarte con tu equipo mediante el <strong>chat interno</strong> y los <strong>avisos</strong>.</p>
            <p>Para acceder, entra desde tu dispositivo (celular, tableta o computadora) e inicia sesión con tu usuario y contraseña. Al ingresar llegarás al <strong>Panel de control (Dashboard)</strong> con un resumen de tu actividad.</p>
            <p><strong>Consejo:</strong> mantén tu contraseña en secreto y actualízala periódicamente desde <em>Ayuda → Cambiar contraseña</em>. Cierra sesión siempre al terminar en un equipo compartido.</p>
          `,
        },
        {
          id: 'panel',
          icon: '&#128200;',
          title: 'Panel de control',
          body: `
            <p>El <strong>Dashboard</strong> resume tu información más relevante: propiedades activas, clientes, negocios en curso, citas del día, tareas pendientes y avance de metas.</p>
            <ul>
              <li>Las tarjetas con números te dan un vistazo rápido de cada módulo.</li>
              <li>Usa la barra superior para moverte entre los módulos (menú &#9776; en celular).</li>
              <li>El campanario &#128276; muestra tus avisos y notificaciones.</li>
            </ul>
            <p>Si tienes permisos de administrador, verás además accesos de <strong>configuración</strong> y <strong>reportes</strong>.</p>
          `,
        },
        {
          id: 'propiedades',
          icon: '&#127968;',
          title: 'Propiedades y captación',
          body: `
            <p>En este módulo registras y administras los <strong>inmuebles</strong> que tu inmobiliaria vende o renta.</p>
            <h4>Registrar una propiedad</h4>
            <ol>
              <li>Entra a <em>Propiedades</em> y pulsa <strong>Nueva propiedad</strong>.</li>
              <li>Completa la ubicación, tipo, superficie, precio, número de habitaciones y baños.</li>
              <li>Adjunta <strong>fotos</strong> para que se vea atractiva en la ficha.</li>
              <li>Sube los <strong>documentos</strong> legales (escrituras, avalúos, etc.) en la pestaña de documentos.</li>
              <li>Elige el <strong>estado</strong>: disponible, apartada, vendida, rentada o en trámite.</li>
            </ol>
            <p>Marca tu propiedad como <strong>apartada</strong> cuando un cliente la reserve. El mercado la separa en tu panel de inventario general.</p>
          `,
        },
        {
          id: 'clientes',
          icon: '&#129333;',
          title: 'Clientes y prospectos',
          body: `
            <p>El módulo de <strong>Clientes</strong> concentra tus prospectos y clientes activos.</p>
            <ul>
              <li><strong>Capta</strong> un prospecto desde el menú correspondiente al registrar su nombre y datos de contacto.</li>
              <li>Asígnalo a un <strong>usuario responsable</strong> para darle seguimiento.</li>
              <li>Registra <strong>interacciones</strong> (llamadas, mensajes, visitas) para llevar el historial.</li>
              <li>Convierte un prospecto en <strong>cliente</strong> cuando avance a tu cartera.</li>
            </ul>
            <p>Un prospecto <strong>nuevo</strong> que apareció hoy generará un aviso en tus notificaciones para que lo contactes a tiempo.</p>
          `,
        },
        {
          id: 'negocios',
          icon: '&#129309;',
          title: 'Negocios y operaciones',
          body: `
            <p>Los <strong>negocios</strong> son las operaciones en curso: desde que se interesa un cliente hasta el cierre y la firma.</p>
            <p>Al abrir un negocio, sigue su <strong>etapa</strong> actual (cotización, avalúo, oferta, firma, pago, cierre).</p>
            <ul>
              <li>Vincula la <strong>propiedad</strong> y el <strong>cliente</strong> del negocio.</li>
              <li>Registra las <strong>comisiones</strong> y los montos involucrados.</li>
              <li>Mantén actualizada la etapa: un negocio sin actividad por más de 48 horas en avalúo/firma/pago genera un aviso para reactivarlo.</li>
              <li>Si el negocio se <strong>cancela</strong>, se registra para tu control estadístico.</li>
            </ul>
            <p><strong>Responsabilidad del asesor principal:</strong> mantén la información al día para que los reportes sean confiables.</p>
          `,
        },
        {
          id: 'citas',
          icon: '&#128197;',
          title: 'Citas y agenda',
          body: `
            <p>El módulo de <strong>Citas</strong> te permite agendar visitas y reuniones con clientes.</p>
            <ul>
              <li>Registra la <strong>fecha, hora y motivo</strong> de la cita.</li>
              <li>Asocia la cita a un <strong>cliente</strong> y a la <strong>propiedad</strong> que se visitará.</li>
              <li>Marca el estado: pendiente, confirmada, realizada o cancelada.</li>
            </ul>
            <p>El sistema te <strong>recuerda automáticamente</strong> tus citas: 24 horas antes y 1 hora antes mediante notificaciones emergentes y en el campanario.</p>
          `,
        },
        {
          id: 'tareas',
          icon: '&#128221;',
          title: 'Tareas y pendientes',
          body: `
            <p>Administra tus <strong>tareas</strong> para no perder el hilo de tu trabajo diario.</p>
            <ul>
              <li>Crea una tarea con un <strong>título</strong>, <strong>fecha límite</strong> y prioridad.</li>
              <li>Asígnala a un miembro del equipo si corresponde.</li>
              <li>Marca su estado como <em>pendiente, en proceso u completada</em>.</li>
            </ul>
            <p>Si una tarea <strong>venció</strong> y sigue abierta, recibirás un aviso para retomarla.</p>
          `,
        },
        {
          id: 'metas',
          icon: '&#127919;',
          title: 'Metas y objetivos',
          body: `
            <p>Define <strong>metas</strong> de ventas o de captación para medir tu rendimiento.</p>
            <ul>
              <li>Establece el <strong>objetivo</strong> (monto o número de operaciones) y la <strong>fecha límite</strong>.</li>
              <li>El sistema calcula tu <strong>avance automáticamente</strong> conforme registras ventas.</li>
              <li>Cuando una meta esté por vencer, recibirás un recordatorio.</li>
            </ul>
            <p>El avance de metas también se refleja en el <strong>panel de administración</strong>.</p>
          `,
        },
        {
          id: 'gastos',
          icon: '&#128176;',
          title: 'Gastos y egresos',
          body: `
            <p>Registra los <strong>gastos</strong> de la operación (publicidad, trámites, mantenimiento) para llevar el control financiero.</p>
            <ul>
              <li>Registra el <strong>concepto</strong>, el monto y la <strong>fecha</strong>.</li>
              <li>Clasifícalo por <strong>categoría</strong> para reportes claros.</li>
              <li>Adjunta comprobantes si es necesario.</li>
            </ul>
            <p>Los administradores pueden consultar los gastos del equipo consolidados en reportes.</p>
          `,
        },
        {
          id: 'documentos',
          icon: '&#128196;',
          title: 'Documentos y archivos',
          body: `
            <p>El módulo de <strong>Documentos</strong> guarda escrituras, contratos, avalúos y cualquier archivo importante.</p>
            <ul>
              <li>Sube archivos desde tu dispositivo (PDF, imágenes, etc.) desde la propiedad, cliente o negocio correspondiente.</li>
              <li>Deja documentos en estado <em>pendiente</em> para su validación; el responsable los revisa.</li>
              <li>Un documento pendiente por mucho tiempo genera un <strong>aviso</strong> de recordatorio.</li>
            </ul>
            <p>Utiliza las <strong>plantillas PDF</strong> disponibles para generar formatos estándar de la empresa.</p>
          `,
        },
        {
          id: 'inventario',
          icon: '&#128230;',
          title: 'Inventario',
          body: `
            <p>El <strong>Inventario</strong> te muestra el estado general de todas las propiedades de la empresa, incluso las de otros asesores.</p>
            <ul>
              <li>Consulta cuántas propiedades están <em>disponibles, apartadas, vendidas o rentadas</em>.</li>
              <li>Identifica rápidamente qué inmuebles puedes ofrecer a tus clientes.</li>
            </ul>
            <p>Es ideal para la <strong>captación</strong>: sabrás en todo momento qué hay en cartera.</p>
          `,
        },
        {
          id: 'chat',
          icon: '&#128172;',
          title: 'Chat interno y avisos',
          body: `
            <p>El <strong>Chat interno</strong> te permite comunicarte con el equipo en tiempo real.</p>
            <ul>
              <li>El <strong>Canal general</strong> es el espacio grupal de toda la empresa.</li>
              <li>También puedes iniciar un <strong>chat 1 a 1</strong> con cualquier compañero.</li>
              <li>Cuando te llegue un mensaje nuevo, verás el contador en el menú.</li>
            </ul>
            <p>Los <strong>Avisos</strong> son anuncios que publica la administración o soporte y se muestran como ventanas emergentes a todo el equipo. Léelos y márcalos como vistos.</p>
            <p>También llegan notificaciones individuales (citas, tareas vencidas, nuevos prospectos) que puedes consultar en el campanario &#128276;.</p>
          `,
        },
        {
          id: 'perfil',
          icon: '&#128100;',
          title: 'Mi perfil',
          body: `
            <p>En <em>Mi perfil</em> puedes actualizar tus <strong>datos personales</strong> y tu <strong>fotografía</strong>.</p>
            <ul>
              <li>Cambia tu nombre, teléfono y foto de perfil.</li>
              <li>Tu foto se muestra en el chat y en los reportes del equipo.</li>
            </ul>
            <p>Para mayor seguridad cambia tu contraseña desde <em>Ayuda → Cambiar contraseña</em>.</p>
          `,
        },
        {
          id: 'ayuda',
          icon: '&#128172;',
          title: 'Soporte y contacto',
          body: `
            <p>Si tienes dudas, contacta al <strong>equipo de soporte</strong> por los canales que aparecen en esta misma página:</p>
            <ul>
              <li><strong>WhatsApp</strong>: el medio más rápido.</li>
              <li><strong>Correo electrónico</strong>: para temas formales.</li>
              <li><strong>Redes sociales</strong> (Facebook e Instagram) si están configuradas.</li>
            </ul>
            <p>Describe tu problema con el mayor detalle posible (qué hacías, qué mensaje viste) para que podamos ayudarte rápido.</p>
          `,
        },
      ];

      const toc = sections.map((s) => `<button class="manual-toc-item" data-go="${s.id}"><span>${s.icon}</span> ${s.title}</button>`).join('');
      const content = sections.map((s) => `
        <div class="manual-sec" id="manual-${s.id}">
          <div class="manual-sec-head">
            <span class="manual-sec-icon">${s.icon}</span>
            <h3>${s.title}</h3>
          </div>
          <div class="manual-sec-body">${s.body}</div>
        </div>
      `).join('');

      const modal = UI.openModal({
        title: 'Manual de usuario · INMOBLES',
        body: `
          <style>
            .manual-grid { display: grid; grid-template-columns: 220px 1fr; gap: 18px; }
            .manual-sidebar { border-right: 1px solid var(--border); padding-right: 14px; max-height: 62vh; overflow-y: auto; }
            .manual-toc-item { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 8px 10px; border-radius: 8px; font-size: 13px; }
            .manual-toc-item:hover { background: var(--icon-bg); color: var(--text); }
            .manual-toc-item.active { background: var(--primary-light); color: var(--primary); font-weight: 600; }
            .manual-content { max-height: 62vh; overflow-y: auto; padding-right: 6px; }
            .manual-sec { margin-bottom: 26px; border-bottom: 1px solid var(--border); padding-bottom: 20px; }
            .manual-sec:last-child { border-bottom: none; }
            .manual-sec-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
            .manual-sec-icon { font-size: 22px; }
            .manual-sec h3 { margin: 0; font-size: 18px; }
            .manual-sec-body h4 { margin: 14px 0 6px; font-size: 14px; color: var(--primary); }
            .manual-sec-body p { margin: 8px 0; line-height: 1.6; }
            .manual-sec-body ul, .manual-sec-body ol { margin: 8px 0 8px 20px; line-height: 1.6; }
            .manual-sec-body li { margin: 4px 0; }
            @media (max-width: 600px) { .manual-grid { grid-template-columns: 1fr; } .manual-sidebar { max-height: 200px; border-right: none; border-bottom: 1px solid var(--border); padding-right: 0; padding-bottom: 10px; margin-bottom: 10px; } }
          </style>
          <div class="manual-grid">
            <div class="manual-sidebar" id="manual-toc">
              <strong style="display:block;margin:0 0 8px;font-size:12px;color:var(--text-muted);text-transform:uppercase;">Índice</strong>
              ${toc}
            </div>
            <div class="manual-content" id="manual-content">${content}</div>
          </div>
        `,
        size: 900,
        footer: '<button class="btn btn-primary" type="button" data-manual-cerrar>Cerrar</button>',
      });

      const overlay = modal.bodyEl.closest('#modal-overlay');
      const tocBox = modal.bodyEl.querySelector('#manual-toc');
      const contentBox = modal.bodyEl.querySelector('#manual-content');

      overlay.querySelectorAll('[data-go]').forEach((item) => {
        item.addEventListener('click', () => {
          overlay.querySelectorAll('.manual-toc-item').forEach((x) => x.classList.remove('active'));
          item.classList.add('active');
          const target = contentBox.querySelector('#manual-' + item.dataset.go);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });

      const first = overlay.querySelector('.manual-toc-item');
      if (first) first.classList.add('active');

      const closeBtn = overlay.querySelector('[data-manual-cerrar]');
      if (closeBtn) closeBtn.addEventListener('click', () => UI.closeModal());
    }

    function openPasswordModal() {
      const modal = UI.openModal({
        title: 'Cambiar contraseña',
        body: `
          <p class="text-muted" style="margin-top:0;">Elige una contraseña segura: mínimo 8 caracteres, con mayúscula, minúscula y número.</p>
          <div class="form-group">
            <label for="pw-current">Contraseña actual</label>
            <div class="password-wrap">
              <input class="form-control" id="pw-current" type="password" autocomplete="current-password">
              <button type="button" class="password-toggle" data-toggle-pw="pw-current">&#128065;</button>
            </div>
          </div>
          <div class="form-group">
            <label for="pw-new">Nueva contraseña</label>
            <div class="password-wrap">
              <input class="form-control" id="pw-new" type="password" autocomplete="new-password" minlength="8">
              <button type="button" class="password-toggle" data-toggle-pw="pw-new">&#128065;</button>
            </div>
          </div>
          <div class="form-group">
            <label for="pw-confirm">Confirmar nueva contraseña</label>
            <div class="password-wrap">
              <input class="form-control" id="pw-confirm" type="password" autocomplete="new-password" minlength="8">
              <button type="button" class="password-toggle" data-toggle-pw="pw-confirm">&#128065;</button>
            </div>
          </div>
          <div id="pw-error" class="alert alert-error hide"></div>
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="button" data-ok>Actualizar contraseña</button>
        `,
        size: 460,
      });

      const overlay = modal.bodyEl.closest('#modal-overlay');
      const errBox = modal.bodyEl.querySelector('#pw-error');

      overlay.querySelectorAll('[data-toggle-pw]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const input = document.getElementById(btn.dataset.togglePw);
          if (!input) return;
          const show = input.type === 'password';
          input.type = show ? 'text' : 'password';
          btn.innerHTML = show ? '&#128064;' : '&#128065;';
        });
      });

      const cancelBtn = overlay.querySelector('[data-cancel]');
      if (cancelBtn) cancelBtn.addEventListener('click', () => UI.closeModal());

      const okBtn = overlay.querySelector('[data-ok]');
      if (okBtn) {
        okBtn.addEventListener('click', async () => {
          const current = document.getElementById('pw-current').value;
          const next = document.getElementById('pw-new').value;
          const confirm = document.getElementById('pw-confirm').value;

          if (!current || !next || !confirm) {
            errBox.textContent = 'Completa todos los campos.';
            errBox.classList.remove('hide');
            return;
          }
          if (next.length < 8) {
            errBox.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.';
            errBox.classList.remove('hide');
            return;
          }
          if (!/[A-Z]/.test(next)) {
            errBox.textContent = 'La nueva contraseña debe incluir al menos una mayúscula.';
            errBox.classList.remove('hide');
            return;
          }
          if (!/[a-z]/.test(next)) {
            errBox.textContent = 'La nueva contraseña debe incluir al menos una minúscula.';
            errBox.classList.remove('hide');
            return;
          }
          if (!/\d/.test(next)) {
            errBox.textContent = 'La nueva contraseña debe incluir al menos un número.';
            errBox.classList.remove('hide');
            return;
          }
          if (next !== confirm) {
            errBox.textContent = 'Las contraseñas no coinciden.';
            errBox.classList.remove('hide');
            return;
          }

          okBtn.disabled = true;
          okBtn.classList.add('loading');
          try {
            await API.auth.changePassword({ currentPassword: current, newPassword: next });
            UI.closeModal();
            UI.toast('Contraseña actualizada correctamente', 'success');
          } catch (error) {
            okBtn.disabled = false;
            okBtn.classList.remove('loading');
            errBox.textContent = error.message || 'No se pudo cambiar la contraseña.';
            errBox.classList.remove('hide');
          }
        });
      }
    }
  },
};
