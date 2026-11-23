const { metrics, ValueType } = require('@opentelemetry/api');
const logger = require('./logger');

/*
 * Métricas por endpoint (RF-04):
 *  - http_server_requests_total       -> volumen de peticiones (peticiones por segundo = rate)
 *  - http_server_errors_total         -> peticiones con statusCode >= 400
 *  - http_server_request_duration_ms  -> latencia (histograma)
 * Atributos: method, route, status_code.
 * Además cada petición genera un log estructurado "http_request" con timestamp,
 * método, ruta, statusCode y tiempo de respuesta.
 */
const meter = metrics.getMeter('biblioteca-api');

const peticiones = meter.createCounter('http_server_requests_total', {
  description: 'Total de peticiones HTTP atendidas',
  valueType: ValueType.INT,
});
const errores = meter.createCounter('http_server_errors_total', {
  description: 'Peticiones HTTP con statusCode >= 400',
  valueType: ValueType.INT,
});
const duracion = meter.createHistogram('http_server_request_duration_ms', {
  description: 'Tiempo de respuesta de las peticiones HTTP',
  unit: 'ms',
  advice: { explicitBucketBoundaries: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500] },
});

// Ruta "plantilla" (/api/libros/:id) para no generar una serie por cada Id
function rutaDe(req, res) {
  if (req.route?.path) return `${req.baseUrl}${req.route.path === '/' ? '' : req.route.path}` || '/';
  if (res.statusCode === 404) return 'ruta_no_encontrada';
  return req.baseUrl || req.path;
}

function httpMetrics(req, res, next) {
  const inicio = process.hrtime.bigint();

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    const atributos = { method: req.method, route: rutaDe(req, res), status_code: res.statusCode };

    peticiones.add(1, atributos);
    duracion.record(ms, atributos);
    if (res.statusCode >= 400) errores.add(1, atributos);

    const nivel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[nivel]('http_request', {
      ...atributos,
      path: req.originalUrl,
      duration_ms: Math.round(ms * 100) / 100,
      user_agent: req.get('user-agent') || '',
    });
  });

  next();
}

module.exports = { httpMetrics, rutaDe };
