const net = require('net');
const { getLibroById, createLibro } = require('../db/librosRepo');

/*
 * Mejora (Parte 2 adicional): protocolo propio de texto sobre un socket TCP plano
 * (no HTTP), en el puerto 6061, dentro del mismo contenedor que la API REST.
 *
 * Comandos soportados (cada uno termina con salto de línea):
 *
 *   {insert:<element>}   -> inserta un libro. <element> es el MISMO cuerpo JSON
 *                           que se usaba en POST /api/libros (Parte 1):
 *                           {"titulo":"...","isbn":"...","anioPublicacion":1967,
 *                            "autorId":1,"categoriaId":1}
 *
 *   {get:<element>}      -> obtiene datos de un elemento.
 *                           <element> = id numérico del libro  -> un libro
 *                           <element> = "all"                  -> todos los libros
 *
 * Respuesta: siempre un JSON de una línea con el mismo esquema que la API REST:
 *   { "statusCode": 200, "data": [] }
 */

const PORT = Number(process.env.SOCKET_PORT || 6061);

function respond(socket, statusCode, data) {
  socket.write(JSON.stringify({ statusCode, data: Array.isArray(data) ? data : [data] }) + '\n');
}

/**
 * El mensaje tiene la forma {comando:<elemento>}. <elemento> puede ser JSON y
 * traer sus propias llaves, así que no se puede usar una expresión regular simple.
 * Como el envoltorio solo agrega UNA llave de cierre extra al final, basta con
 * quitar el prefijo "{comando:" y la última "}" del mensaje completo.
 */
function parseMessage(raw) {
  const msg = raw.trim();

  for (const comando of ['insert', 'get']) {
    const prefix = `{${comando}:`;
    if (msg.startsWith(prefix) && msg.endsWith('}')) {
      const element = msg.slice(prefix.length, -1).trim();
      return { comando, element };
    }
  }
  return null;
}

function handleInsert(socket, element) {
  let body;
  try {
    body = JSON.parse(element);
  } catch {
    return respond(socket, 400, 'El elemento de insert debe ser un JSON válido: {"titulo":...,"isbn":...,"anioPublicacion":...,"autorId":...,"categoriaId":...}');
  }

  const resultado = createLibro(body);
  if (!resultado.ok) return respond(socket, resultado.status, resultado.errores);

  respond(socket, 200, [resultado.libro]);
}

function handleGet(socket, element) {
  if (element.toLowerCase() === 'all') {
    const { listLibros } = require('../db/librosRepo');
    return respond(socket, 200, listLibros());
  }

  const id = Number(element);
  if (!Number.isInteger(id) || id < 1) {
    return respond(socket, 400, 'El elemento de get debe ser un Id numérico de libro, o "all".');
  }

  const libro = getLibroById(id);
  if (!libro) return respond(socket, 404, `No existe un libro con Id ${id}.`);

  respond(socket, 200, [libro]);
}

function createSocketServer() {
  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';

    socket.write(
      JSON.stringify({
        statusCode: 200,
        data: ['Conectado al socket de Práctica 3. Comandos: {insert:<element>} y {get:<element>}'],
      }) + '\n'
    );

    socket.on('data', (chunk) => {
      buffer += chunk;

      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (!line.trim()) continue;

        const parsed = parseMessage(line);
        if (!parsed) {
          respond(socket, 400, 'Formato inválido. Use {insert:<element>} o {get:<element>}.');
          continue;
        }

        try {
          if (parsed.comando === 'insert') handleInsert(socket, parsed.element);
          else handleGet(socket, parsed.element);
        } catch (e) {
          respond(socket, 500, `Error interno: ${e.message}`);
        }
      }
    });

    socket.on('error', () => {});
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Socket TCP (insert/get) escuchando en el puerto ${PORT}`);
  });

  return server;
}

module.exports = { createSocketServer, PORT };