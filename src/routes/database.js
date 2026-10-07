const fs = require('fs');
const path = require('path');
const { Router } = require('express');
const { db } = require('../db/database');
const { send, error } = require('../utils/response');

const router = Router();
// BACKUP_DIR permite cambiar la carpeta de backups (las pruebas usan una carpeta temporal)
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'backups');

const pad = (n) => String(n).padStart(2, '0');
function timestamp(d = new Date()) {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

// 9) POST /api/database/backup  -> copia de seguridad en la carpeta /backups
router.post('/backup', async (req, res) => {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const archivo = `backup_${timestamp()}.db`;
    const ruta = path.join(BACKUP_DIR, archivo);

    await db.backup(ruta); // API de backup nativa de SQLite

    send(res, 200, [{ archivo, ruta, fecha: new Date().toISOString() }]);
  } catch (e) {
    error(res, 500, `No se pudo crear el backup: ${e.message}`);
  }
});

// 10) DELETE /api/database/vaciar  -> elimina todos los registros y reinicia los Id
router.delete('/vaciar', (req, res) => {
  try {
    const vaciar = db.transaction(() => {
      // Primero la tabla hija (libros) y luego las padres, por las llaves foráneas
      db.prepare('DELETE FROM libros').run();
      db.prepare('DELETE FROM autores').run();
      db.prepare('DELETE FROM categorias').run();
      db.prepare('DELETE FROM sqlite_sequence').run(); // reinicia AUTOINCREMENT
    });
    vaciar();

    send(res, 200, ['Base de datos vaciada correctamente.']);
  } catch (e) {
    error(res, 500, `No se pudo vaciar la base de datos: ${e.message}`);
  }
});

module.exports = router;
