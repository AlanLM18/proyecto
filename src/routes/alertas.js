const { Router } = require('express');
const crypto = require('crypto');
const { send, error } = require('../utils/response');
const logger = require('../observability/logger');

/*
 * POST /api/alertas/webhook
 * Destino (webhook) de las alertas de OpenObserve (RF-06). Cada alerta disparada
 * se registra como log estructurado "alerta_recibida", que regresa a OpenObserve y
 * se muestra en el dashboard de alertas operativas.
 * Se protege con el encabezado x-alert-token = ALERT_WEBHOOK_TOKEN.
 */
const router = Router();

const tokenValido = (recibido) => {
  const esperado = process.env.ALERT_WEBHOOK_TOKEN || '';
  if (!esperado || typeof recibido !== 'string' || recibido.length !== esperado.length) return false;
  return crypto.timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado));
};

router.post('/webhook', (req, res) => {
  if (!process.env.ALERT_WEBHOOK_TOKEN) return error(res, 503, 'Webhook de alertas deshabilitado.');
  if (!tokenValido(req.get('x-alert-token'))) return error(res, 401, 'Token de alerta inválido.');

  const alerta = req.body && typeof req.body === 'object' ? req.body : {};
  logger.warn('alerta_recibida', {
    alerta: String(alerta.alerta ?? alerta.alert_name ?? 'desconocida').slice(0, 120),
    stream: String(alerta.stream ?? '').slice(0, 120),
    conteo: String(alerta.conteo ?? '').slice(0, 20),
    detalle: JSON.stringify(alerta).slice(0, 1000),
  });
  send(res, 200, ['Alerta registrada.']);
});

module.exports = router;
