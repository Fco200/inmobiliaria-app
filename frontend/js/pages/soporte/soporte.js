'use strict';

window.SoportePanel = (() => {
  const TOKEN_KEY = 'soporte_token';
  const USER_KEY = 'soporte_user';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getSavedUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (e) { return null; }
  }
  function saveSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user || null));
  }
  function clearSession() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function fmtDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return escapeHtml(value);
    return d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  }

  function showAlert(box, message, type) {
    if (!box) return;
    box.className = `alert show alert-${type}`;
    box.textContent = message;
  }
  function hideAlert(box) { if (box) { box.className = 'alert'; box.textContent = ''; } }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 800);
  }

  // ── Navegación por pestañas ───────────────────────────────────────────────
  function initTabs() {
    document.querySelectorAll('.sp-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.sp-tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.sp-pane').forEach((p) => p.classList.remove('active'));
        tab.classList.add('active');
        const pane = document.getElementById('pane-' + tab.dataset.tab);
        if (pane) pane.classList.add('active');
      });
    });
  }

  // ── Pestaña Usuarios ──────────────────────────────────────────────────────
  let rolesCache = [];

  async function renderUsuarios() {
    const box = document.getElementById('usuarios-container');
    box.innerHTML = '<div class="sp-loading"><span class="spinner"></span> Cargando usuarios…</div>';
    try {
      const [usuarios, roles] = await Promise.all([
        window.API.soporte.usuarios(),
        window.API.soporte.roles(),
      ]);
      rolesCache = roles;

      const stats = {
        total: usuarios.length,
        activos: usuarios.filter((u) => u.status === 'activo').length,
        asesores: usuarios.filter((u) => u.role && u.role.code === 'asesor').length,
      };

      box.innerHTML = `
        <div class="stat-cards">
          <div class="stat-card"><b>${stats.total}</b><span>Total</span></div>
          <div class="stat-card"><b>${stats.activos}</b><span>Activos</span></div>
          <div class="stat-card"><b>${stats.asesores}</b><span>Asesores</span></div>
        </div>
        <div class="sp-card">
          <div class="sp-table-wrap">
            <table>
              <thead><tr>
                <th>Usuario</th><th>Rol</th><th>Canales</th><th>Estado</th><th>Último acceso</th><th>Acciones</th>
              </tr></thead>
              <tbody>
                ${usuarios.map((u, i) => renderUsuarioRow(u, i)).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      box.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          const id = btn.dataset.id;
          if (action === 'toggle') toggleUsuario(id, btn);
          else if (action === 'role') changeRole(null, id);
          else if (action === 'reset') resetPassword(id);
        });
      });
      box.querySelectorAll('[data-role-select]').forEach((sel) => {
        sel.addEventListener('change', () => changeRole(sel, sel.dataset.userId, sel.value));
      });
    } catch (error) {
      box.innerHTML = `<div class="alert show alert-error">${escapeHtml(error.message)}</div>`;
    }
  }

  function renderUsuarioRow(u, i) {
    const roleCode = u.role ? u.role.code : '—';
    const roleName = u.role ? u.role.name : '—';
    const isSoporte = roleCode === 'superadmin';
    const isSelf = u._id === (getSavedUser() || {}).id;
    const options = rolesCache.map((r) =>
      `<option value="${r._id}" ${roleCode === r.code ? 'selected' : ''}>${escapeHtml(r.name)}</option>`
    ).join('');

    return `
      <tr>
        <td>
          <div style="font-weight:600;">${escapeHtml(u.name)} ${isSelf ? '<span class="badge badge-role">tú</span>' : ''}</div>
          <div style="color:var(--text-muted);font-size:11px;">@${escapeHtml(u.username)}</div>
        </td>
        <td>
          ${isSoporte
            ? `<span class="badge badge-role">${escapeHtml(roleName)}</span>`
            : `<select class="role-select" data-role-select data-user-id="${u._id}" style="background:var(--bg-2);border:1px solid var(--border);color:var(--text);border-radius:7px;padding:5px 8px;font-size:12px;">${options}</select>`
          }
        </td>
        <td style="font-size:12px;color:var(--text-muted);">${escapeHtml(u.email)}</td>
        <td><span class="badge ${u.status === 'activo' ? 'badge-on' : 'badge-off'}">${escapeHtml(u.status)}</span></td>
        <td style="font-size:12px;">${fmtDate(u.lastLoginAt)}</td>
        <td>
          <div class="row-actions">
            ${isSoporte ? '' : `
              <button class="btn btn-ghost btn-sm" data-action="toggle" data-id="${u._id}">${u.status === 'activo' ? 'Desactivar' : 'Activar'}</button>
              <button class="btn btn-ghost btn-sm" data-action="reset" data-id="${u._id}">Restablecer</button>
            `}
          </div>
        </td>
      </tr>
    `;
  }

  async function toggleUsuario(id, btn) {
    const user = (await window.API.soporte.usuarios()).find((u) => u._id === id);
    if (!user) return;
    const next = user.status === 'activo' ? 'inactivo' : 'activo';
    if (!confirm(`¿${next === 'activo' ? 'Activar' : 'Desactivar'} a ${user.name}?`)) return;
    btn.disabled = true;
    try {
      await window.API.soporte.actualizarUsuario(id, { status: next });
      renderUsuarios();
    } catch (error) {
      alert(error.message);
      renderUsuarios();
    }
  }

  async function changeRole(sel, userId, value) {
    const roleId = value || (sel && sel.value);
    if (!roleId) return;
    if (!confirm('¿Cambiar el rol de este usuario?')) return;
    try {
      await window.API.soporte.actualizarUsuario(userId, { role: roleId });
      renderUsuarios();
    } catch (error) {
      alert(error.message);
      renderUsuarios();
    }
  }

  async function resetPassword(id) {
    const newPassword = prompt('Nueva contraseña (mín. 8 caracteres, con mayúsculas, minúsculas y números):');
    if (newPassword === null) return;
    if (!newPassword.trim()) { alert('La contraseña no puede estar vacía.'); return; }
    try {
      await window.API.soporte.restablecerPassword(id, { newPassword });
      alert('Contraseña restablecida correctamente. Todas sus sesiones fueron cerradas.');
      renderUsuarios();
    } catch (error) {
      alert(error.message);
    }
  }

  // ── Pestaña Config ────────────────────────────────────────────────────────
  async function renderConfig() {
    const box = document.getElementById('config-container');
    box.innerHTML = '<div class="sp-loading"><span class="spinner"></span> Cargando configuración…</div>';
    try {
      const [configs, sopConfig] = await Promise.all([
        window.API.soporte.config(),
        window.API.soporte.soporteConfig(),
      ]);
      const byKey = {};
      configs.forEach((c) => { byKey[c.key] = c; });

      const def = (key, fallback) => byKey[key] ? byKey[key].value : fallback;
      const sp = (k) => escapeHtml(sopConfig[k] || '');

      box.innerHTML = `
        <div class="sp-card">
          <h3 style="margin-bottom:16px;">Datos de la Inmobiliaria</h3>
          <form id="config-empresa-form">
            <div class="form-grid">
              <div class="fgroup">
                <label>Nombre de la inmobiliaria</label>
                <input name="empresa.nombre" value="${escapeHtml(def('empresa.nombre', ''))}">
              </div>
              <div class="fgroup">
                <label>Teléfonos (separados por coma)</label>
                <input name="empresa.telefonos" value="${escapeHtml(def('empresa.telefonos', ''))}">
              </div>
              <div class="fgroup">
                <label>URL del logo</label>
                <input name="empresa.logo" value="${escapeHtml(def('empresa.logo', ''))}">
              </div>
              <div class="fgroup">
                <label>Comisión base (%)</label>
                <input name="comisiones.base" type="number" value="${escapeHtml(def('comisiones.base', '5'))}">
              </div>
            </div>
            <div style="margin-top:18px;display:flex;gap:10px;">
              <button class="btn btn-gold" type="submit">Guardar ajustes</button>
            </div>
            <div class="alert" id="config-alert"></div>
          </form>
        </div>

        <div class="sp-card">
          <h3 style="margin-bottom:16px;">Datos de Soporte Técnico</h3>
          <p style="margin:0 0 16px;color:var(--text-muted);font-size:13px;">
            Estos datos se muestran en el módulo <b>Ayuda</b> para todos los usuarios del sistema.
            Solo el panel de soporte puede modificarlos (el administrador del CRM ya no tiene acceso a ellos).
          </p>
          <form id="config-soporte-form">
            <div class="form-grid">
              <div class="fgroup">
                <label>Nombre del soporte</label>
                <input name="name" value="${sp('name')}" placeholder="Ej. Juan Pérez">
              </div>
              <div class="fgroup">
                <label>Cargo / Título</label>
                <input name="title" value="${sp('title')}" placeholder="Ej. Gerente general">
              </div>
              <div class="fgroup">
                <label>WhatsApp (con código de país)</label>
                <input name="whatsapp" value="${sp('whatsapp')}" placeholder="Ej. 5216625374491">
              </div>
              <div class="fgroup">
                <label>Correo de soporte</label>
                <input name="email" type="email" value="${sp('email')}" placeholder="soporte@inmobles.com">
              </div>
              <div class="fgroup">
                <label>Facebook</label>
                <input name="facebook" value="${sp('facebook')}" placeholder="https://facebook.com/...">
              </div>
              <div class="fgroup">
                <label>Instagram</label>
                <input name="instagram" value="${sp('instagram')}" placeholder="https://instagram.com/...">
              </div>
              <div class="fgroup">
                <label>URL de la foto</label>
                <input name="photo" value="${sp('photo')}" placeholder="https://.../foto.png">
              </div>
              <div class="fgroup fgroup-full">
                <label>Mensaje de introducción</label>
                <input name="intro" value="${sp('intro')}" placeholder="¿Necesitas ayuda? Escríbenos...">
              </div>
            </div>
            <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;">
              <button class="btn btn-gold" type="submit">Guardar datos de soporte</button>
              <a class="btn btn-ghost" href="ayuda.html" target="_blank" rel="noopener">Ver página de ayuda</a>
            </div>
            <div class="alert" id="soporte-config-alert"></div>
          </form>
        </div>
      `;

      document.getElementById('config-empresa-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const alertBox = document.getElementById('config-alert');
        hideAlert(alertBox);
        const campos = [
          'empresa.nombre',
          'empresa.telefonos',
          'empresa.logo',
          'comisiones.base',
        ];
        try {
          for (const key of campos) {
            const input = form.querySelector(`[name="${key}"]`);
            await window.API.soporte.guardarConfig({ key, value: input ? input.value : '' });
          }
          showAlert(alertBox, 'Ajustes guardados correctamente.', 'success');
          setTimeout(() => hideAlert(alertBox), 3000);
        } catch (error) {
          showAlert(alertBox, error.message, 'error');
        }
      });

      document.getElementById('config-soporte-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const alertBox = document.getElementById('soporte-config-alert');
        hideAlert(alertBox);
        const campos = ['name', 'title', 'whatsapp', 'email', 'facebook', 'instagram', 'photo', 'intro'];
        const payload = {};
        campos.forEach((name) => {
          const input = form.querySelector(`[name="${name}"]`);
          payload[name] = input ? input.value : '';
        });
        try {
          await window.API.soporte.guardarSoporteConfig(payload);
          showAlert(alertBox, 'Datos de soporte guardados correctamente.', 'success');
          setTimeout(() => hideAlert(alertBox), 3000);
        } catch (error) {
          showAlert(alertBox, error.message, 'error');
        }
      });
    } catch (error) {
      box.innerHTML = `<div class="alert show alert-error">${escapeHtml(error.message)}</div>`;
    }
  }

  // ── Pestaña Resumen ───────────────────────────────────────────────────────
  function fmtBytes(bytes) {
    if (!bytes && bytes !== 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
    return `${n.toFixed(1)} ${units[i]}`;
  }

  function fmtUptime(seconds) {
    const s = Math.floor(seconds || 0);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  }

  async function renderResumen() {
    const box = document.getElementById('resumen-container');
    box.innerHTML = '<div class="sp-loading"><span class="spinner"></span> Cargando resumen…</div>';
    try {
      const r = await window.API.soporte.resumen();
      const dbOk = r.baseDatos && r.baseDatos.estado === 'conectado';
      const conteos = r.conteos || {};

      const counts = [
        ['Usuarios', conteos.usuarios], ['Clientes', conteos.clientes], ['Propiedades', conteos.propiedades],
        ['Inventario', conteos.inventario], ['Negocios', conteos.negocios], ['Citas', conteos.citas],
        ['Tareas', conteos.tareas], ['Metas', conteos.metas], ['Gastos', conteos.gastos],
        ['Documentos', conteos.documentos], ['Sesiones activas', conteos.sesiones], ['Avisos', conteos.avisos],
      ];

      const roleRows = Object.entries(r.usuariosPorRol || {}).map(([code, v]) => `
        <div class="kv">
          <b>${v.total}</b>
          <span>${escapeHtml(v.name || code)} (${v.activos} activos)</span>
        </div>
      `).join('');

      box.innerHTML = `
        <div class="stat-cards">
          <div class="stat-card"><b style="color:${dbOk ? 'var(--success)' : 'var(--danger)'}">${dbOk ? 'En línea' : 'Caído'}</b><span>Base de datos</span></div>
          <div class="stat-card"><b>${conteos.usuarios || 0}</b><span>Usuarios</span></div>
          <div class="stat-card"><b>${r.sesionesActivas || 0}</b><span>Sesiones activas</span></div>
          <div class="stat-card"><b>${fmtUptime(r.fechas && r.fechas.uptime)}</b><span>Uptime</span></div>
        </div>

        <div class="sp-card">
          <h3 style="margin-bottom:14px;">Estado del servidor</h3>
          <div class="kv-grid">
            <div class="kv"><b>${escapeHtml(r.servidor.hostname || '—')}</b><span>Hostname</span></div>
            <div class="kv"><b>${escapeHtml(r.baseDatos.nombre || '—')}</b><span>Base de datos</span></div>
            <div class="kv"><b class="${dbOk ? '' : 'estado-bad'}">${escapeHtml(r.baseDatos.estado || '—')}</b><span>Estado conexión</span></div>
            <div class="kv"><b>${escapeHtml(r.servidor.plataforma || '—')}</b><span>Plataforma</span></div>
            <div class="kv"><b>${escapeHtml(r.servidor.arquitectura || '—')}</b><span>Arquitectura</span></div>
            <div class="kv"><b>${r.servidor.cpus || 0}</b><span>CPUs</span></div>
            <div class="kv"><b>${fmtBytes(r.servidor.memoriaTotal)}</b><span>Memoria total</span></div>
            <div class="kv"><b>${fmtBytes(r.servidor.memoriaLibre)}</b><span>Memoria libre</span></div>
          </div>
        </div>

        <div class="sp-card">
          <h3 style="margin-bottom:14px;">Registros por módulo</h3>
          <div class="kv-grid">
            ${counts.map(([label, n]) => `<div class="kv"><b>${n || 0}</b><span>${label}</span></div>`).join('')}
          </div>
        </div>

        <div class="sp-card">
          <h3 style="margin-bottom:14px;">Usuarios por rol</h3>
          <div class="kv-grid">${roleRows || '<div class="sp-empty">Sin datos</div>'}</div>
        </div>
      `;
    } catch (error) {
      box.innerHTML = `<div class="alert show alert-error">${escapeHtml(error.message)}</div>`;
    }
  }

  // ── Pestaña Sesiones ──────────────────────────────────────────────────────
  function deviceLabel(ua) {
    if (!ua) return 'Dispositivo desconocido';
    let browser = 'Navegador';
    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/OPR\//.test(ua)) browser = 'Opera';
    else if (/Chrome\//.test(ua)) browser = 'Chrome';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';
    else if (/Safari\//.test(ua)) browser = 'Safari';
    let os = 'desconocido';
    if (/Windows/.test(ua)) os = 'Windows';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/iPhone|iPad/.test(ua)) os = 'iOS';
    else if (/Mac OS X/.test(ua)) os = 'macOS';
    else if (/Linux/.test(ua)) os = 'Linux';
    return `${browser} · ${os}`;
  }

  async function renderSesiones() {
    const box = document.getElementById('sesiones-container');
    box.innerHTML = '<div class="sp-loading"><span class="spinner"></span> Cargando sesiones…</div>';
    try {
      const sesiones = await window.API.soporte.sesiones({ limit: 300 });
      if (!sesiones.length) {
        box.innerHTML = '<div class="sp-empty">No hay sesiones activas.</div>';
        return;
      }

      box.innerHTML = `
        <div class="sp-card sp-table-wrap">
          <table class="mega-table">
            <thead><tr>
              <th>Usuario</th><th>Rol</th><th>Dispositivo</th><th>Duración</th><th>IP</th><th>Última actividad</th><th>Expira</th><th>Estado</th><th></th>
            </tr></thead>
            <tbody>
              ${sesiones.map((s) => {
                const u = s.user || {};
                const isCurrent = s.isCurrent;
                const role = s.role || {};
                return `
                  <tr>
                    <td>
                      <strong>${escapeHtml(u.name || 'Usuario')}</strong>
                      ${isCurrent ? ' <span class="badge badge-role">actual</span>' : ''}
                      <br><small class="text-muted">${escapeHtml(u.email || '')}</small>
                    </td>
                    <td>
                      ${role.code ? `<span class="role-chip">${escapeHtml(role.name || role.code)}</span>` : '<span style="color:var(--text-muted)">—</span>'}
                    </td>
                    <td>${escapeHtml(deviceLabel(s.device))}</td>
                    <td>${s.remember ? '<span class="badge badge-on">Recordada</span>' : '<span class="badge badge-off">Temporal</span>'}</td>
                    <td>${escapeHtml(s.ip || '—')}</td>
                    <td>${fmtDate(s.lastSeenAt)}</td>
                    <td>${fmtDate(s.expiresAt)}</td>
                    <td>${isCurrent ? '<span class="badge badge-role">Este panel</span>' : '<span class="badge badge-on">Activa</span>'}</td>
                    <td><button class="btn btn-danger btn-sm" data-rs="${s._id}" ${isCurrent ? 'disabled' : ''}>Cerrar Sesión</button></td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      box.querySelectorAll('[data-rs]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('¿Cerrar esta sesión? El dispositivo perderá el acceso.')) return;
          try {
            await window.API.soporte.revocarSesion(btn.dataset.rs);
            renderSesiones();
          } catch (error) { alert(error.message); }
        });
      });
    } catch (error) {
      box.innerHTML = `<div class="alert show alert-error">${escapeHtml(error.message)}</div>`;
    }
  }

  function initSesiones() {
    const btn = document.getElementById('btn-sesiones-refresh');
    if (btn) btn.addEventListener('click', renderSesiones);
    renderSesiones();
  }

  // ── Pestaña Avisos ────────────────────────────────────────────────────────
  function prioBadge(p) {
    const cls = p === 'urgente' ? 'prio-urgente' : p === 'importante' ? 'prio-importante' : 'prio-normal';
    return `<span class="prio ${cls}">${escapeHtml(p)}</span>`;
  }

  async function renderAnuncios() {
    const box = document.getElementById('anuncios-container');
    box.innerHTML = '<div class="sp-loading"><span class="spinner"></span> Cargando avisos…</div>';
    try {
      const anuncios = await window.API.soporte.anuncios();
      if (!anuncios.length) {
        box.innerHTML = '<div class="sp-empty">No hay avisos publicados.</div>';
        return;
      }
      box.innerHTML = `
        <div class="sp-card sp-table-wrap">
          <table class="mega-table">
            <thead><tr><th>Título</th><th>Mensaje</th><th>Prioridad</th><th>Autor</th><th>Fecha</th><th>Lecturas</th><th></th></tr></thead>
            <tbody>
              ${anuncios.map((a) => `
                <tr>
                  <td><strong>${escapeHtml(a.title)}</strong></td>
                  <td>${escapeHtml(a.message || '')}</td>
                  <td>${prioBadge(a.priority)}</td>
                  <td>${escapeHtml((a.author && (a.author.name || a.author.email)) || '—')}</td>
                  <td>${fmtDate(a.createdAt)}</td>
                  <td>${Array.isArray(a.readBy) ? a.readBy.length : 0}</td>
                  <td><button class="btn btn-danger btn-sm" data-aviso="${a._id}">Eliminar</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
      box.querySelectorAll('[data-aviso]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('¿Eliminar este aviso?')) return;
          try {
            await window.API.soporte.eliminarAnuncio(btn.dataset.aviso);
            renderAnuncios();
          } catch (error) { alert(error.message); }
        });
      });
    } catch (error) {
      box.innerHTML = `<div class="alert show alert-error">${escapeHtml(error.message)}</div>`;
    }
  }

  async function renderSolicitudesPassword() {
    const box = document.getElementById('solicitudes-password-container');
    if (!box) return;
    box.innerHTML = '<div class="sp-empty">Cargando solicitudes…</div>';
    try {
      const solicitudes = await window.API.soporte.solicitudesPassword();
      if (!solicitudes.length) {
        box.innerHTML = '<div class="sp-empty">No hay solicitudes de restablecimiento.</div>';
        return;
      }
      box.innerHTML = `
        <div class="sp-table-wrap">
          <table class="mega-table">
            <thead><tr><th>Asesor</th><th>Usuario / Correo</th><th>Fecha</th><th>Estado</th></tr></thead>
            <tbody>
              ${solicitudes.map((s) => `
                <tr>
                  <td><strong>${escapeHtml((s.data && s.data.nombre) || '—')}</strong></td>
                  <td>${escapeHtml((s.data && s.data.usuario) || '—')}</td>
                  <td>${fmtDate(s.createdAt)}</td>
                  <td>${s.read ? '<span class="prio prio-normal">Atendida</span>' : '<span class="prio prio-importante">Pendiente</span>'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (error) {
      box.innerHTML = `<div class="alert show alert-error">${escapeHtml(error.message)}</div>`;
    }
  }

  function initAnuncios() {
    const form = document.getElementById('anuncio-form');
    if (form) form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const alertBox = document.getElementById('anuncio-alert');
      hideAlert(alertBox);
      try {
        await window.API.soporte.crearAnuncio({
          title: data.get('title'),
          message: data.get('message'),
          priority: data.get('priority'),
        });
        form.reset();
        showAlert(alertBox, 'Aviso publicado correctamente.', 'success');
        setTimeout(() => hideAlert(alertBox), 3000);
        renderAnuncios();
      } catch (error) {
        showAlert(alertBox, error.message, 'error');
      }
    });
    renderAnuncios();
    renderSolicitudesPassword();
  }

  // ── Pestaña Roles y Permisos ──────────────────────────────────────────────
  async function renderRolesPermisos() {
    const box = document.getElementById('roles-container');
    box.innerHTML = '<div class="sp-loading"><span class="spinner"></span> Cargando roles…</div>';
    try {
      const { roles, permisos } = await window.API.soporte.rolesPermisos();

      box.innerHTML = `
        <div class="sp-card sp-table-wrap">
          <table class="mega-table">
            <thead><tr><th>Rol</th><th>Código</th><th>Descripción</th><th>Permisos</th><th>Estado</th></tr></thead>
            <tbody>
              ${roles.map((r) => `
                <tr>
                  <td><strong>${escapeHtml(r.name)}</strong></td>
                  <td><span class="role-chip">${escapeHtml(r.code)}</span></td>
                  <td>${escapeHtml(r.description || '—')}</td>
                  <td>${(r.permissions || []).length}</td>
                  <td>${r.isSystem ? '<span class="badge badge-role">Sistema</span>' : (r.status === 'activo' ? '<span class="badge badge-on">Activo</span>' : '<span class="badge badge-off">Inactivo</span>')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>

        <div class="sp-card">
          <h3 style="margin-bottom:14px;">Catálogo de permisos (${permisos.length})</h3>
          <div class="kv-grid">
            ${permisos.map((p) => `<div class="kv"><b style="font-size:13px;">${escapeHtml(p.name)}</b><span>${escapeHtml(p.module)} · ${escapeHtml(p.code)}</span></div>`).join('')}
          </div>
        </div>
      `;
    } catch (error) {
      box.innerHTML = `<div class="alert show alert-error">${escapeHtml(error.message)}</div>`;
    }
  }

  // ── Pestaña Logs (visor en tiempo real) ───────────────────────────────────
  let logLevel = null;      // null = todos, o 'ERROR' | 'WARN' | 'INFO'
  let logTimer = null;
  let logSocket = null;
  let logLiveCache = [];

  function logLevelClass(level) {
    if (level === 'ERROR') return 'error';
    if (level === 'WARN') return 'warn';
    return 'info';
  }

  function renderLogs(rows) {
    const box = document.getElementById('logs-container');
    if (!rows.length) {
      box.innerHTML = '<div class="sp-empty">No hay eventos registrados.</div>';
      return;
    }
    const filtered = logLevel ? rows.filter((r) => r.level === logLevel) : rows;
    if (!filtered.length) {
      box.innerHTML = `<div class="sp-empty">No hay eventos de nivel <b>${escapeHtml(logLevel)}</b>.</div>`;
      return;
    }
    box.innerHTML = `
      <div class="sp-card sp-logs">
        ${filtered.map((r) => `
          <div class="log-row">
            <span class="log-badge log-badge-${logLevelClass(r.level)}">${escapeHtml(r.level)}</span>
            <span class="log-time">${fmtDate(r.timestamp || r.createdAt)}</span>
            <span class="log-msg ${r.level === 'ERROR' ? 'error' : ''}">
              ${escapeHtml(r.message || r.action || '')}
              ${r.source ? `<small style="color:var(--text-muted)"> [${escapeHtml(r.source)}]</small>` : ''}
            </span>
            ${r.user && r.user.name ? `<span class="log-user">${escapeHtml(r.user.name)}</span>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  function applyLogFilter() {
    renderLogs(logLiveCache);
  }

  async function loadLogs() {
    const box = document.getElementById('logs-container');
    box.innerHTML = '<div class="sp-loading"><span class="spinner"></span> Cargando logs…</div>';
    try {
      const params = { limit: 100 };
      if (logLevel) params.level = logLevel;
      logLiveCache = await window.API.soporte.logsSistema(params);
      renderLogs(logLiveCache);
    } catch (error) {
      box.innerHTML = `<div class="alert show alert-error">${escapeHtml(error.message)}</div>`;
    }
  }

  function pushLiveLog(entry) {
    if (!entry) return;
    // Inserta en la cabecera y recorta a 100 entradas.
    logLiveCache.unshift(entry);
    if (logLiveCache.length > 100) logLiveCache.length = 100;
    if (logLevel && entry.level !== logLevel) return;
    const box = document.getElementById('logs-container');
    if (box) renderLogs(logLiveCache);
  }

  function initLogs() {
    const lvlBtns = {
      'all': document.getElementById('btn-log-lvl-all'),
      'ERROR': document.getElementById('btn-log-lvl-ERROR'),
      'WARN': document.getElementById('btn-log-lvl-WARN'),
      'INFO': document.getElementById('btn-log-lvl-INFO'),
    };
    function setActive() {
      Object.entries(lvlBtns).forEach(([key, btn]) => btn.classList.toggle('active', key === (logLevel || 'all')));
    }
    Object.entries(lvlBtns).forEach(([key, btn]) => {
      btn.addEventListener('click', () => {
        logLevel = key === 'all' ? null : key;
        setActive();
        loadLogs();
      });
    });

    document.getElementById('btn-logs-refresh').addEventListener('click', loadLogs);
    document.getElementById('btn-logs-clear').addEventListener('click', async () => {
      if (!confirm('¿Eliminar todos los logs del visor en tiempo real?')) return;
      try {
        await window.API.soporte.limpiarLogsSistema();
        logLiveCache = [];
        renderLogs([]);
      } catch (error) {
        alert(error.message);
      }
    });

    // Conexión en tiempo real: si hay Socket.io disponible se escucha el evento
    // 'server-log'; si no, se cae en un polling cada 4 segundos.
    try {
      if (window.io && typeof window.io === 'function') {
        logSocket = window.io(window.AppConfig.BASE_URL || window.AppConfig.API_URL, {
          transports: ['websocket', 'polling'],
          auth: { token: getToken() },
          reconnectionAttempts: 3,
        });
        logSocket.on('connect', () => logSocket.on('server-log', pushLiveLog));
        logSocket.on('disconnect', () => {});
      }
    } catch (e) { /* sin socket */ }

    if (!window.io || !logSocket) {
      logTimer = setInterval(loadLogs, 4000);
    }
  }

  // ── Pestaña Respaldo ──────────────────────────────────────────────────────
  function initRespaldo() {
    document.getElementById('btn-respaldo').addEventListener('click', async () => {
      const btn = document.getElementById('btn-respaldo');
      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = 'Generando respaldo…';
      try {
        const res = await window.API.soporte.respaldo();
        downloadBlob(res.blob, res.filename || `respaldo_${new Date().toISOString().slice(0, 10)}.json`);
      } catch (error) {
        alert(error.message || 'No se pudo generar el respaldo.');
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    });
  }

  // ── Pestaña Plantillas ────────────────────────────────────────────────────
  function renderPlantillas(list) {
    const box = document.getElementById('plantillas-container');
    if (!list.length) {
      box.innerHTML = '<div class="sp-empty">No hay plantillas PDF en ./plantillas.</div>';
      return;
    }
    box.innerHTML = `
      <div class="sp-card">
        <h3 style="margin-bottom:12px;">Plantillas actuales</h3>
        ${list.map((p) => `
          <div class="plantilla-row">
            <div style="min-width:0;">
              <div>${escapeHtml(p.archivo)}</div>
              <div class="plantilla-meta">${(p.tamaño / 1024).toFixed(1)} KB · ${fmtDate(p.modificado)}</div>
            </div>
            <div class="row-actions">
              <button class="btn btn-ghost btn-sm" data-pl="rename" data-f="${encodeURIComponent(p.archivo)}">Renombrar</button>
              <button class="btn btn-ghost btn-sm" data-pl="download" data-f="${encodeURIComponent(p.archivo)}">Descargar</button>
              <button class="btn btn-danger btn-sm" data-pl="delete" data-f="${encodeURIComponent(p.archivo)}">Eliminar</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    box.querySelectorAll('[data-pl]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const archivo = decodeURIComponent(btn.dataset.f);
        if (btn.dataset.pl === 'delete') {
          if (!confirm(`¿Eliminar la plantilla "${archivo}"?`)) return;
          try {
            await window.API.soporte.eliminarPlantilla(archivo);
            renderPlantillas(await window.API.soporte.plantillas());
          } catch (error) { alert(error.message); }
        } else if (btn.dataset.pl === 'rename') {
          renamePlantilla(archivo);
        } else {
          try {
            const blob = await window.API.soporte.descargarPlantilla(archivo);
            downloadBlob(blob, archivo);
          } catch (error) { alert(error.message); }
        }
      });
    });
  }

  async function renamePlantilla(archivo) {
    const name = await prompt('Nuevo nombre de la plantilla (debe terminar en .pdf):', archivo);
    if (name === null || !name.trim()) return;
    try {
      await window.API.soporte.renombrarPlantilla(archivo, name.trim());
      await loadPlantillas();
      alert('Plantilla renombrada correctamente.');
    } catch (error) {
      alert(error.message);
    }
  }

  async function loadPlantillas() {
    const box = document.getElementById('plantillas-container');
    box.innerHTML = '<div class="sp-loading"><span class="spinner"></span> Cargando plantillas…</div>';
    try {
      renderPlantillas(await window.API.soporte.plantillas());
    } catch (error) {
      box.innerHTML = `<div class="alert show alert-error">${escapeHtml(error.message)}</div>`;
    }
  }

  function initPlantillas() {
    document.getElementById('btn-subir-plantilla').addEventListener('click', async () => {
      const input = document.getElementById('input-plantilla');
      const file = input.files && input.files[0];
      if (!file) { alert('Selecciona un archivo PDF primero.'); return; }
      if (!/\.pdf$/i.test(file.name)) { alert('Solo se permiten archivos PDF.'); return; }
      const btn = document.getElementById('btn-subir-plantilla');
      btn.disabled = true;
      btn.textContent = 'Subiendo…';
      try {
        await window.API.soporte.subirPlantilla(file);
        input.value = '';
        await loadPlantillas();
        alert('Plantilla subida correctamente.');
      } catch (error) {
        alert(error.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Subir PDF';
      }
    });
  }

  // ── Pestaña Chat Interno ──────────────────────────────────────────────────
  let chatListCache = [];
  let activeChatId = null;
  let chatReloadTimer = null;
  let soporteUserId = null;

  function chatParticipantName(chat) {
    if (!chat || !chat.type) return 'Chat';
    if (chat.name) return chat.name;
    const me = String(soporteUserId || '');
    const other = (chat.participants || []).find((p) => p && p._id && String(p._id) !== me);
    return (other && (other.name || other.username)) || 'Chat';
  }

  function renderChatList() {
    const root = document.getElementById('sp-chat-root');
    const list = chatListCache;
    root.innerHTML = `
      <div class="sp-chat">
        <div class="sp-chat-list">
          <div class="sp-loading" style="display:none" id="sp-chat-loading"><span class="spinner"></span> Cargando chats…</div>
          <div id="sp-chat-items">
            ${list.length ? list.map((chat) => `
              <button class="sp-chat-item ${chat._id === activeChatId ? 'active' : ''}" data-chat="${chat._id}">
                <div class="name">${escapeHtml(chatParticipantName(chat))}</div>
                <div class="meta">${chat.type === 'grupal' ? 'Grupal' : 'Directo'}${chat.lastMessageAt ? ' · ' + fmtDate(chat.lastMessageAt) : ''}</div>
                <div class="last">${escapeHtml(chat.lastMessage || 'Sin mensajes')}</div>
              </button>
            `).join('') : '<div class="sp-empty">No hay chats disponibles.</div>'}
          </div>
        </div>
        <div class="sp-chat-win">
          <div class="sp-chat-win-head">
            <strong id="sp-chat-win-title">Selecciona un chat</strong>
            <button class="btn btn-ghost" id="sp-chat-refresh" type="button">&#8635; Actualizar</button>
          </div>
          <div class="sp-chat-msgs" id="sp-chat-msgs">
            <div class="sp-empty">Elige una conversación para ver y responder los mensajes.</div>
          </div>
          <div class="sp-chat-input">
            <textarea id="sp-chat-text" placeholder="Escribe un mensaje…" disabled></textarea>
            <button class="btn btn-gold" id="sp-chat-send" type="button" disabled>Enviar</button>
          </div>
        </div>
      </div>
    `;

    root.querySelectorAll('[data-chat]').forEach((btn) => {
      btn.addEventListener('click', () => openChat(btn.dataset.chat));
    });
    document.getElementById('sp-chat-refresh').addEventListener('click', loadChatList);

    const sendBtn = document.getElementById('sp-chat-send');
    const textEl = document.getElementById('sp-chat-text');
    const doSend = async () => {
      const text = textEl.value.trim();
      if (!text || !activeChatId) return;
      sendBtn.disabled = true;
      try {
        await window.API.soporte.enviarMensajeChat(activeChatId, { message: text });
        textEl.value = '';
        textEl.focus();
        renderChatDetail(await window.API.soporte.verChat(activeChatId));
        loadChatList(true);
      } catch (error) {
        alert(error.message);
      } finally {
        sendBtn.disabled = false;
      }
    };
    sendBtn.addEventListener('click', doSend);
    textEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
    });
  }

  async function renderChatDetail(chat) {
    const titleEl = document.getElementById('sp-chat-win-title');
    const msgsEl = document.getElementById('sp-chat-msgs');
    const textEl = document.getElementById('sp-chat-text');
    const sendBtn = document.getElementById('sp-chat-send');
    if (!titleEl) return;

    titleEl.textContent = chatParticipantName(chat);
    const me = String(soporteUserId || '');
    const msgs = (chat.messages || []).map((m) => {
      const sender = m.sender || {};
      const mine = String(m.emisor || (sender._id || '')) === me || String(sender._id || '') === me;
      const sentBy = sender && (sender.name || sender.username) || 'Usuario';
      return `
        <div class="sp-msg ${mine ? 'mine' : 'theirs'}">
          <div class="head">${mine ? 'Tú' : escapeHtml(sentBy)}<span class="t">${fmtDate(m.createdAt)}</span></div>
          <div>${escapeHtml(m.message || m.text || '')}</div>
        </div>`;
    }).join('');

    msgsEl.innerHTML = msgs ? msgs : '<div class="sp-empty">Sin mensajes todavía.</div>';
    msgsEl.scrollTop = msgsEl.scrollHeight;

    textEl.disabled = !chat;
    sendBtn.disabled = !chat;
    if (chat) {
      window.API.soporte.marcarLeidoChat(chat._id).catch(() => {});
    }
  }

  async function openChat(chatId) {
    activeChatId = chatId;
    renderChatList();
    const msgsEl = document.getElementById('sp-chat-msgs');
    if (msgsEl) msgsEl.innerHTML = '<div class="sp-loading"><span class="spinner"></span> Cargando conversación…</div>';
    try {
      const chat = await window.API.soporte.verChat(chatId);
      renderChatDetail(chat);
      loadChatList(true);
    } catch (error) {
      const el = document.getElementById('sp-chat-msgs');
      if (el) el.innerHTML = `<div class="alert show alert-error">${escapeHtml(error.message)}</div>`;
    }
  }

  async function loadChatList(silent) {
    const textEl = document.getElementById('sp-chat-text');
    // No interrumpir al usuario mientras escribe en un refresco silencioso.
    if (silent && textEl && document.activeElement === textEl) return;

    if (!silent) {
      const loading = document.getElementById('sp-chat-loading');
      if (loading) loading.style.display = 'flex';
    }
    try {
      chatListCache = await window.API.soporte.chats();
      // Si un chat está abierto, refrescar detalles en segundo plano.
      if (activeChatId) {
        const chat = await window.API.soporte.verChat(activeChatId).catch(() => null);
        if (chat && document.getElementById('sp-chat-win-title')) renderChatDetail(chat);
      }
      renderChatList();
    } catch (error) {
      /* mantener estado actual */
    } finally {
      const loading = document.getElementById('sp-chat-loading');
      if (loading) loading.style.display = 'none';
    }
  }

  function initChat() {
    const me = getSavedUser() || {};
    soporteUserId = me.id || null;
    loadChatList();
    chatReloadTimer = setInterval(() => loadChatList(true), 15000);
  }

  // ── Inicio / autenticación ────────────────────────────────────────────────
  async function refreshSession() {
    try {
      const data = await window.API.soporte.me();
      saveSession(getToken(), data);
      return data;
    } catch (error) {
      return null;
    }
  }

  // ── Modo mantenimiento ────────────────────────────────────────────────────
  function showAlert2(element, boxId, message, type) {
    const box = document.getElementById(boxId);
    if (!box) return;
    box.className = `alert show alert-${type}`;
    box.textContent = message;
    setTimeout(() => { box.className = 'alert'; box.textContent = ''; }, 3000);
  }

  async function renderMantenimiento() {
    const track = document.getElementById('mt-switch');
    const label = document.getElementById('mt-label');
    const input = document.getElementById('mt-mensaje');
    const hastaInput = document.getElementById('mt-hasta');
    const fechaInput = document.getElementById('mt-fecha');
    const avisoInput = document.getElementById('mt-aviso');
    try {
      const state = await window.API.soporte.mantenimiento();
      const activo = Boolean(state && state.activo);
      track.classList.toggle('on', activo);
      track.setAttribute('aria-checked', String(activo));
      label.innerHTML = activo
        ? '<span class="st">ON · Sistema en mantenimiento</span>'
        : '<span class="off">OFF</span>';
      if (input && document.activeElement !== input) input.value = (state && state.mensaje) || '';
      if (hastaInput && document.activeElement !== hastaInput) {
        hastaInput.value = toDatetimeLocal(state && state.hasta) || '';
      }
      if (fechaInput && document.activeElement !== fechaInput) {
        fechaInput.value = toDatetimeLocal(state && state.fechaProgramada) || '';
      }
      if (avisoInput) avisoInput.checked = Boolean(state && state.mostrarAvisoPrevio);
    } catch (error) {
      /* mantener estado actual */
    }
  }

  // Convierte un ISO string a valor aceptado por <input type="datetime-local">
  // (YYYY-MM-DDTHH:mm) en la zona horaria local.
  function toDatetimeLocal(value) {
    if (!value) return '';
    const d = new Date(String(value));
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function initMantenimiento() {
    const track = document.getElementById('mt-switch');
    const input = document.getElementById('mt-mensaje');
    const hastaInput = document.getElementById('mt-hasta');
    const fechaInput = document.getElementById('mt-fecha');
    const avisoInput = document.getElementById('mt-aviso');
    if (!track) return;

    const save = async (activo, message) => {
      track.disabled = true;
      showAlert2(track, 'mt-alert', 'Guardando…', 'success');
      try {
        const body = { activo };
        const msg = input ? input.value.trim() : '';
        body.mensaje = msg;
        // Convierte el valor datetime-local a ISO (o vacío si no se definió).
        body.hasta = hastaInput && hastaInput.value ? new Date(hastaInput.value).toISOString() : '';
        // Programación del inicio automático + aviso previo.
        body.fechaProgramada = fechaInput && fechaInput.value ? new Date(fechaInput.value).toISOString() : '';
        body.mostrarAvisoPrevio = avisoInput ? avisoInput.checked : false;
        await window.API.soporte.cambiarMantenimiento(body);
        showAlert2(track, 'mt-alert', message, activo ? 'warning' : 'success');
      } catch (error) {
        showAlert2(track, 'mt-alert', error.message, 'error');
      } finally {
        track.disabled = false;
        renderMantenimiento();
      }
    };

    track.addEventListener('click', async () => {
      const activo = !track.classList.contains('on');
      await save(activo, activo
        ? 'Mantenimiento activado. La app queda bloqueada para todos; solo Soporte Técnico conserva acceso.'
        : 'Mantenimiento desactivado.');
    });

    // Aplicar la programación (inicio + aviso) sin apagar/encender el switch.
    const scheduleFields = [fechaInput, avisoInput];
    scheduleFields.forEach((el) => {
      if (!el) return;
      el.addEventListener('change', () => {
        const activo = track.classList.contains('on');
        save(activo, 'Configuración programada guardada.');
      });
    });

    renderMantenimiento();
  }

  // ── Pestaña Guía ─────────────────────────────────────────────────────────
  function guiaCard(icon, title, steps, extraClass) {
    const items = (steps || []).map((s) =>
      `<li><b>${escapeHtml(s.title)}</b><span>${s.text}</span></li>`
    ).join('');
    return `
      <div class="sp-card ${extraClass || ''}">
        <h3 style="margin-bottom:12px;color:var(--gold);">${icon}&nbsp; ${escapeHtml(title)}</h3>
        <ul class="guia-list">${items}</ul>
      </div>`;
  }

  function renderGuia() {
    const box = document.getElementById('guia-container');
    if (!box) return;

    const mantenimiento = guiaCard('&#128681;&#65039;', 'Modo mantenimiento', [
      { title: 'Activarlo / desactivarlo', text: 'Usa el interruptor del panel Resumen o esta guía. Al activarlo, el bloqueo se aplica: ADMIN y SUPERADMIN conservan acceso; Asesores/Operadores ven la cuenta regresiva y luego la pantalla de mantenimiento.' },
      { title: 'Mensaje y fin estimado', text: 'Puedes escribir el mensaje que verán los usuarios y programar una fecha/hora estimada de fin. Se muestran en la pantalla de mantenimiento y en el login.' },
      { title: 'Cómo revertirlo', text: 'Entra al panel de soporte e inicia sesión (sigue permitido durante el mantenimiento) y apaga el interruptor.' },
    ]);

    const sesiones = guiaCard('&#128275;&#65039;', 'Gestión de sesiones', [
      { title: 'Ver usuarios conectados', text: 'La pestaña Sesiones muestra Nombre, Rol, IP, última actividad y estado de cada sesión activa.' },
      { title: 'Cerrar sesión forzada', text: 'Pulsa «Cerrar Sesión» en cualquier fila para revocar el token de ese dispositivo de inmediato.' },
      { title: 'Recomendación de seguridad', text: 'Al detectar un acceso sospechoso, cierra la sesión y restablece la contraseña del usuario desde la pestaña Usuarios.' },
    ]);

    const logs = guiaCard('&#128220;', 'Logs y errores en tiempo real', [
      { title: 'Últimos 100 registros', text: 'El visor lee el buffer del servidor: errores de consultas, caídas de Socket.io y fallas de PDFs.' },
      { title: 'Filtrar por nivel', text: 'Usa los botones ERROR / WARN / INFO para aislar el tipo de evento. Se actualiza en vivo vía Socket.io (con polling de respaldo).' },
      { title: 'Limpiar buffer', text: 'El botón «Limpiar Logs» vacía el visor en memoria. Los eventos persisten en ActivityLog/Historial de actividad para auditoría.' },
    ]);

    const pdfs = guiaCard('&#128196;', 'Plantillas PDF', [
      { title: 'Subir formato', text: 'Selecciona un archivo .pdf y pulsa «Subir PDF». Se guarda en ./plantillas sin tocar el servidor.' },
      { title: 'Renombrar', text: 'Pulsa «Renombrar», escribe el nuevo nombre (debe terminar en .pdf) y confirma.' },
      { title: 'Descargar / Eliminar', text: 'Descarga el PDF en blanco o elimínalo del gestor de plantillas directamente.' },
    ]);

    const soporte = guiaCard('&#128172;', 'Atención al equipo (Chat)', [
      { title: 'Ver y responder chats', text: 'La pestaña Chat Interno lista todas las conversaciones; el soporte puede responder en cualquiera.' },
      { title: 'Avisos', text: 'Publica anuncios (normal/importante/urgente) que aparecerán como banners para todos los usuarios.' },
      { title: 'Solicitudes de contraseña', text: 'Desde la pestaña Avisos atiende los pedidos de «Olvidé mi contraseña» y restablece el acceso.' },
    ]);

    const respaldo = guiaCard('&#128190;', 'Respaldos', [
      { title: 'Generar backup', text: 'La pestaña Respaldos descarga un JSON completo con todas las colecciones y conteos por módulo.' },
      { title: 'Frecuencia sugerida', text: 'Genera un respaldo periódicamente antes de cambios importantes para poder restaurar información.' },
    ]);

    box.innerHTML = `
      <div class="guia-grid">
        ${mantenimiento}
        ${sesiones}
        ${logs}
        ${pdfs}
        ${soporte}
        ${respaldo}
      </div>
    `;
  }

  async function init() {
    const token = getToken();
    if (!token) {
      window.location.replace('index.html');
      return;
    }

    const session = await refreshSession();
    if (!session) {
      clearSession();
      window.location.replace('index.html');
      return;
    }

    const nameEl = document.getElementById('sp-user-name');
    const photoEl = document.getElementById('sp-user-photo');
    if (nameEl) nameEl.textContent = (session && session.name) || (getSavedUser() || {}).name || 'Soporte';
    if (photoEl && session && session.photo) photoEl.src = session.photo;
    else if (photoEl) photoEl.style.display = 'none';

    document.getElementById('btn-sp-logout').addEventListener('click', async () => {
      try { await window.API.soporte.logout(); } catch (e) { /* ignore */ }
      clearSession();
      window.location.replace('index.html');
    });

    initTabs();
    initLogs();
    initRespaldo();
    initPlantillas();
    initSesiones();
    initAnuncios();
    initChat();
    initMantenimiento();

    renderResumen();
    renderGuia();
    renderUsuarios();
    renderConfig();
    renderRolesPermisos();
    loadLogs();
    loadPlantillas();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => window.SoportePanel.init());
