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
              <div class="fgroup">
                <label>Estado de mantenimiento</label>
                <select name="mantenimiento.on">
                  <option value="false" ${String(def('mantenimiento.on', 'false')) === 'false' ? 'selected' : ''}>OFF</option>
                  <option value="true" ${String(def('mantenimiento.on', 'false')) === 'true' ? 'selected' : ''}>ON</option>
                </select>
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
          'mantenimiento.on',
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
              <th>Usuario</th><th>Dispositivo</th><th>Duración</th><th>IP</th><th>Última actividad</th><th>Expira</th><th>Estado</th><th></th>
            </tr></thead>
            <tbody>
              ${sesiones.map((s) => {
                const u = s.user || {};
                const isCurrent = s.isCurrent;
                return `
                  <tr>
                    <td>
                      <strong>${escapeHtml(u.name || 'Usuario')}</strong>
                      ${isCurrent ? ' <span class="badge badge-role">actual</span>' : ''}
                      <br><small class="text-muted">${escapeHtml(u.email || '')}</small>
                    </td>
                    <td>${escapeHtml(deviceLabel(s.device))}</td>
                    <td>${s.remember ? '<span class="badge badge-on">Recordada</span>' : '<span class="badge badge-off">Temporal</span>'}</td>
                    <td>${escapeHtml(s.ip || '—')}</td>
                    <td>${fmtDate(s.lastSeenAt)}</td>
                    <td>${fmtDate(s.expiresAt)}</td>
                    <td>${isCurrent ? '<span class="badge badge-role">Este panel</span>' : '<span class="badge badge-on">Activa</span>'}</td>
                    <td><button class="btn btn-danger btn-sm" data-rs="${s._id}" ${isCurrent ? 'disabled' : ''}>Cerrar</button></td>
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

  // ── Pestaña Logs ──────────────────────────────────────────────────────────
  function renderLogs(rows, showUser = false) {
    const box = document.getElementById('logs-container');
    if (!rows.length) {
      box.innerHTML = '<div class="sp-empty">No hay eventos registrados.</div>';
      return;
    }
    box.innerHTML = `
      <div class="sp-card sp-logs">
        ${rows.map((r) => `
          <div class="log-row">
            <span class="log-time">${fmtDate(r.createdAt)}</span>
            <span class="log-msg ${isError(r) ? 'error' : ''}"><b>${escapeHtml(r.action)}</b> — ${escapeHtml(r.message || '')}</span>
            ${showUser && r.user ? `<span class="log-user">${escapeHtml(r.user.name || r.user.email)}</span>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  function isError(r) {
    return /error|fallido|fail/i.test(String(r.action) + ' ' + String(r.message));
  }

  async function loadLogs(mode) {
    const box = document.getElementById('logs-container');
    box.innerHTML = '<div class="sp-loading"><span class="spinner"></span> Cargando logs…</div>';
    try {
      const params = { limit: 50 };
      const data = mode === 'errors'
        ? await window.API.soporte.logsErrores(params)
        : await window.API.soporte.logs(params);
      renderLogs(data, true);
    } catch (error) {
      box.innerHTML = `<div class="alert show alert-error">${escapeHtml(error.message)}</div>`;
    }
  }

  function initLogs() {
    let mode = 'todos';
    const btnTodos = document.getElementById('btn-logs-todos');
    const btnErrores = document.getElementById('btn-logs-errores');
    function setButtons(m) {
      btnTodos.classList.toggle('active', m === 'todos');
      btnErrores.classList.toggle('active', m === 'errors');
    }
    btnTodos.addEventListener('click', () => { mode = 'todos'; setButtons(mode); loadLogs(mode); });
    btnErrores.addEventListener('click', () => { mode = 'errors'; setButtons(mode); loadLogs(mode); });
    document.getElementById('btn-logs-refresh').addEventListener('click', () => loadLogs(mode));
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
        } else {
          try {
            const blob = await window.API.soporte.descargarPlantilla(archivo);
            downloadBlob(blob, archivo);
          } catch (error) { alert(error.message); }
        }
      });
    });
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

    renderResumen();
    renderUsuarios();
    renderConfig();
    renderRolesPermisos();
    loadLogs('todos');
    loadPlantillas();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => window.SoportePanel.init());
