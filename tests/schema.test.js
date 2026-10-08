
const { app, request, expectSchema } = require('./helpers');

describe('GET /api/health', () => {
  test('devuelve 200 con status ok', async () => {
    const res = await request(app).get('/api/health');
    expectSchema(res, 200);
    expect(res.body.data[0]).toMatchObject({ status: 'ok' });
    expect(typeof res.body.data[0].uptime).toBe('number');
  });
});

describe('Esquema de respuesta y manejo de errores general', () => {
  test('ERROR: ruta inexistente -> 404 con el mismo esquema { statusCode, data }', async () => {
    const res = await request(app).get('/api/no-existe');
    expectSchema(res, 404);
  });

  test('ERROR: método no soportado en una ruta válida (PATCH /api/categorias) -> 404', async () => {
    const res = await request(app).patch('/api/categorias');
    expectSchema(res, 404);
  });

  test('ERROR: cuerpo con JSON mal formado en cualquier endpoint POST -> 400', async () => {
    const res = await request(app)
      .post('/api/autores')
      .set('Content-Type', 'application/json')
      .send('{ esto no es JSON válido ');
    expectSchema(res, 400);
  });

  test('una respuesta 200 exitosa siempre trae "data" como arreglo, incluso con un solo elemento', async () => {
    const res = await request(app).post('/api/categorias').send({ nombre: 'Terror' });
    expectSchema(res, 200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });
});