/**
 * Todas las respuestas de la API usan el mismo esquema JSON:
 * { statusCode: 200, data: [] }
 * `data` siempre es un arreglo.
 */
function send(res, statusCode, data = []) {
  return res.status(statusCode).json({
    statusCode,
    data: Array.isArray(data) ? data : [data],
  });
}

const error = (res, statusCode, message) => send(res, statusCode, [message]);

module.exports = { send, error };
