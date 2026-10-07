const app = require('./app');
const { DB_PATH } = require('./db/database');
const { createSocketServer, PORT: SOCKET_PORT } = require('./tcp/socketServer');  // ← agregar

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Práctica 3 corriendo en http://localhost:${PORT}`);
  console.log(`Base de datos SQLite: ${DB_PATH}`);
});

createSocketServer();                                                            // ← agregar
console.log(`Socket TCP disponible en el puerto ${SOCKET_PORT}`);                // ← agregar