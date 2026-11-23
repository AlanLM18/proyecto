const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { instrumentDb } = require('../observability/dbTracing');
const { hashPassword } = require('../auth/password');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
// DB_PATH permite usar otra ruta (o ':memory:' en las pruebas automatizadas)
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'practica3.db');

if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// Cada consulta SQL genera un span de OpenTelemetry (traza distribuida hasta la BD)
instrumentDb(db);

/*
 * Base de datos normalizada (3FN):
 *  - categorias y autores son tablas independientes (sin datos repetidos).
 *  - libros solo guarda las llaves foráneas hacia autores y categorias.
 *  - usuarios guarda las cuentas que pueden iniciar sesión en el frontend.
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

  CREATE TABLE IF NOT EXISTS usuarios (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre         TEXT NOT NULL,
    email          TEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    rol            TEXT NOT NULL DEFAULT 'editor' CHECK (rol IN ('admin', 'editor')),
    creado_en      TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@biblioteca.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';

// Garantiza que siempre exista una cuenta administradora para poder iniciar sesión
function ensureAdmin() {
  if (!db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(ADMIN_EMAIL)) {
    db.prepare('INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)').run(
      'Administrador',
      ADMIN_EMAIL,
      hashPassword(ADMIN_PASSWORD),
      'admin'
    );
  }
}
ensureAdmin();

module.exports = { db, DB_PATH, ensureAdmin, ADMIN_EMAIL, ADMIN_PASSWORD };
