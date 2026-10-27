const fs = require('fs');
const files = ['index.html', 'home.html', 'dashboard.html', 'properties.html', 'clients.html', 'inventory.html', 'appointments.html', 'businesses.html', 'chat.html', 'calendar.html', 'settings.html'];
const dir = 'C:/Users/oralia/OneDrive/Escritorio/paginas/INMOBILIARIA/frontend/';
for (const f of files) {
  const p = dir + f;
  if (!fs.existsSync(p)) continue;
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes('LOGOICONO.jpeg')) {
    // Add in head
    c = c.replace(/<head[^>]*>/i, function(m){ return m + '\n  <link rel="icon" type="image/jpeg" href="LOGOICONO.jpeg">\n  <link rel="shortcut icon" type="image/jpeg" href="LOGOICONO.jpeg">\n  <link rel="apple-touch-icon" href="LOGOICONO.jpeg">'; });
    fs.writeFileSync(p, c);
    console.log('updated', f);
  }
}
