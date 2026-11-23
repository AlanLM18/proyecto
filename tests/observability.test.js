const { app, request, expectSchema } = require('./helpers');
const { rutaDe } = require('../src/observability/httpMetrics');
const logger = require('../src/observability/logger');

describe('GET /api/health', () => {
  test('responde 200 con estado ok, versión y timestamp', async () => {
    const res = await request(app).get('/api/health');
    expectSchema(res, 200);
    expect(res.body.data[0]).toMatchObject({ status: 'ok' });
    expect(new Date(res.body.data[0].timestamp).toString()).not.toBe('Invalid Date');
  });
});

describe('observabilidad', () => {
  test('rutaDe usa la plantilla de la ruta, no el Id concreto', () => {
    expect(rutaDe({ route: { path: '/:id' }, baseUrl: '/api/libros' }, {})).toBe('/api/libros/:id');
    expect(rutaDe({ route: { path: '/' }, baseUrl: '/api/libros' }, {})).toBe('/api/libros');
    expect(rutaDe({ path: '/x', baseUrl: '' }, { statusCode: 404 })).toBe('ruta_no_encontrada');
    expect(rutaDe({ path: '/x', baseUrl: '' }, { statusCode: 401 })).toBe('/x');
  });

  test('el logger acepta todos los niveles sin lanzar errores', () => {
    for (const nivel of ['debug', 'info', 'warn', 'error']) expect(() => logger[nivel]('prueba', { a: 1 })).not.toThrow();
  });

  test('una excepción no controlada responde 500 con el esquema estándar', async () => {
    const express = require('express');
    const { db } = require('../src/db/database');
    const original = db.prepare;
    db.prepare = () => { throw new Error('fallo simulado de BD'); };
    try {
      const res = await request(app).get('/api/categorias');
      expectSchema(res, 500);
    } finally {
      db.prepare = original;
    }
    expect(express).toBeDefined();
  });
});
