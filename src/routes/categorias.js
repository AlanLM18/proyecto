const { Router } = require('express');
const { db } = require('../db/database');
const { send, error } = require('../utils/response');

const router = Router();

// 1) GET /api/categorias
router.get('/', (req, res) => {
  const categorias = db.prepare('SELECT id, nombre FROM categorias ORDER BY id').all();
  send(res, 200, categorias);
});

// 2) POST /api/categorias
router.post('/', (req, res) => {
  const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : '';

  if (nombre.length < 2 || nombre.length > 100)
    return error(res, 400, 'El nombre es obligatorio y debe tener entre 2 y 100 caracteres.');

  if (db.prepare('SELECT 1 FROM categorias WHERE nombre = ?').get(nombre))
    return error(res, 409, 'Ya existe una categoría con ese nombre.');

  const { lastInsertRowid } = db.prepare('INSERT INTO categorias (nombre) VALUES (?)').run(nombre);
  send(res, 200, [{ id: Number(lastInsertRowid), nombre }]);
});

module.exports = router;
