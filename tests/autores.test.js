const { app, request, expectSchema } = require('./helpers');

describe('GET /api/autores', () => {
  test('devuelve 200 y un arreglo vacío cuando no hay autores', async () => {
    const res = await request(app).get('/api/autores');
    expectSchema(res, 200);
    expect(res.body.data).toEqual([]);
  });

  test('devuelve 200 con los autores creados', async () => {
    await request(app).post('/api/autores').send({ nombre: 'Isaac Asimov', nacionalidad: 'Estadounidense' });

    const res = await request(app).get('/api/autores');
    expectSchema(res, 200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ nombre: 'Isaac Asimov', nacionalidad: 'Estadounidense' });
  });
});

describe('POST /api/autores', () => {
  test('crea un autor válido con nacionalidad y devuelve 200', async () => {
    const res = await request(app)
      .post('/api/autores')
      .send({ nombre: 'Gabriel García Márquez', nacionalidad: 'Colombiana' });
    expectSchema(res, 200);
    expect(res.body.data[0]).toMatchObject({ nombre: 'Gabriel García Márquez', nacionalidad: 'Colombiana' });
  });

  test('crea un autor válido sin nacionalidad (campo opcional) -> nacionalidad queda null', async () => {
    const res = await request(app).post('/api/autores').send({ nombre: 'Autor Sin Nacionalidad' });
    expectSchema(res, 200);
    expect(res.body.data[0].nacionalidad).toBeNull();
  });

  test('ERROR: sin el campo "nombre" -> 400', async () => {
    const res = await request(app).post('/api/autores').send({ nacionalidad: 'Mexicana' });
    expectSchema(res, 400);
  });

  test('ERROR: "nombre" vacío -> 400', async () => {
    const res = await request(app).post('/api/autores').send({ nombre: '' });
    expectSchema(res, 400);
  });

  test('ERROR: "nacionalidad" demasiado larga (más de 80 caracteres) -> 400', async () => {
    const res = await request(app)
      .post('/api/autores')
      .send({ nombre: 'Autor X', nacionalidad: 'N'.repeat(81) });
    expectSchema(res, 400);
  });

  test('ERROR: autor con el mismo nombre ya registrado -> 409', async () => {
    await request(app).post('/api/autores').send({ nombre: 'Pablo Neruda' });
    const res = await request(app).post('/api/autores').send({ nombre: 'Pablo Neruda' });
    expectSchema(res, 409);
  });
});
