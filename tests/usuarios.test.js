const { app, request, expectSchema } = require('./helpers');
const { db, ensureAdmin, ADMIN_EMAIL, ADMIN_PASSWORD } = require('../src/db/database');
const { crearToken, verificarToken } = require('../src/auth/token');
const { verifyPassword } = require('../src/auth/password');

let token;
let adminId;

beforeEach(async () => {
  db.exec('DELETE FROM usuarios');
  ensureAdmin();
  const res = await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  token = res.body.data[0].token;
  adminId = res.body.data[0].usuario.id;
});

const auth = () => ({ Authorization: `Bearer ${token}` });
const nuevo = (extra = {}) => ({ nombre: 'Ana Pérez', email: 'ana@biblioteca.com', password: 'secreta1', rol: 'editor', ...extra });

describe('POST /api/auth/login', () => {
  test('inicia sesión con el administrador y devuelve token y usuario sin contraseña', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expectSchema(res, 200);
    expect(res.body.data[0].token).toEqual(expect.any(String));
    expect(res.body.data[0].usuario).toMatchObject({ email: ADMIN_EMAIL, rol: 'admin' });
    expect(res.body.data[0].usuario).not.toHaveProperty('password_hash');
  });

  test('acepta el correo con mayúsculas y espacios', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: `  ${ADMIN_EMAIL.toUpperCase()} `, password: ADMIN_PASSWORD });
    expectSchema(res, 200);
  });

  test('ERROR: contraseña incorrecta -> 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: 'mala' });
    expectSchema(res, 401);
  });

  test('ERROR: correo inexistente -> 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nadie@x.com', password: 'loquesea' });
    expectSchema(res, 401);
  });

  test('ERROR: faltan datos -> 400', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expectSchema(res, 400);
  });
});

describe('GET /api/auth/me', () => {
  test('devuelve el usuario del token', async () => {
    const res = await request(app).get('/api/auth/me').set(auth());
    expectSchema(res, 200);
    expect(res.body.data[0].email).toBe(ADMIN_EMAIL);
  });

  test('ERROR: sin token -> 401', async () => {
    expectSchema(await request(app).get('/api/auth/me'), 401);
  });

  test('ERROR: token alterado -> 401', async () => {
    const res = await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${token}x` });
    expectSchema(res, 401);
  });

  test('ERROR: token de una cuenta eliminada -> 401', async () => {
    const huerfano = crearToken({ id: 999999, email: 'x@x.com', rol: 'editor' });
    const res = await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${huerfano}` });
    expectSchema(res, 401);
  });
});

describe('token y contraseñas', () => {
  test('verificarToken rechaza valores mal formados', () => {
    expect(verificarToken('')).toBeNull();
    expect(verificarToken('abc')).toBeNull();
    expect(verificarToken(undefined)).toBeNull();
  });

  test('verifyPassword rechaza un hash mal formado', () => {
    expect(verifyPassword('x', 'sin-separador')).toBe(false);
  });
});

describe('CRUD /api/usuarios', () => {
  test('ERROR: listar sin sesión -> 401', async () => {
    expectSchema(await request(app).get('/api/usuarios'), 401);
  });

  test('lista los usuarios (incluye al administrador)', async () => {
    const res = await request(app).get('/api/usuarios').set(auth());
    expectSchema(res, 200);
    expect(res.body.data.map((u) => u.email)).toContain(ADMIN_EMAIL);
  });

  test('crea un usuario y puede iniciar sesión con él', async () => {
    const res = await request(app).post('/api/usuarios').set(auth()).send(nuevo());
    expectSchema(res, 200);
    expect(res.body.data[0]).toMatchObject({ nombre: 'Ana Pérez', email: 'ana@biblioteca.com', rol: 'editor' });

    const login = await request(app).post('/api/auth/login').send({ email: 'ana@biblioteca.com', password: 'secreta1' });
    expectSchema(login, 200);
  });

  test('ERROR: datos inválidos -> 400 con la lista de errores', async () => {
    const res = await request(app).post('/api/usuarios').set(auth()).send({ nombre: 'A', email: 'no-es-correo', password: '1', rol: 'jefe' });
    expectSchema(res, 400);
    expect(res.body.data).toHaveLength(4);
  });

  test('ERROR: correo duplicado -> 409', async () => {
    await request(app).post('/api/usuarios').set(auth()).send(nuevo());
    expectSchema(await request(app).post('/api/usuarios').set(auth()).send(nuevo()), 409);
  });

  test('obtiene un usuario por Id', async () => {
    const res = await request(app).get(`/api/usuarios/${adminId}`).set(auth());
    expectSchema(res, 200);
    expect(res.body.data[0].email).toBe(ADMIN_EMAIL);
  });

  test('ERROR: Id inexistente -> 404 y Id inválido -> 400', async () => {
    expectSchema(await request(app).get('/api/usuarios/999999').set(auth()), 404);
    expectSchema(await request(app).get('/api/usuarios/abc').set(auth()), 400);
  });

  test('actualiza nombre y rol sin cambiar la contraseña', async () => {
    const { body } = await request(app).post('/api/usuarios').set(auth()).send(nuevo());
    const id = body.data[0].id;

    const res = await request(app).put(`/api/usuarios/${id}`).set(auth()).send({ nombre: 'Ana López', email: 'ana@biblioteca.com', rol: 'admin' });
    expectSchema(res, 200);
    expect(res.body.data[0]).toMatchObject({ nombre: 'Ana López', rol: 'admin' });

    const login = await request(app).post('/api/auth/login').send({ email: 'ana@biblioteca.com', password: 'secreta1' });
    expectSchema(login, 200);
  });

  test('actualiza la contraseña cuando se envía', async () => {
    const { body } = await request(app).post('/api/usuarios').set(auth()).send(nuevo());
    const id = body.data[0].id;
    await request(app).put(`/api/usuarios/${id}`).set(auth()).send(nuevo({ password: 'nueva123' }));

    const login = await request(app).post('/api/auth/login').send({ email: 'ana@biblioteca.com', password: 'nueva123' });
    expectSchema(login, 200);
  });

  test('ERROR: actualizar con correo de otro usuario -> 409, inexistente -> 404, inválido -> 400', async () => {
    const { body } = await request(app).post('/api/usuarios').set(auth()).send(nuevo());
    const id = body.data[0].id;
    expectSchema(await request(app).put(`/api/usuarios/${id}`).set(auth()).send(nuevo({ email: ADMIN_EMAIL })), 409);
    expectSchema(await request(app).put('/api/usuarios/999999').set(auth()).send(nuevo()), 404);
    expectSchema(await request(app).put(`/api/usuarios/${id}`).set(auth()).send({ nombre: '' }), 400);
    expectSchema(await request(app).put('/api/usuarios/abc').set(auth()).send(nuevo()), 400);
  });

  test('elimina un usuario', async () => {
    const { body } = await request(app).post('/api/usuarios').set(auth()).send(nuevo());
    const id = body.data[0].id;
    expectSchema(await request(app).delete(`/api/usuarios/${id}`).set(auth()), 200);
    expectSchema(await request(app).get(`/api/usuarios/${id}`).set(auth()), 404);
  });

  test('ERROR: no se puede eliminar la propia cuenta, ni un Id inexistente o inválido', async () => {
    expectSchema(await request(app).delete(`/api/usuarios/${adminId}`).set(auth()), 400);
    expectSchema(await request(app).delete('/api/usuarios/999999').set(auth()), 404);
    expectSchema(await request(app).delete('/api/usuarios/abc').set(auth()), 400);
  });
});
