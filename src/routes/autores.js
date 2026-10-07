const { Router } = require('express');
const { db } = require('../db/database');
const { send, error } = require('../utils/response');

const router = Router();

// 3) GET /api/autores
router.get('/', (req, res) => {
  const autores = db.prepare('SELECT id, nombre, nacionalidad FROM autores ORDER BY id').all();
  send(res, 200, autores);
});

// 4) POST /api/autores
router.post('/', (req, res) => {
  const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : '';
  const nacionalidad =
    typeof req.body?.nacionalidad === 'string' && req.body.nacionalidad.trim()
      ? req.body.nacionalidad.trim()
      : null;

  if (nombre.length < 2 || nombre.length > 150)
    return error(res, 400, 'El nombre es obligatorio y debe tener entre 2 y 150 caracteres.');

  if (nacionalidad && nacionalidad.length > 80)
    return error(res, 400, 'La nacionalidad no puede exceder 80 caracteres.');

  if (db.prepare('SELECT 1 FROM autores WHERE nombre = ?').get(nombre))
    return error(res, 409, 'Ya existe un autor con ese nombre.');

  const { lastInsertRowid } = db
    .prepare('INSERT INTO autores (nombre, nacionalidad) VALUES (?, ?)')
    .run(nombre, nacionalidad);

  send(res, 200, [{ id: Number(lastInsertRowid), nombre, nacionalidad }]);
});

module.exports = router;
