const { Router } = require('express');
const { db } = require('../db/database');
const { send, error } = require('../utils/response');
const { verifyPassword } = require('../auth/password');
const { crearToken, requireAuth } = require('../auth/token');
const logger = require('../observability/logger');

const router = Router();

// POST /api/auth/login  { email, password } -> { token, usuario }
router.post('/login', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) return error(res, 400, 'El correo y la contraseña son obligatorios.');

  const usuario = db.prepare('SELECT id, nombre, email, rol, password_hash FROM usuarios WHERE email = ?').get(email);
  if (!usuario || !verifyPassword(password, usuario.password_hash)) {
    logger.warn('login_fallido', { email });
    return error(res, 401, 'Correo o contraseña incorrectos.');
  }

  const { password_hash, ...publico } = usuario;
  logger.info('login_exitoso', { email, usuario_id: usuario.id });
  send(res, 200, [{ token: crearToken(publico), usuario: publico }]);
});

// GET /api/auth/me -> datos del usuario del token
router.get('/me', requireAuth, (req, res) => {
  const usuario = db.prepare('SELECT id, nombre, email, rol FROM usuarios WHERE id = ?').get(req.usuario.id);
  if (!usuario) return error(res, 401, 'La cuenta ya no existe.');
  send(res, 200, [usuario]);
});

module.exports = router;
