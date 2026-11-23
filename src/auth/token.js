const crypto = require('crypto');
const { error } = require('../utils/response');

/*
 * Token firmado con HMAC-SHA256 (mismo principio que un JWT HS256):
 *   base64url(payload) + "." + base64url(firma)
 * La llave se lee de JWT_SECRET; si no existe se genera una al arrancar.
 */
const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const DURACION_MS = 8 * 60 * 60 * 1000; // 8 horas

const firmar = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

function crearToken(usuario) {
  const payload = Buffer.from(
    JSON.stringify({ id: usuario.id, email: usuario.email, rol: usuario.rol, exp: Date.now() + DURACION_MS })
  ).toString('base64url');
  return `${payload}.${firmar(payload)}`;
}

function verificarToken(token) {
  const [payload, firma] = String(token || '').split('.');
  if (!payload || !firma) return null;
  const esperada = firmar(payload);
  if (firma.length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null;
  try {
    const datos = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return datos.exp > Date.now() ? datos : null;
  } catch {
    return null;
  }
}

// Middleware: exige el encabezado "Authorization: Bearer <token>"
function requireAuth(req, res, next) {
  const [tipo, token] = String(req.headers.authorization || '').split(' ');
  const datos = tipo === 'Bearer' ? verificarToken(token) : null;
  if (!datos) return error(res, 401, 'No autorizado: inicia sesión para continuar.');
  req.usuario = datos;
  next();
}

module.exports = { crearToken, verificarToken, requireAuth };
