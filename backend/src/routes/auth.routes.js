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
} = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth');
const { loginRules, registerRules, updateMeRules } = require('../validators/auth.validators');

const router = Router();

// Límite estricto SOLO para autenticación: frena ataques de fuerza bruta
// sin afectar el límite global del resto de la API.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Demasiados intentos de acceso. Espera 15 minutos y vuelve a intentarlo.',
  },
});

router.post('/login', authLimiter, loginRules, login);
router.post('/register', authLimiter, registerRules, register);
router.post('/check-register-key', authLimiter, checkRegisterKey);
router.post('/google', authLimiter, registerGoogle);
router.get('/me', protect, me);
router.put('/me', protect, updateMeRules, updateMe);
router.post('/logout', protect, logout);
router.patch('/onboarding-complete', protect, completeOnboarding);
router.post('/change-password', protect, changePassword);

module.exports = router;
