const fs = require('fs');
const { app, request, expectSchema, crearLibroDePrueba } = require('./helpers');

describe('POST /api/database/backup', () => {
  test('crea un archivo .db en la carpeta backups/ y devuelve su ruta', async () => {
    await crearLibroDePrueba();

    const res = await request(app).post('/api/database/backup');
    expectSchema(res, 200);

    const { archivo, ruta } = res.body.data[0];
    expect(archivo).toMatch(/^backup_\d{8}_\d{6}\.db$/);
    expect(fs.existsSync(ruta)).toBe(true);

    fs.unlinkSync(ruta);
  });
});

describe('DELETE /api/database/vaciar', () => {
  test('borra todos los registros y GET /api/libros queda vacío', async () => {
    await crearLibroDePrueba();

    const res = await request(app).delete('/api/database/vaciar');
    expectSchema(res, 200);

    const libros = await request(app).get('/api/libros');
    const autores = await request(app).get('/api/autores');
    const categorias = await request(app).get('/api/categorias');
    expect(libros.body.data).toEqual([]);
    expect(autores.body.data).toEqual([]);
    expect(categorias.body.data).toEqual([]);
  });

  test('reinicia los Id autoincrementales: el siguiente registro vuelve a empezar en 1', async () => {
    await crearLibroDePrueba();
    await request(app).delete('/api/database/vaciar');

    const res = await request(app).post('/api/categorias').send({ nombre: 'Novela' });
    expect(res.body.data[0].id).toBe(1);
  });

  test('ERROR: si la BD falla al vaciar -> 500', async () => {
    const { db } = require('../src/db/database');
    const spy = jest.spyOn(db, 'transaction').mockImplementationOnce(() => {
      throw new Error('BD bloqueada');
    });
    expectSchema(await request(app).delete('/api/database/vaciar'), 500);
    spy.mockRestore();
  });
});

describe('POST /api/database/backup (errores)', () => {
  test('ERROR: si el backup falla -> 500', async () => {
    const { db } = require('../src/db/database');
    const spy = jest.spyOn(db, 'backup').mockRejectedValueOnce(new Error('disco lleno'));
    expectSchema(await request(app).post('/api/database/backup'), 500);
    spy.mockRestore();
  });
});
