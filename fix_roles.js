const fs = require('fs');
const p = 'C:/Users/oralia/OneDrive/Escritorio/paginas/INMOBILIARIA/frontend/pages/settings/settings.js';
let c = fs.readFileSync(p, 'utf8');
const old = `    function renderRoles() {
      if (!isAdmin) return renderAdminOnly();
      API.roles.list().then((result) => {
        const rows = result
          .map((r) => \`
            <tr>
              <td><strong>\${UI.escapeHtml(r.name)}</strong><br><small class="text-muted">\${UI.escapeHtml(r.description || '')}</small></td>
              <td>\${UI.escapeHtml(r.code)}</td>
              <td>\${r.permissions ? r.permissions.length : 0} permisos</td>
              <td>\${UI.statusBadge(r.status)}</td>
            </tr>\`)
          .join('');

        tabContent.innerHTML = \`
          <div class="table-wrapper card">
            <table class="table">
              <thead><tr><th>Rol</th><th>Código</th><th>Permisos</th><th>Estado</th></tr></thead>
              <tbody>\${rows || '<tr><td colspan="4" class="text-muted">Sin roles</td></tr>'}</tbody>
            </table>
          </div>
        \`;
      }).catch((error) => {
        tabContent.innerHTML = UI.errorAlert(error.message);
      });
    }`;
const neu = `    function renderRoles() {
      if (!isAdmin) return renderAdminOnly();
      API.roles.list().then((result) => {
        const rows = result
          .map((r) => \`
            <tr>
              <td><strong>\${UI.escapeHtml(r.name)}</strong><br><small class="text-muted">\${UI.escapeHtml(r.description || '')}</small></td>
              <td>\${UI.escapeHtml(r.code)}</td>
              <td>\${r.permissions ? r.permissions.length : 0} permisos</td>
              <td>\${UI.statusBadge(r.status)}</td>
              <td>\${r.isSystem ? '' : '<button class="btn btn-danger btn-sm" data-role-del="' + r._id + '">Eliminar</button>'}</td>
            </tr>\`)
          .join('');

        tabContent.innerHTML = \`
          <div class="table-wrapper card">
            <table class="table">
              <thead><tr><th>Rol</th><th>Código</th><th>Permisos</th><th>Estado</th><th></th></tr></thead>
              <tbody>\${rows || '<tr><td colspan="5" class="text-muted">Sin roles</td></tr>'}</tbody>
            </table>
          </div>
        \`;
        tabContent.querySelectorAll('[data-role-del]').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('¿Eliminar este rol?')) return;
            try { await API.roles.remove(btn.dataset.roleDel); UI.toast('Rol eliminado', 'success'); renderRoles(); }
            catch (e) { UI.toast(e.message, 'error'); }
          });
        });
      }).catch((error) => {
        tabContent.innerHTML = UI.errorAlert(error.message);
      });
    }`;
if (c.includes(old)) {
  c = c.replace(old, neu);
  fs.writeFileSync(p, c);
  console.log('done');
} else {
  console.log('skip');
}
