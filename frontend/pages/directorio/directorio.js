'use strict';

window.Pages = window.Pages || {};

window.Pages.directorio = {
  title: 'Directorio del equipo',

  async render(container) {
    container.innerHTML = '<div class="loading">Cargando directorio...</div>';

    let me = null;
    let users = [];
    try {
      me = await API.auth.me();
      const res = await API.users.list({ limit: 500 });
      users = (res && res.data) || res || [];
    } catch (error) {
      container.innerHTML = UI.errorAlert(error.message);
      return;
    }

    const myId = me && (me._id || me.id);

    // Normaliza rol (puede venir como objeto {code,name} o string).
    const roleOf = (u) => {
      if (!u || !u.role) return '';
      if (typeof u.role === 'object' && u.role !== null) return u.role.code || u.role.name || '';
      return String(u.role);
    };
    const roleNameOf = (u) => {
      if (!u || !u.role) return 'Sin rol';
      if (typeof u.role === 'object' && u.role !== null) return u.role.name || u.role.code || '';
      return String(u.role);
    };
    const avatar = (u) => u.photo
      ? `<img src="${window.AppConfig.resolveUrl(u.photo)}" alt="" style="width:100%;height:100%;object-fit:cover;">`
      : `<span class="advisor-avatar-fallback" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;color:#fff;background:linear-gradient(135deg,#b9912f,#8a6a1f);">${UI.escapeHtml(String(u.name || u.username || 'U').charAt(0).toUpperCase())}</span>`;

    // Solo perfiles relevantes del directorio (activos y con nombre).
    const advisors = users
      .filter((u) => u && u.name && String(u.status || 'activo').toLowerCase() !== 'inactivo')
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));

    const state = { q: '', onlyOthers: false };
    const applyFilters = () => {
      const q = state.q.trim().toLowerCase();
      const list = advisors.filter((u) => {
        const hay = String(u.name || '') + ' ' + String(u.position || '') + ' ' + roleNameOf(u);
        const matchQ = !q || hay.toLowerCase().includes(q);
        const matchOthers = state.onlyOthers ? !(myId && String(u._id) === String(myId)) : true;
        return matchQ && matchOthers;
      });
      grid.innerHTML = list.length
        ? list.map((u) => `<button type="button" class="directorio-card" data-open="${u._id}">${renderCard(u)}</button>`).join('')
        : '<p class="text-muted" style="grid-column:1/-1;text-align:center;padding:24px;">No hay perfiles que coincidan.</p>';
      grid.querySelectorAll('[data-open]').forEach((btn) => {
        btn.addEventListener('click', () => openProfile(users.find((u) => String(u._id) === String(btn.dataset.open))));
      });
    };

    const renderCard = (u) => {
      const isMe = myId && String(u._id) === String(myId);
      return `
        <div class="directorio-avatar" style="width:72px;height:72px;border-radius:50%;overflow:hidden;border:3px solid #b9912f;background:#f3eee2;">${avatar(u)}</div>
        <div style="flex:1;min-width:0;text-align:left;">
          <strong style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${UI.escapeHtml(u.name)}${isMe ? ' <small class="text-muted">(tú)</small>' : ''}</strong>
          <small style="color:var(--text-muted);display:block;">${UI.escapeHtml(u.position || 'Asesor inmobiliario')}</small>
          <span style="font-size:11px;color:#8a6a1f;">${roleNameOf(u)}</span>
        </div>
        <span style="font-size:16px;color:var(--text-muted);">&#10095;</span>
      `;
    };

    const openProfile = (u) => {
      if (!u) return;
      const isMe = myId && String(u._id) === String(myId);
      const modal = UI.openModal({
        title: UI.escapeHtml(u.name),
        size: 520,
        body: `
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">
            <div style="width:76px;height:76px;border-radius:50%;overflow:hidden;border:3px solid #b9912f;background:#f3eee2;flex-shrink:0;">${avatar(u)}</div>
            <div>
              <div style="font-size:12px;color:#8a6a1f;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">${roleNameOf(u)}</div>
              <h3 style="margin:2px 0 4px;">${UI.escapeHtml(u.name)}</h3>
              <div style="color:var(--text-muted);font-size:13px;">${UI.escapeHtml(u.position || 'Asesor inmobiliario')}</div>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);">
            <span class="text-muted">Correo</span><strong>${UI.escapeHtml(u.email || '—')}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);">
            <span class="text-muted">Teléfono</span><strong>${UI.escapeHtml(u.phone || '—')}</strong>
          </div>
          <div style="display:flex;gap:8px;padding-top:12px;flex-wrap:wrap;">
            ${u.facebook ? `<a class="btn btn-secondary btn-sm" href="${UI.escapeHtml(u.facebook)}" target="_blank" rel="noopener">Facebook</a>` : ''}
            ${u.instagram ? `<a class="btn btn-secondary btn-sm" href="${UI.escapeHtml(u.instagram)}" target="_blank" rel="noopener">Instagram</a>` : ''}
          </div>
          ${u.bio ? `<p style="margin:14px 0 0;font-size:13px;color:var(--text-muted);white-space:pre-wrap;">${UI.escapeHtml(u.bio)}</p>` : ''}
        `,
        footer: `
          <button class="btn btn-secondary" type="button" data-cancel>Cerrar</button>
          <button class="btn btn-primary" type="button" data-carta>Ver carta de presentación</button>
          <button class="btn btn-wa" type="button" data-share>&#128172; Compartir su carta</button>
        `,
      });
      const overlay = modal.bodyEl ? modal.bodyEl.closest('#modal-overlay') : null;
      if (!overlay) return;
      overlay.querySelector('[data-cancel]').addEventListener('click', () => UI.closeModal());
      overlay.querySelector('[data-carta]').addEventListener('click', () => {
        UI.closeModal();
        if (window.CartaPresentacion) CartaPresentacion.openPdf(u);
      });
      overlay.querySelector('[data-share]').addEventListener('click', () => {
        UI.closeModal();
        if (window.CartaPresentacion) CartaPresentacion.shareWhatsApp(u);
      });
    };

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2>&#128101; Directorio del equipo</h2>
          <p class="text-muted" style="margin:2px 0 0;font-size:13px;">Perfiles de los asesores: ve su información y comparte su carta de presentación (PDF o WhatsApp).</p>
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px;">
        <input class="form-control" data-search placeholder="Buscar por nombre, cargo o rol..." style="max-width:300px;">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
          <input type="checkbox" data-others> Ocultar mi perfil
        </label>
      </div>
      <div class="directorio-grid" data-grid style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;"></div>
    `;

    const search = container.querySelector('[data-search]');
    const others = container.querySelector('[data-others]');
    const grid = container.querySelector('[data-grid]');

    search.addEventListener('input', (e) => { state.q = e.target.value; applyFilters(); });
    others.addEventListener('change', (e) => { state.onlyOthers = e.target.checked; applyFilters(); });

    applyFilters();

    // Añade el CSS específico del directorio (una sola vez).
    if (!document.getElementById('directorio-css')) {
      const style = document.createElement('style');
      style.id = 'directorio-css';
      style.textContent = `
        .directorio-card {
          display:flex;align-items:center;gap:12px;text-align:left;cursor:pointer;
          background:#fff;border:1px solid var(--border);border-radius:var(--radius);
          padding:14px;transition:box-shadow .15s, transform .15s;font-family:inherit;width:100%;
        }
        .directorio-card:hover { box-shadow:0 6px 18px rgba(0,0,0,.10); transform:translateY(-2px); }
        [data-theme="dark"] .directorio-card { background:#1b1b28; }
      `;
      document.head.appendChild(style);
    }
  },
};
