const express = require('express');
const { send, error } = require('./utils/response');
const { httpMetrics } = require('./observability/httpMetrics');
const logger = require('./observability/logger');

const app = express();
app.disable('x-powered-by');
app.use(httpMetrics); // métricas + log estructurado de cada petición (RF-04)
app.use(express.json());

// Ruta de salud: la usan el HEALTHCHECK de Docker, el pipeline y el frontend
app.get('/api/health', (req, res) => {
  send(res, 200, [
    {
      status: 'ok',
      mensaje: 'Hola esta es la version 3',
      version: process.env.APP_VERSION || 'dev',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  ]);
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/categorias', require('./routes/categorias'));
app.use('/api/autores', require('./routes/autores'));
app.use('/api/libros', require('./routes/libros'));
app.use('/api/database', require('./routes/database'));
app.use('/api/alertas', require('./routes/alertas'));

app.use((req, res) => error(res, 404, `Ruta no encontrada (v2): ${req.method} ${req.originalUrl}`));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return error(res, 400, 'El cuerpo de la petición no es un JSON válido.');
  logger.error('excepcion_no_controlada', {
    method: req.method,
    path: req.originalUrl,
    error: err.message,
    stack: err.stack,
  });
  error(res, 500, 'Error interno del servidor.');
});

module.exports = app;
