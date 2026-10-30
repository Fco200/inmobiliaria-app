'use strict';

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const {
  login,
  logout,
  me,
  updateMe,
  register,
  checkRegisterKey,
  registerGoogle,
  completeOnboarding,
  changePassword,
  forgotPassword,
} = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth');
const { loginRules, registerRules, updateMeRules } = require('../validators/auth.validators');

const router = Router();

// Límite estricto SOLO para autenticación: frena ataques de fuerza bruta
// sin afectar el límite global del resto de la API.
//
// OFICINA CON 50+ PERSONAS (NAT): toda la empresa sale a Internet por la
// MISMA dirección IP, así que el límite no puede medirse solo por IP: con 20
// intentos fallidos de un compañero, el inicio de sesión quedaba bloqueado
// para TODO el equipo durante 15 minutos. Por eso ahora hay DOS cubos:
//
//   1) Por IP: alto (120). Corta al atacante que prueba muchos correos
//      distintos desde una sola máquina, sin estorbar a la oficina entera.
//   2) Por cuenta: bajo (10). Corta el ataque dirigido a UNA cuenta, sin
//      que el error de tecleo de una persona afecte a las demás.
//
// Los dos cuentan SOLO los intentos fallidos (`skipSuccessfulRequests`):
// un inicio de sesión correcto nunca suma al cubo, así que 50 personas
// entrando a la vez no se bloquean entre sí.
const authIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_MAX_IP || 120),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `ip:${req.ip}`,
  message: {
    success: false,
    message: 'Demasiados intentos de acceso desde este dispositivo. Espera 15 minutos y vuelve a intentarlo.',
  },
});

const authAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_MAX_ACCOUNT || 10),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const body = req.body || {};
    const email = String(body.email || body.correo || body.usuario || '')
      .trim()
      .toLowerCase();
    return email ? `acct:${email}` : `ip:${req.ip}`;
  },
  message: {
    success: false,
    message: 'Demasiados intentos con esta cuenta. Espera 15 minutos y vuelve a intentarlo.',
  },
});

// Límite extra para el recuperación de contraseña: se cuenta por CORREO (no
// por IP) para que nadie pueda bombardear el buzón de un asesor.
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = String((req.body && (req.body.email || req.body.correo)) || '')
      .trim()
      .toLowerCase();
    return email ? `fp:${email}` : `ip:${req.ip}`;
  },
  message: {
    success: false,
    message: 'Ya se enviaron varios correos de recuperación. Espera una hora e inténtalo de nuevo.',
  },
});

const authLimits = [authIpLimiter, authAccountLimiter];

router.post('/login', ...authLimits, loginRules, login);
router.post('/register', ...authLimits, registerRules, register);
router.post('/check-register-key', authIpLimiter, checkRegisterKey);
router.post('/google', authIpLimiter, registerGoogle);
router.post('/forgot-password', forgotPasswordLimiter, authIpLimiter, forgotPassword);
router.get('/me', protect, me);
router.put('/me', protect, updateMeRules, updateMe);
router.post('/logout', protect, logout);
router.patch('/onboarding-complete', protect, completeOnboarding);
router.post('/change-password', protect, changePassword);

module.exports = router;
