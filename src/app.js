const express = require('express');
const { send, error } = require('./utils/response');

const app = express();
app.use(express.json());

// GET /api/health -> estado de la API (lo usan el HEALTHCHECK de Docker y el pipeline al desplegar)
app.get('/api/health', (req, res) => {
  send(res, 200, [{ status: 'ok', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() }]);
});

app.use('/api/categorias', require('./routes/categorias'));
app.use('/api/autores', require('./routes/autores'));
app.use('/api/libros', require('./routes/libros'));
app.use('/api/database', require('./routes/database'));


app.use((req, res) => error(res, 404, `Ruta no encontrada (v2): ${req.method} ${req.originalUrl}`));


app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return error(res, 400, 'El cuerpo de la petición no es un JSON válido.');
  console.error(err);
  error(res, 500, 'Error interno del servidor.');
});

module.exports = app;
