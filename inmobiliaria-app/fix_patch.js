const fs = require('fs');
const p = 'C:/Users/oralia/OneDrive/Escritorio/paginas/INMOBILIARIA/backend/src/controllers/userRequest.controller.js';
let c = fs.readFileSync(p, 'utf8');
if (!c.includes('sendMail')) {
  c = c.replace("const { logAudit } = require('../services/log.service');",
    "const { logAudit } = require('../services/log.service');\nconst { sendMail } = require('../services/mail.service');\nconst { generatePassword } = require('../utils/password');");
  fs.writeFileSync(p, c);
  console.log('done');
} else {
  console.log('exists');
}
