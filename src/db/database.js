const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
// DB_PATH permite usar otra ruta (o ':memory:' en las pruebas automatizadas)
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'practica3.db');

if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

/*
 * Base de datos normalizada (3FN):
 *  - categorias y autores son tablas independientes (sin datos repetidos).
 *  - libros solo guarda las llaves foráneas hacia autores y categorias.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS categorias (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS autores (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre       TEXT NOT NULL UNIQUE,
    nacionalidad TEXT
  );

  CREATE TABLE IF NOT EXISTS libros (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo           TEXT    NOT NULL,
    isbn             TEXT    NOT NULL UNIQUE,
    anio_publicacion INTEGER NOT NULL,
    autor_id         INTEGER NOT NULL REFERENCES autores(id)    ON DELETE RESTRICT,
    categoria_id     INTEGER NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT
  );
`);

module.exports = { db, DB_PATH };
