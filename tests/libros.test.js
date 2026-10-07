const { app, request, expectSchema, crearCategoria, crearAutor, crearLibroDePrueba } = require('./helpers');

describe('GET /api/libros', () => {
  test('devuelve 200 y un arreglo vacío cuando no hay libros', async () => {
    const res = await request(app).get('/api/libros');
    expectSchema(res, 200);
    expect(res.body.data).toEqual([]);
  });

  test('devuelve 200 con el libro y los nombres de autor/categoría resueltos (JOIN)', async () => {
    await crearLibroDePrueba();

    const res = await request(app).get('/api/libros');
    expectSchema(res, 200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      titulo: 'Cien años de soledad',
      autor: 'Gabriel García Márquez',
      categoria: 'Novela',
    });
  });
});

describe('GET /api/libros/:id', () => {
  test('devuelve 200 con el libro cuando el Id existe', async () => {
    const { libro } = await crearLibroDePrueba();

    const res = await request(app).get(`/api/libros/${libro.id}`);
    expectSchema(res, 200);
    expect(res.body.data[0].id).toBe(libro.id);
  });

  test('ERROR: Id que no existe -> 404', async () => {
    const res = await request(app).get('/api/libros/999999');
    expectSchema(res, 404);
  });

  test('ERROR: Id no numérico (texto en vez de número) -> 400', async () => {
    const res = await request(app).get('/api/libros/abc');
    expectSchema(res, 400);
  });

  test('ERROR: Id negativo -> 400', async () => {
    const res = await request(app).get('/api/libros/-1');
    expectSchema(res, 400);
  });
});

describe('POST /api/libros', () => {
  test('crea un libro válido y devuelve 200 con autor y categoría resueltos', async () => {
    const categoriaId = await crearCategoria('Novela');
    const autorId = await crearAutor('Gabriel García Márquez');

    const res = await request(app).post('/api/libros').send({
      titulo: 'Cien años de soledad',
      isbn: '9780307474728',
      anioPublicacion: 1967,
      autorId,
      categoriaId,
    });

    expectSchema(res, 200);
    expect(res.body.data[0]).toMatchObject({
      titulo: 'Cien años de soledad',
      isbn: '9780307474728',
      anioPublicacion: 1967,
    });
  });

  test('ERROR: falta el título -> 400', async () => {
    const categoriaId = await crearCategoria();
    const autorId = await crearAutor();
    const res = await request(app)
      .post('/api/libros')
      .send({ isbn: '9780307474728', anioPublicacion: 1967, autorId, categoriaId });
    expectSchema(res, 400);
  });

  test('ERROR: ISBN demasiado corto (menos de 10 caracteres) -> 400', async () => {
    const categoriaId = await crearCategoria();
    const autorId = await crearAutor();
    const res = await request(app)
      .post('/api/libros')
      .send({ titulo: 'X', isbn: '123', anioPublicacion: 2000, autorId, categoriaId });
    expectSchema(res, 400);
  });

  test('ERROR: año de publicación fuera de rango (año 3000) -> 400', async () => {
    const categoriaId = await crearCategoria();
    const autorId = await crearAutor();
    const res = await request(app)
      .post('/api/libros')
      .send({ titulo: 'X', isbn: '1234567890', anioPublicacion: 3000, autorId, categoriaId });
    expectSchema(res, 400);
  });

  test('ERROR: año de publicación como texto en vez de número -> 400', async () => {
    const categoriaId = await crearCategoria();
    const autorId = await crearAutor();
    const res = await request(app)
      .post('/api/libros')
      .send({ titulo: 'X', isbn: '1234567890', anioPublicacion: '1967', autorId, categoriaId });
    expectSchema(res, 400);
  });

  test('ERROR: autorId que no existe -> 404', async () => {
    const categoriaId = await crearCategoria();
    const res = await request(app)
      .post('/api/libros')
      .send({ titulo: 'X', isbn: '1234567890', anioPublicacion: 2000, autorId: 999999, categoriaId });
    expectSchema(res, 404);
  });

  test('ERROR: categoriaId que no existe -> 404', async () => {
    const autorId = await crearAutor();
    const res = await request(app)
      .post('/api/libros')
      .send({ titulo: 'X', isbn: '1234567890', anioPublicacion: 2000, autorId, categoriaId: 999999 });
    expectSchema(res, 404);
  });

  test('ERROR: ISBN repetido (duplicado) -> 409', async () => {
    const { categoriaId, autorId } = await crearLibroDePrueba();
    const res = await request(app).post('/api/libros').send({
      titulo: 'Otro título',
      isbn: '9780307474728',
      anioPublicacion: 2000,
      autorId,
      categoriaId,
    });
    expectSchema(res, 409);
  });
});

