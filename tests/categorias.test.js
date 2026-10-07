const { app, request, expectSchema } = require('./helpers');

describe('GET /api/categorias', () => {
  test('devuelve 200 y un arreglo vacío cuando no hay categorías', async () => {
    const res = await request(app).get('/api/categorias');
    expectSchema(res, 200);
    expect(res.body.data).toEqual([]);
  });

  test('devuelve 200 con las categorías creadas, ordenadas por Id', async () => {
    await request(app).post('/api/categorias').send({ nombre: 'Novela' });
    await request(app).post('/api/categorias').send({ nombre: 'Poesía' });

    const res = await request(app).get('/api/categorias');
    expectSchema(res, 200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({ id: 1, nombre: 'Novela' });
    expect(res.body.data[1]).toMatchObject({ id: 2, nombre: 'Poesía' });
  });
});

describe('POST /api/categorias', () => {
  test('crea una categoría válida y devuelve 200', async () => {
    const res = await request(app).post('/api/categorias').send({ nombre: 'Ciencia ficción' });
    expectSchema(res, 200);
    expect(res.body.data[0]).toMatchObject({ nombre: 'Ciencia ficción' });
    expect(res.body.data[0].id).toBeGreaterThan(0);
  });

  test('quita espacios al inicio y al final del nombre', async () => {
    const res = await request(app).post('/api/categorias').send({ nombre: '  Novela  ' });
    expectSchema(res, 200);
    expect(res.body.data[0].nombre).toBe('Novela');
  });

  test('ERROR: sin el campo "nombre" -> 400', async () => {
    const res = await request(app).post('/api/categorias').send({});
    expectSchema(res, 400);
  });

  test('ERROR: "nombre" vacío o solo espacios -> 400', async () => {
    const res = await request(app).post('/api/categorias').send({ nombre: '   ' });
    expectSchema(res, 400);
  });

  test('ERROR: "nombre" de un solo carácter (menor al mínimo de 2) -> 400', async () => {
    const res = await request(app).post('/api/categorias').send({ nombre: 'A' });
    expectSchema(res, 400);
  });

  test('ERROR: "nombre" como número en vez de texto -> 400', async () => {
    const res = await request(app).post('/api/categorias').send({ nombre: 123 });
    expectSchema(res, 400);
  });

  test('ERROR: "nombre" repetido (duplicado) -> 409', async () => {
    await request(app).post('/api/categorias').send({ nombre: 'Novela' });
    const res = await request(app).post('/api/categorias').send({ nombre: 'Novela' });
    expectSchema(res, 409);
    expect(res.body.data[0]).toMatch(/ya existe/i);
  });

  test('ERROR: cuerpo de la petición con JSON mal formado -> 400', async () => {
    const res = await request(app)
      .post('/api/categorias')
      .set('Content-Type', 'application/json')
      .send('{nombre: sin comillas}');
    expectSchema(res, 400);
  });
});
