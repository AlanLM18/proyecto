const { db } = require('../src/db/database');

beforeEach(() => {
  db.exec(`
    DELETE FROM libros;
    DELETE FROM autores;
    DELETE FROM categorias;
    DELETE FROM sqlite_sequence;
  `);
});

afterAll(() => {
  db.close();
});
