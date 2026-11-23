const { logs, trace, SeverityNumber } = require('@opentelemetry/api');

/*
 * Logger estructurado (JSON). Cada evento:
 *  - se imprime en consola en formato JSON (docker logs), y
 *  - se emite como LogRecord de OpenTelemetry, que el SDK exporta por OTLP a OpenObserve.
 * Si el SDK no está iniciado (pruebas), la API de OpenTelemetry es un no-op.
 */
const otelLogger = logs.getLogger('biblioteca-api');
const SILENCIOSO = process.env.NODE_ENV === 'test';

const NIVELES = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

function emitir(nivel, evento, atributos = {}) {
  const span = trace.getActiveSpan();
  const ctx = span?.spanContext();
  const registro = {
    timestamp: new Date().toISOString(),
    level: nivel,
    event: evento,
    ...atributos,
    ...(ctx ? { trace_id: ctx.traceId, span_id: ctx.spanId } : {}),
  };

  if (!SILENCIOSO) {
    const salida = nivel === 'error' ? console.error : console.log;
    salida(JSON.stringify(registro));
  }

  otelLogger.emit({
    severityNumber: NIVELES[nivel],
    severityText: nivel.toUpperCase(),
    body: evento,
    attributes: { event: evento, ...atributos },
  });
}

module.exports = {
  debug: (e, a) => emitir('debug', e, a),
  info: (e, a) => emitir('info', e, a),
  warn: (e, a) => emitir('warn', e, a),
  error: (e, a) => emitir('error', e, a),
};
