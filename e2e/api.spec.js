// Pruebas de backend (API REST) a través del proxy nginx, tal como la usa el frontend
const { test, expect } = require('@playwright/test');
const { ADMIN, unico, tokenAdmin } = require('./helpers');

const esquema = async (res, status) => {
  expect(res.status()).toBe(status);
  const body = await res.json();
  expect(body.statusCode).toBe(status);
  expect(Array.isArray(body.data)).toBe(true);
  return body.data;
};

test.describe('API: salud', () => {
  test('GET /api/health responde 200 con status ok', async ({ request }) => {
    const [salud] = await esquema(await request.get('/api/health'), 200);
    expect(salud.status).toBe('ok');
    expect(salud.timestamp).toBeTruthy();
  });

  test('una ruta inexistente responde 404 con el esquema estándar', async ({ request }) => {
    await esquema(await request.get('/api/no-existe'), 404);
  });
});

test.describe('API: autenticación', () => {
  test('login correcto devuelve token', async ({ request }) => {
    const [sesion] = await esquema(await request.post('/api/auth/login', { data: ADMIN }), 200);
    expect(sesion.token).toBeTruthy();
    expect(sesion.usuario.email).toBe(ADMIN.email);
  });

  test('login con contraseña incorrecta devuelve 401', async ({ request }) => {
    await esquema(await request.post('/api/auth/login', { data: { email: ADMIN.email, password: 'incorrecta' } }), 401);
  });

  test('/api/usuarios exige token', async ({ request }) => {
    await esquema(await request.get('/api/usuarios'), 401);
  });
});

test.describe('API: CRUD de productos (libros)', () => {
  test('crear, consultar, actualizar y eliminar un libro', async ({ request }) => {
    const id = unico();
    const [cat] = await esquema(await request.post('/api/categorias', { data: { nombre: `Cat ${id}` } }), 200);
    const [aut] = await esquema(await request.post('/api/autores', { data: { nombre: `Autor ${id}`, nacionalidad: 'Mexicana' } }), 200);

    const libro = { titulo: `Libro ${id}`, isbn: `ISBN${id}`.slice(0, 20), anioPublicacion: 2024, autorId: aut.id, categoriaId: cat.id };
    const [creado] = await esquema(await request.post('/api/libros', { data: libro }), 200);
    expect(creado).toMatchObject({ titulo: libro.titulo, autor: aut.nombre, categoria: cat.nombre });

    const [leido] = await esquema(await request.get(`/api/libros/${creado.id}`), 200);
    expect(leido.isbn).toBe(libro.isbn);

    const [actualizado] = await esquema(
      await request.put(`/api/libros/${creado.id}`, { data: { ...libro, titulo: `${libro.titulo} (2a ed.)` } }),
      200
    );
    expect(actualizado.titulo).toContain('2a ed.');

    await esquema(await request.delete(`/api/libros/${creado.id}`), 200);
    await esquema(await request.get(`/api/libros/${creado.id}`), 404);
  });

  test('crear un libro con datos inválidos devuelve 400', async ({ request }) => {
    await esquema(await request.post('/api/libros', { data: { titulo: '' } }), 400);
  });
});

test.describe('API: CRUD de usuarios', () => {
  test('crear, actualizar y eliminar un usuario con token', async ({ request }) => {
    const headers = { Authorization: `Bearer ${await tokenAdmin(request)}` };
    const email = `api.${unico()}@biblioteca.com`;

    const [u] = await esquema(
      await request.post('/api/usuarios', { headers, data: { nombre: 'Usuario API', email, password: 'clave123', rol: 'editor' } }),
      200
    );
    const [mod] = await esquema(
      await request.put(`/api/usuarios/${u.id}`, { headers, data: { nombre: 'Usuario API Editado', email, rol: 'admin' } }),
      200
    );
    expect(mod.rol).toBe('admin');
    await esquema(await request.delete(`/api/usuarios/${u.id}`, { headers }), 200);
  });
});
