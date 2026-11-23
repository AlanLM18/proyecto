const { trace, SpanKind, SpanStatusCode } = require('@opentelemetry/api');

/*
 * better-sqlite3 no tiene instrumentación automática de OpenTelemetry, así que se
 * envuelve db.prepare(): cada run/get/all de una sentencia crea un span hijo de la
 * petición HTTP activa. Así la traza muestra HTTP -> Express -> consulta SQL.
 */
const tracer = trace.getTracer('biblioteca-sqlite');

function instrumentDb(db) {
  const prepareOriginal = db.prepare.bind(db);

  db.prepare = (sql) => {
    const stmt = prepareOriginal(sql);
    const sentencia = sql.trim().replace(/\s+/g, ' ');
    const operacion = sentencia.split(' ')[0].toUpperCase();
    const tabla = (sentencia.match(/\b(?:FROM|INTO|UPDATE)\s+(\w+)/i) || [])[1] || 'desconocida';

    for (const metodo of ['run', 'get', 'all']) {
      const original = stmt[metodo].bind(stmt);
      stmt[metodo] = (...args) =>
        tracer.startActiveSpan(
          `SQLite ${operacion} ${tabla}`,
          {
            kind: SpanKind.CLIENT,
            attributes: {
              'db.system': 'sqlite',
              'db.operation': operacion,
              'db.sql.table': tabla,
              'db.statement': sentencia,
            },
          },
          (span) => {
            try {
              const resultado = original(...args);
              if (metodo === 'all' && Array.isArray(resultado)) span.setAttribute('db.rows', resultado.length);
              if (metodo === 'run' && resultado) span.setAttribute('db.changes', resultado.changes);
              return resultado;
            } catch (e) {
              span.recordException(e);
              span.setStatus({ code: SpanStatusCode.ERROR, message: e.message });
              throw e;
            } finally {
              span.end();
            }
          }
        );
    }
    return stmt;
  };

  return db;
}

module.exports = { instrumentDb };
