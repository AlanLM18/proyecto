/*
 * Inicialización de OpenTelemetry (OTLP/HTTP) hacia OpenObserve.
 * Debe cargarse ANTES que express/http para que la instrumentación automática funcione,
 * por eso server.js lo requiere en su primera línea.
 *
 * Variables de entorno:
 *   OPENOBSERVE_URL       ej. http://openobserve:5080   (si no existe, no se envía telemetría)
 *   OPENOBSERVE_ORG       organización (default: "default")
 *   OPENOBSERVE_USER      usuario de OpenObserve
 *   OPENOBSERVE_PASSWORD  contraseña de OpenObserve
 *   OTEL_SERVICE_NAME     nombre del servicio (default: biblioteca-api)
 */
const URL_OO = (process.env.OPENOBSERVE_URL || '').replace(/\/+$/, '');

if (!URL_OO) {
  console.log('[telemetry] OPENOBSERVE_URL no definido: OpenTelemetry desactivado');
  module.exports = { shutdown: async () => {} };
  return;
}

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { PeriodicExportingMetricReader, AggregationTemporality } = require('@opentelemetry/sdk-metrics');
const { BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { resourceFromAttributes } = require('@opentelemetry/resources');

const ORG = process.env.OPENOBSERVE_ORG || 'default';
const base = `${URL_OO}/api/${ORG}`;
const auth =
  'Basic ' + Buffer.from(`${process.env.OPENOBSERVE_USER}:${process.env.OPENOBSERVE_PASSWORD}`).toString('base64');

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    'service.name': process.env.OTEL_SERVICE_NAME || 'biblioteca-api',
    'service.version': process.env.APP_VERSION || 'dev',
    'deployment.environment': process.env.NODE_ENV || 'development',
  }),
  // Trazas -> stream "default" de traces
  traceExporter: new OTLPTraceExporter({ url: `${base}/v1/traces`, headers: { Authorization: auth } }),
  // Métricas cada 15 s -> streams de métricas (uno por instrumento)
  metricReaders: [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${base}/v1/metrics`,
        headers: { Authorization: auth },
        temporalityPreference: AggregationTemporality.CUMULATIVE,
      }),
      exportIntervalMillis: 15000,
    }),
  ],
  // Logs -> stream "biblioteca_api"
  logRecordProcessors: [
    new BatchLogRecordProcessor({
      exporter: new OTLPLogExporter({
        url: `${base}/v1/logs`,
        headers: { Authorization: auth, 'stream-name': process.env.OPENOBSERVE_LOG_STREAM || 'biblioteca_api' },
      }),
    }),
  ],
  instrumentations: [
    new HttpInstrumentation({
      // No trazar las verificaciones del HEALTHCHECK de Docker para no llenar el panel
      ignoreIncomingRequestHook: (req) => req.url === '/api/health' && /node|curl|wget/i.test(req.headers['user-agent'] || ''),
    }),
    new ExpressInstrumentation(),
  ],
});

sdk.start();
console.log(`[telemetry] OpenTelemetry activo -> ${base} (traces, metrics, logs)`);

const shutdown = () => sdk.shutdown().catch((e) => console.error('[telemetry] error al cerrar', e));
module.exports = { shutdown };