describe('PUT /api/libros/:id', () => {
  test('actualiza un libro existente y devuelve 200 con los datos nuevos', async () => {
    const { libro, autorId, categoriaId } = await crearLibroDePrueba();

    const res = await request(app).put(`/api/libros/${libro.id}`).send({
      titulo: 'Cien años de soledad (edición revisada)',
      isbn: libro.isbn,
      anioPublicacion: 1967,
      autorId,
      categoriaId,
    });

    expectSchema(res, 200);
    expect(res.body.data[0].titulo).toBe('Cien años de soledad (edición revisada)');

    const verificacion = await request(app).get(`/api/libros/${libro.id}`);
    expect(verificacion.body.data[0].titulo).toBe('Cien años de soledad (edición revisada)');
  });

  test('permite cambiar el libro a otro autor/categoría existentes', async () => {
    const { libro } = await crearLibroDePrueba();
    const nuevaCategoriaId = await crearCategoria('Realismo mágico');
    const nuevoAutorId = await crearAutor('Autor Nuevo');

    const res = await request(app).put(`/api/libros/${libro.id}`).send({
      titulo: libro.titulo,
      isbn: libro.isbn,
      anioPublicacion: libro.anioPublicacion,
      autorId: nuevoAutorId,
      categoriaId: nuevaCategoriaId,
    });

    expectSchema(res, 200);
    expect(res.body.data[0]).toMatchObject({ autor: 'Autor Nuevo', categoria: 'Realismo mágico' });
  });

  test('ERROR: Id de libro que no existe -> 404', async () => {
    const categoriaId = await crearCategoria();
    const autorId = await crearAutor();
    const res = await request(app).put('/api/libros/999999').send({
      titulo: 'X', isbn: '1234567890', anioPublicacion: 2000, autorId, categoriaId,
    });
    expectSchema(res, 404);
  });

  test('ERROR: Id no numérico en la URL -> 400', async () => {
    const res = await request(app).put('/api/libros/abc').send({});
    expectSchema(res, 400);
  });

  test('ERROR: cuerpo incompleto (sin autorId) -> 400', async () => {
    const { libro, categoriaId } = await crearLibroDePrueba();
    const res = await request(app).put(`/api/libros/${libro.id}`).send({
      titulo: libro.titulo, isbn: libro.isbn, anioPublicacion: libro.anioPublicacion, categoriaId,
    });
    expectSchema(res, 400);
  });

  test('ERROR: se intenta dejar el ISBN igual al de OTRO libro ya existente -> 409', async () => {
    const { autorId, categoriaId } = await crearLibroDePrueba({ isbn: '1111111111' });
    const segundo = await request(app).post('/api/libros').send({
      titulo: 'Segundo libro', isbn: '2222222222', anioPublicacion: 2001, autorId, categoriaId,
    });

    const res = await request(app).put(`/api/libros/${segundo.body.data[0].id}`).send({
      titulo: 'Segundo libro', isbn: '1111111111', anioPublicacion: 2001, autorId, categoriaId,
    });
    expectSchema(res, 409);
  });
});

describe('DELETE /api/libros/:id', () => {
  test('elimina un libro existente y devuelve 200', async () => {
    const { libro } = await crearLibroDePrueba();

    const res = await request(app).delete(`/api/libros/${libro.id}`);
    expectSchema(res, 200);

    const verificacion = await request(app).get(`/api/libros/${libro.id}`);
    expect(verificacion.status).toBe(404);
  });

  test('ERROR: Id que no existe -> 404', async () => {
    const res = await request(app).delete('/api/libros/999999');
    expectSchema(res, 404);
  });

  test('ERROR: Id no numérico -> 400', async () => {
    const res = await request(app).delete('/api/libros/abc');
    expectSchema(res, 400);
  });

  test('ERROR: eliminar el mismo libro dos veces -> la segunda vez da 404', async () => {
    const { libro } = await crearLibroDePrueba();
    await request(app).delete(`/api/libros/${libro.id}`);
    const res = await request(app).delete(`/api/libros/${libro.id}`);
    expectSchema(res, 404);
  });
});
