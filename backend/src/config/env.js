'use strict';

const dotenv = require('dotenv');

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// En producción se exige configuración real: nunca usar valores por defecto inseguros.
if (isProduction) {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI es obligatorio en producción.');
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret-change-me') {
    throw new Error('JWT_SECRET debe configurarse con un valor seguro en producción.');
  }
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  mongodbUri:
    process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_inmobiliario',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  jwtRememberExpiresIn: process.env.JWT_REMEMBER_EXPIRES_IN || '30d',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  // Credenciales OAuth para Google Calendar (integración de calendario).
  googleCalendarClientId: process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '',
  googleCalendarClientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '',
  googleCalendarRedirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI || '',
  // Lista separada por comas de orígenes adicionales con acceso a la API
  // (p. ej. Live Server). El frontend servido por el propio backend no
  // necesita CORS. Vacío = solo mismo origen.
  clientUrl: process.env.CLIENT_URL || '',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@inmobiliaria.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'CambiaEsto2026!',
  // Correo saliente (newsletter, bienvenidas y avisos). Si no hay SMTP
  // configurado el servicio opera en modo "dry-run": registra el correo en la
  // consola sin enviarlo, para no romper la app en desarrollo.
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: parseInt(process.env.SMTP_PORT, 10) || 587,
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpSecure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
  mailFrom: process.env.MAIL_FROM || 'INMOBLES <no-responder@inmobles.com>',
  loginMaxAttempts: parseInt(process.env.LOGIN_MAX_ATTEMPTS, 10) || 5,
  loginLockMinutes: parseInt(process.env.LOGIN_LOCK_MINUTES, 10) || 15,
  supportEmail: process.env.SUPPORT_EMAIL || 'soporte@inmobiliaria.com',
  supportPassword: process.env.SUPPORT_PASSWORD || 'Soporte2026!',
  // Web Push (notificaciones nativas en Android/iOS/escritorio).
  // Genera las llaves con:  node -e "console.log(require('web-push').generateVapidKeys())"
  // o con el motor integrado: node -e "console.log(require('./src/services/webpush.engine').generateVapidKeys())"
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:soporte@inmobiliaria.com',
  isProduction,
};

module.exports = env;
