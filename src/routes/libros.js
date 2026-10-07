const { Router } = require('express');
const { send, error } = require('../utils/response');
const { listLibros, getLibroById, createLibro, updateLibro, deleteLibro } = require('../db/librosRepo');

const router = Router();

router.get('/', (req, res) => {
  send(res, 200, listLibros());
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return error(res, 400, 'Id inválido.');
  const libro = getLibroById(id);
  if (!libro) return error(res, 404, `No existe un libro con Id ${id}.`);
  send(res, 200, [libro]);
});

router.post('/', (req, res) => {
  const resultado = createLibro(req.body);
  if (!resultado.ok) return send(res, resultado.status, resultado.errores);
  send(res, 200, [resultado.libro]);
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return error(res, 400, 'Id inválido.');
  const resultado = updateLibro(id, req.body);
  if (!resultado.ok) return send(res, resultado.status, resultado.errores);
  send(res, 200, [resultado.libro]);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return error(res, 400, 'Id inválido.');
  if (!deleteLibro(id)) return error(res, 404, `No existe un libro con Id ${id}.`);
  send(res, 200, [`Libro ${id} eliminado correctamente.`]);
});

module.exports = router;