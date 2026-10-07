const request = require('supertest');
const app = require('../src/app');

function expectSchema(res, statusCode) {
  expect(res.status).toBe(statusCode);
  expect(res.body).toHaveProperty('statusCode', statusCode);
  expect(Array.isArray(res.body.data)).toBe(true);
}

async function crearCategoria(nombre = 'Novela') {
  const res = await request(app).post('/api/categorias').send({ nombre });
  return res.body.data[0].id;
}

async function crearAutor(nombre = 'Gabriel García Márquez', nacionalidad = 'Colombiana') {
  const res = await request(app).post('/api/autores').send({ nombre, nacionalidad });
  return res.body.data[0].id;
}

async function crearLibroDePrueba(overrides = {}) {
  const categoriaId = await crearCategoria();
  const autorId = await crearAutor();
  const res = await request(app)
    .post('/api/libros')
    .send({
      titulo: 'Cien años de soledad',
      isbn: '9780307474728',
      anioPublicacion: 1967,
      autorId,
      categoriaId,
      ...overrides,
    });
  return { categoriaId, autorId, libro: res.body.data[0] };
}

module.exports = { app, request, expectSchema, crearCategoria, crearAutor, crearLibroDePrueba };