const { app, request, expectSchema } = require('./helpers');

describe('POST /api/alertas/webhook', () => {
  const original = process.env.ALERT_WEBHOOK_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.ALERT_WEBHOOK_TOKEN;
    else process.env.ALERT_WEBHOOK_TOKEN = original;
  });

  test('ERROR: sin token configurado el webhook está deshabilitado -> 503', async () => {
    delete process.env.ALERT_WEBHOOK_TOKEN;
    expectSchema(await request(app).post('/api/alertas/webhook').send({}), 503);
  });

  test('ERROR: token incorrecto o ausente -> 401', async () => {
    process.env.ALERT_WEBHOOK_TOKEN = 'secreto-de-prueba';
    expectSchema(await request(app).post('/api/alertas/webhook').send({}), 401);
    expectSchema(await request(app).post('/api/alertas/webhook').set('x-alert-token', 'otro-valor-distinto').send({}), 401);
  });

  test('con token correcto registra la alerta -> 200', async () => {
    process.env.ALERT_WEBHOOK_TOKEN = 'secreto-de-prueba';
    const res = await request(app)
      .post('/api/alertas/webhook')
      .set('x-alert-token', 'secreto-de-prueba')
      .send({ alerta: 'cpu_alta_ec2', stream: 'infra_metrics', conteo: '1' });
    expectSchema(res, 200);
  });

  test('acepta un cuerpo vacío con token correcto', async () => {
    process.env.ALERT_WEBHOOK_TOKEN = 'secreto-de-prueba';
    const res = await request(app).post('/api/alertas/webhook').set('x-alert-token', 'secreto-de-prueba');
    expectSchema(res, 200);
  });
});
