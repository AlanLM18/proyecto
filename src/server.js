// OpenTelemetry debe iniciarse antes de cargar express/http
const telemetry = require('./telemetry');

const app = require('./app');
const { DB_PATH } = require('./db/database');
const { createSocketServer, PORT: SOCKET_PORT } = require('./tcp/socketServer');
const logger = require('./observability/logger');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  logger.info('servidor_iniciado', { port: Number(PORT), db_path: DB_PATH, version: process.env.APP_VERSION || 'dev' });
});

createSocketServer();
console.log(`Socket TCP disponible en el puerto ${SOCKET_PORT}`);

// Una excepción no controlada deja el proceso en estado incierto: se registra,
// se envía la telemetría y se sale (Docker lo reinicia por --restart).
process.on('uncaughtException', async (e) => {
  logger.error('uncaught_exception', { error: e.message, stack: e.stack });
  await telemetry.shutdown();
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  logger.error('unhandled_rejection', { error: String(e?.message || e) });
});

// Cierre ordenado: se envía la telemetría pendiente antes de salir
for (const senal of ['SIGTERM', 'SIGINT']) {
  process.on(senal, async () => {
    logger.info('servidor_detenido', { signal: senal });
    server.close();
    await telemetry.shutdown();
    process.exit(0);
  });
}
