const express = require('express');
const { error } = require('./utils/response');

const app = express();
app.use(express.json());

app.use('/api/categorias', require('./routes/categorias'));
app.use('/api/autores', require('./routes/autores'));
app.use('/api/libros', require('./routes/libros'));
app.use('/api/database', require('./routes/database'));

// 404 para rutas inexistentes (mismo esquema de respuesta)
app.use((req, res) => error(res, 404, `Ruta no encontrada (v2): ${req.method} ${req.originalUrl}`));

// Manejo global de errores (JSON mal formado, errores inesperados, etc.)
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return error(res, 400, 'El cuerpo de la petición no es un JSON válido.');
  console.error(err);
  error(res, 500, 'Error interno del servidor.');
});

module.exports = app;
