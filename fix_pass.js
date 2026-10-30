const fs = require('fs');
const p = 'C:/Users/oralia/OneDrive/Escritorio/paginas/INMOBILIARIA/backend/src/controllers/userRequest.controller.js';
let c = fs.readFileSync(p, 'utf8');
if (!c.includes('generatePassword')) {
  c = c.replace("const { sendMail } = require('../services/mail.service');",
    "const { sendMail } = require('../services/mail.service');\nconst { generatePassword } = require('../utils/password');");
  fs.writeFileSync(p, c);
  console.log('added');
} else {
  console.log('ok');
}
