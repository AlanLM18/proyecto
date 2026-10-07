const { db } = require('./database');

const SELECT_LIBROS = `
  SELECT l.id,
         l.titulo,
         l.isbn,
         l.anio_publicacion AS anioPublicacion,
         a.nombre           AS autor,
         c.nombre           AS categoria
  FROM libros l
  JOIN autores    a ON a.id = l.autor_id
  JOIN categorias c ON c.id = l.categoria_id
`;

function listLibros() {
  return db.prepare(`${SELECT_LIBROS} ORDER BY l.id`).all();
}

function getLibroById(id) {
  return db.prepare(`${SELECT_LIBROS} WHERE l.id = ?`).get(id);
}

function validarLibro(body) {
  const { titulo, isbn, anioPublicacion, autorId, categoriaId } = body ?? {};
  const errores = [];

  const tituloOk = typeof titulo === 'string' && titulo.trim().length >= 1 && titulo.trim().length <= 200;
  const isbnOk = typeof isbn === 'string' && isbn.trim().length >= 10 && isbn.trim().length <= 20;

  if (!tituloOk) errores.push('El título es obligatorio (máximo 200 caracteres).');
  if (!isbnOk) errores.push('El ISBN es obligatorio y debe tener entre 10 y 20 caracteres.');
  if (!Number.isInteger(anioPublicacion) || anioPublicacion < 1000 || anioPublicacion > 2100)
    errores.push('El año de publicación debe ser un entero entre 1000 y 2100.');
  if (!Number.isInteger(autorId) || autorId < 1) errores.push('autorId inválido.');
  if (!Number.isInteger(categoriaId) || categoriaId < 1) errores.push('categoriaId inválido.');

  return { errores, titulo, isbn, anioPublicacion, autorId, categoriaId };
}

function createLibro(body) {
  const { errores, titulo, isbn, anioPublicacion, autorId, categoriaId } = validarLibro(body);
  if (errores.length) return { ok: false, status: 400, errores };

  if (!db.prepare('SELECT 1 FROM autores WHERE id = ?').get(autorId))
    return { ok: false, status: 404, errores: [`No existe un autor con Id ${autorId}.`] };

  if (!db.prepare('SELECT 1 FROM categorias WHERE id = ?').get(categoriaId))
    return { ok: false, status: 404, errores: [`No existe una categoría con Id ${categoriaId}.`] };

  if (db.prepare('SELECT 1 FROM libros WHERE isbn = ?').get(isbn.trim()))
    return { ok: false, status: 409, errores: ['Ya existe un libro con ese ISBN.'] };

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO libros (titulo, isbn, anio_publicacion, autor_id, categoria_id)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(titulo.trim(), isbn.trim(), anioPublicacion, autorId, categoriaId);

  return { ok: true, status: 200, libro: getLibroById(lastInsertRowid) };
}

function updateLibro(id, body) {
  if (!db.prepare('SELECT 1 FROM libros WHERE id = ?').get(id))
    return { ok: false, status: 404, errores: [`No existe un libro con Id ${id}.`] };

  const { errores, titulo, isbn, anioPublicacion, autorId, categoriaId } = validarLibro(body);
  if (errores.length) return { ok: false, status: 400, errores };

  if (!db.prepare('SELECT 1 FROM autores WHERE id = ?').get(autorId))
    return { ok: false, status: 404, errores: [`No existe un autor con Id ${autorId}.`] };

  if (!db.prepare('SELECT 1 FROM categorias WHERE id = ?').get(categoriaId))
    return { ok: false, status: 404, errores: [`No existe una categoría con Id ${categoriaId}.`] };

  const otroConMismoIsbn = db.prepare('SELECT 1 FROM libros WHERE isbn = ? AND id != ?').get(isbn.trim(), id);
  if (otroConMismoIsbn) return { ok: false, status: 409, errores: ['Ya existe otro libro con ese ISBN.'] };

  db.prepare(
    `UPDATE libros
        SET titulo = ?, isbn = ?, anio_publicacion = ?, autor_id = ?, categoria_id = ?
      WHERE id = ?`
  ).run(titulo.trim(), isbn.trim(), anioPublicacion, autorId, categoriaId, id);

  return { ok: true, status: 200, libro: getLibroById(id) };
}

function deleteLibro(id) {
  return db.prepare('DELETE FROM libros WHERE id = ?').run(id).changes > 0;
}

module.exports = { SELECT_LIBROS, listLibros, getLibroById, createLibro, updateLibro, deleteLibro };