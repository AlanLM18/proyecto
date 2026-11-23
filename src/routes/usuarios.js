const { Router } = require('express');
const { db } = require('../db/database');
const { send, error } = require('../utils/response');
const { hashPassword } = require('../auth/password');
const { requireAuth } = require('../auth/token');

const router = Router();
router.use(requireAuth); // Todo el CRUD de usuarios requiere sesión iniciada

const COLUMNAS = 'id, nombre, email, rol, creado_en AS creadoEn';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['admin', 'editor'];

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    error(res, 400, 'Id inválido.');
    return null;
  }
  return id;
}

/** Valida el cuerpo. En la actualización la contraseña es opcional. */
function validar(body, { passwordObligatoria }) {
  const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const rol = body?.rol ?? 'editor';
  const errores = [];

  if (nombre.length < 2 || nombre.length > 100) errores.push('El nombre debe tener entre 2 y 100 caracteres.');
  if (!EMAIL_RE.test(email) || email.length > 150) errores.push('El correo electrónico no es válido.');
  if ((passwordObligatoria || password) && password.length < 6)
    errores.push('La contraseña debe tener al menos 6 caracteres.');
  if (!ROLES.includes(rol)) errores.push('El rol debe ser "admin" o "editor".');

  return { errores, nombre, email, password, rol };
}

// GET /api/usuarios
router.get('/', (req, res) => {
  send(res, 200, db.prepare(`SELECT ${COLUMNAS} FROM usuarios ORDER BY id`).all());
});

// GET /api/usuarios/:id
router.get('/:id', (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  const usuario = db.prepare(`SELECT ${COLUMNAS} FROM usuarios WHERE id = ?`).get(id);
  if (!usuario) return error(res, 404, `No existe un usuario con Id ${id}.`);
  send(res, 200, [usuario]);
});

// POST /api/usuarios
router.post('/', (req, res) => {
  const { errores, nombre, email, password, rol } = validar(req.body, { passwordObligatoria: true });
  if (errores.length) return send(res, 400, errores);

  if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email))
    return error(res, 409, 'Ya existe un usuario con ese correo.');

  const { lastInsertRowid } = db
    .prepare('INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)')
    .run(nombre, email, hashPassword(password), rol);

  send(res, 200, [db.prepare(`SELECT ${COLUMNAS} FROM usuarios WHERE id = ?`).get(lastInsertRowid)]);
});

// PUT /api/usuarios/:id
router.put('/:id', (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  if (!db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(id))
    return error(res, 404, `No existe un usuario con Id ${id}.`);

  const { errores, nombre, email, password, rol } = validar(req.body, { passwordObligatoria: false });
  if (errores.length) return send(res, 400, errores);

  if (db.prepare('SELECT 1 FROM usuarios WHERE email = ? AND id != ?').get(email, id))
    return error(res, 409, 'Ya existe otro usuario con ese correo.');

  if (password) {
    db.prepare('UPDATE usuarios SET nombre = ?, email = ?, rol = ?, password_hash = ? WHERE id = ?').run(
      nombre, email, rol, hashPassword(password), id
    );
  } else {
    db.prepare('UPDATE usuarios SET nombre = ?, email = ?, rol = ? WHERE id = ?').run(nombre, email, rol, id);
  }

  send(res, 200, [db.prepare(`SELECT ${COLUMNAS} FROM usuarios WHERE id = ?`).get(id)]);
});

// DELETE /api/usuarios/:id
router.delete('/:id', (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;
  if (id === req.usuario.id) return error(res, 400, 'No puedes eliminar tu propia cuenta.');
  if (db.prepare('DELETE FROM usuarios WHERE id = ?').run(id).changes === 0)
    return error(res, 404, `No existe un usuario con Id ${id}.`);
  send(res, 200, [`Usuario ${id} eliminado correctamente.`]);
});

module.exports = router;
