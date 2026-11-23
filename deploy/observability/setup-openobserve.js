/*
 * Configura OpenObserve de forma idempotente (RF-05 y RF-06):
 *   - 3 dashboards: Infraestructura EC2, Aplicación (API) y Pipeline CI/CD
 *   - plantilla + destino webhook para alertas
 *   - alertas operativas (CPU, RAM, temperatura, errores 5xx, latencia, pipeline fallido)
 * Se ejecuta en cada despliegue; si algo ya existe lo reemplaza con la versión de este archivo.
 * Solo usa Node.js (fetch), sin dependencias.
 */
const URL_OO = (process.env.OPENOBSERVE_URL || 'http://localhost:5080').replace(/\/+$/, '');
const ORG = process.env.OPENOBSERVE_ORG || 'default';
const USER = process.env.OPENOBSERVE_USER;
const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || 'http://api:3000/api/alertas/webhook';
const WEBHOOK_TOKEN = process.env.ALERT_WEBHOOK_TOKEN || '';
const AUTH = 'Basic ' + Buffer.from(`${USER}:${process.env.OPENOBSERVE_PASSWORD}`).toString('base64');

async function oo(method, ruta, body) {
  const res = await fetch(`${URL_OO}${ruta}`, {
    method,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await res.text();
  let json;
  try {
    json = JSON.parse(texto);
  } catch {
    json = { message: texto };
  }
  return { ok: res.ok, status: res.status, json };
}

// ======================================================================= paneles
let siguienteId = 1;
const COLORES = ['#2563eb', '#16a34a', '#dc2626', '#f59e0b', '#7c3aed', '#0891b2', '#db2777'];

/**
 * Crea un panel con consulta SQL personalizada.
 *  x: columnas de agrupación (eje X / filas de tabla), y: columnas de valores,
 *  breakdown: columna que separa series (una línea por endpoint, por ejemplo).
 */
function panel({ tipo, titulo, descripcion = '', sql, stream, streamType = 'logs', x = [], y = [], breakdown = [], unidad = null, unidadCustom = '', pos, min, max, decimales = 2 }) {
  const id = siguienteId++;
  const col = (c, i) => ({
    label: c.label,
    alias: c.col,
    column: c.col,
    color: c.color || COLORES[i % COLORES.length],
    aggregationFunction: null,
    isDerived: false,
  });
  return {
    id: `Panel_ID${id}`,
    type: tipo,
    title: titulo,
    description: descripcion,
    config: {
      show_legends: true,
      legends_position: 'bottom',
      unit: unidad,
      unit_custom: unidadCustom,
      decimals: decimales,
      axis_border_show: false,
      connect_nulls: true,
      wrap_table_cells: true,
      table_transpose: false,
      table_dynamic_columns: false,
      drilldown: [],
      mark_line: [],
      color: { mode: 'palette-classic-by-series', fixedColor: ['#2563eb'], seriesBy: 'last' },
      base_map: { type: 'osm' },
      map_view: { zoom: 1, lat: 0, lng: 0 },
      map_symbol_style: { size: 'by Value', size_by_value: { min: 1, max: 100 }, size_fixed: 2 },
      trellis: { layout: null, num_of_columns: 1, group_by_y_axis: false },
    },
    queryType: 'sql',
    queries: [
      {
        query: sql,
        vrlFunctionQuery: '',
        customQuery: true,
        fields: {
          stream,
          stream_type: streamType,
          x: x.map(col),
          y: y.map(col),
          z: [],
          breakdown: breakdown.map(col),
          filter: { filterType: 'group', logicalOperator: 'AND', conditions: [] },
        },
        config: { promql_legend: '', layer_type: 'scatter', weight_fixed: 1, limit: 0, min, max, time_shift: [] },
      },
    ],
    layout: { x: pos[0], y: pos[1], w: pos[2], h: pos[3], i: id },
    htmlContent: '',
    markdownContent: '',
  };
}

const dashboard = (titulo, descripcion, panels, periodo = '1h') => ({
  version: 5,
  title: titulo,
  description: descripcion,
  role: '',
  owner: USER,
  created: new Date().toISOString(),
  tabs: [{ tabId: 'default', name: 'General', panels }],
  variables: { list: [], showDynamicFilters: true },
  defaultDatetimeDuration: { type: 'relative', relativeTimePeriod: periodo, startTime: 0, endTime: 0 },
});

const T = { label: 'Tiempo', col: 'x' };
const H = "histogram(_timestamp, '1 minute')";

// ---------------------------------------------------------------- 1) Infraestructura
const INFRA = '"infra_metrics"';
const ultimo = (campo) => `SELECT ${campo} AS valor FROM ${INFRA} ORDER BY _timestamp DESC LIMIT 1`;

const dashInfra = dashboard(
  '1. Infraestructura EC2',
  'CPU, memoria RAM, ancho de banda, temperatura y disco de la instancia EC2 (agente infra-agent).',
  [
    panel({ tipo: 'metric', titulo: 'CPU actual', sql: ultimo('cpu_pct'), stream: 'infra_metrics', y: [{ label: 'CPU', col: 'valor' }], unidad: 'percent', pos: [0, 0, 12, 5] }),
    panel({ tipo: 'metric', titulo: 'RAM en uso', sql: ultimo('ram_pct'), stream: 'infra_metrics', y: [{ label: 'RAM', col: 'valor' }], unidad: 'percent', pos: [12, 0, 12, 5] }),
    panel({ tipo: 'metric', titulo: 'Temperatura (°C)', sql: ultimo('temperatura_c'), stream: 'infra_metrics', y: [{ label: 'Temperatura', col: 'valor' }], unidad: 'custom', unidadCustom: '°C', decimales: 1, pos: [24, 0, 12, 5] }),
    panel({ tipo: 'metric', titulo: 'Ancho de banda (kbps)', sql: ultimo('red_total_kbps'), stream: 'infra_metrics', y: [{ label: 'kbps', col: 'valor' }], unidad: 'custom', unidadCustom: 'kbps', decimales: 1, pos: [36, 0, 12, 5] }),
    panel({
      tipo: 'area', titulo: 'Consumo de CPU (%)', stream: 'infra_metrics', unidad: 'percent', min: 0, max: 100, pos: [0, 5, 24, 9],
      sql: `SELECT ${H} AS x, avg(cpu_pct) AS cpu, max(cpu_pct) AS cpu_max FROM ${INFRA} GROUP BY x ORDER BY x`,
      x: [T], y: [{ label: 'CPU promedio %', col: 'cpu' }, { label: 'CPU máximo %', col: 'cpu_max', color: '#dc2626' }],
    }),
    panel({
      tipo: 'area', titulo: 'Memoria RAM', stream: 'infra_metrics', unidad: 'custom', unidadCustom: 'MB', pos: [24, 5, 24, 9],
      sql: `SELECT ${H} AS x, avg(ram_usada_mb) AS usada, max(ram_total_mb) AS total FROM ${INFRA} GROUP BY x ORDER BY x`,
      x: [T], y: [{ label: 'RAM usada (MB)', col: 'usada', color: '#7c3aed' }, { label: 'RAM total (MB)', col: 'total', color: '#94a3b8' }],
    }),
    panel({
      tipo: 'line', titulo: 'Ancho de banda (kbps)', stream: 'infra_metrics', unidad: 'custom', unidadCustom: 'kbps', pos: [0, 14, 24, 9],
      sql: `SELECT ${H} AS x, avg(red_rx_kbps) AS entrada, avg(red_tx_kbps) AS salida FROM ${INFRA} GROUP BY x ORDER BY x`,
      x: [T], y: [{ label: 'Entrada (RX)', col: 'entrada', color: '#0891b2' }, { label: 'Salida (TX)', col: 'salida', color: '#f59e0b' }],
    }),
    panel({
      tipo: 'line', titulo: 'Temperatura (°C)', descripcion: 'Si la instancia no expone sensores térmicos, se muestra una estimación basada en la carga de CPU (temperatura_fuente = estimada).',
      stream: 'infra_metrics', unidad: 'custom', unidadCustom: '°C', decimales: 1, pos: [24, 14, 24, 9],
      sql: `SELECT ${H} AS x, avg(temperatura_c) AS temperatura, temperatura_fuente AS fuente FROM ${INFRA} GROUP BY x, fuente ORDER BY x`,
      x: [T], y: [{ label: 'Temperatura °C', col: 'temperatura', color: '#dc2626' }], breakdown: [{ label: 'Fuente', col: 'fuente' }],
    }),
    panel({
      tipo: 'line', titulo: 'Uso de disco (%)', stream: 'infra_metrics', unidad: 'percent', min: 0, max: 100, pos: [0, 23, 24, 8],
      sql: `SELECT ${H} AS x, avg(disco_pct) AS disco FROM ${INFRA} GROUP BY x ORDER BY x`,
      x: [T], y: [{ label: 'Disco %', col: 'disco', color: '#16a34a' }],
    }),
    panel({
      tipo: 'line', titulo: 'Carga promedio del sistema', stream: 'infra_metrics', pos: [24, 23, 24, 8],
      sql: `SELECT ${H} AS x, avg(carga_1m) AS c1, avg(carga_5m) AS c5, avg(carga_15m) AS c15 FROM ${INFRA} GROUP BY x ORDER BY x`,
      x: [T], y: [{ label: '1 min', col: 'c1' }, { label: '5 min', col: 'c5' }, { label: '15 min', col: 'c15' }],
    }),
  ]
);

// ---------------------------------------------------------------- 2) Aplicación
const API = '"biblioteca_api"';
const REQ = `FROM ${API} WHERE event = 'http_request'`;

const dashApp = dashboard(
  '2. Aplicación API (OpenTelemetry)',
  'Latencia, peticiones por segundo, tasa de error y statusCode por endpoint; trazas y logs de la API.',
  [
    panel({ tipo: 'metric', titulo: 'Peticiones totales', sql: `SELECT count(*) AS valor ${REQ}`, stream: 'biblioteca_api', y: [{ label: 'Peticiones', col: 'valor' }], decimales: 0, pos: [0, 0, 12, 5] }),
    panel({ tipo: 'metric', titulo: 'Latencia p95 (ms)', sql: `SELECT approx_percentile_cont(duration_ms, 0.95) AS valor ${REQ}`, stream: 'biblioteca_api', y: [{ label: 'p95', col: 'valor' }], unidad: 'custom', unidadCustom: 'ms', pos: [12, 0, 12, 5] }),
    panel({ tipo: 'metric', titulo: 'Tasa de error HTTP (%)', sql: `SELECT sum(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) * 100.0 / count(*) AS valor ${REQ}`, stream: 'biblioteca_api', y: [{ label: 'Error %', col: 'valor' }], unidad: 'percent', pos: [24, 0, 12, 5] }),
    panel({ tipo: 'metric', titulo: 'Errores 5xx', sql: `SELECT count(*) AS valor ${REQ} AND status_code >= 500`, stream: 'biblioteca_api', y: [{ label: '5xx', col: 'valor' }], decimales: 0, pos: [36, 0, 12, 5] }),
    panel({
      tipo: 'line', titulo: 'Peticiones por segundo por endpoint', stream: 'biblioteca_api', unidad: 'custom', unidadCustom: 'req/s', decimales: 3, pos: [0, 5, 24, 9],
      sql: `SELECT ${H} AS x, route, count(*) / 60.0 AS rps ${REQ} GROUP BY x, route ORDER BY x`,
      x: [T], y: [{ label: 'req/s', col: 'rps' }], breakdown: [{ label: 'Endpoint', col: 'route' }],
    }),
    panel({
      tipo: 'line', titulo: 'Latencia promedio por endpoint (ms)', stream: 'biblioteca_api', unidad: 'custom', unidadCustom: 'ms', pos: [24, 5, 24, 9],
      sql: `SELECT ${H} AS x, route, avg(duration_ms) AS latencia ${REQ} GROUP BY x, route ORDER BY x`,
      x: [T], y: [{ label: 'ms', col: 'latencia' }], breakdown: [{ label: 'Endpoint', col: 'route' }],
    }),
    panel({
      tipo: 'bar', titulo: 'Tasa de error HTTP por endpoint (%)', stream: 'biblioteca_api', unidad: 'percent', pos: [0, 14, 24, 9],
      sql: `SELECT route, sum(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) * 100.0 / count(*) AS tasa_error ${REQ} GROUP BY route ORDER BY tasa_error DESC`,
      x: [{ label: 'Endpoint', col: 'route' }], y: [{ label: 'Error %', col: 'tasa_error', color: '#dc2626' }],
    }),
    panel({
      tipo: 'pie', titulo: 'Peticiones por statusCode', stream: 'biblioteca_api', decimales: 0, pos: [24, 14, 24, 9],
      sql: `SELECT CAST(status_code AS VARCHAR) AS codigo, count(*) AS total ${REQ} GROUP BY codigo ORDER BY total DESC`,
      x: [{ label: 'statusCode', col: 'codigo' }], y: [{ label: 'Peticiones', col: 'total' }],
    }),
    panel({
      tipo: 'table', titulo: 'Resumen por endpoint', stream: 'biblioteca_api', pos: [0, 23, 48, 9],
      sql: `SELECT method AS metodo, route AS endpoint, count(*) AS peticiones, round(avg(duration_ms), 2) AS latencia_prom_ms, round(approx_percentile_cont(duration_ms, 0.95), 2) AS latencia_p95_ms, sum(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errores, max(to_timestamp_micros(_timestamp)) AS ultima_peticion ${REQ} GROUP BY metodo, endpoint ORDER BY peticiones DESC`,
      x: [{ label: 'Método', col: 'metodo' }, { label: 'Endpoint', col: 'endpoint' }],
      y: [{ label: 'Peticiones', col: 'peticiones' }, { label: 'Latencia prom. (ms)', col: 'latencia_prom_ms' }, { label: 'Latencia p95 (ms)', col: 'latencia_p95_ms' }, { label: 'Errores', col: 'errores' }, { label: 'Última petición', col: 'ultima_peticion' }],
    }),
    panel({
      tipo: 'bar', titulo: 'Trazas: duración promedio por operación (ms)', descripcion: 'Spans de OpenTelemetry: HTTP, middleware de Express y consultas SQLite.', stream: 'default', streamType: 'traces', unidad: 'custom', unidadCustom: 'ms', pos: [0, 32, 24, 10],
      sql: `SELECT operation_name AS operacion, avg(duration) / 1000.0 AS duracion_ms FROM "default" WHERE service_name = 'biblioteca-api' GROUP BY operacion ORDER BY duracion_ms DESC LIMIT 15`,
      x: [{ label: 'Operación', col: 'operacion' }], y: [{ label: 'ms', col: 'duracion_ms', color: '#0891b2' }],
    }),
    panel({
      tipo: 'table', titulo: 'Trazas: consultas a la base de datos (SQLite)', stream: 'default', streamType: 'traces', pos: [24, 32, 24, 10],
      sql: `SELECT db_operation AS operacion, db_sql_table AS tabla, count(*) AS consultas, round(avg(duration) / 1000.0, 3) AS duracion_prom_ms FROM "default" WHERE db_system = 'sqlite' GROUP BY operacion, tabla ORDER BY consultas DESC`,
      x: [{ label: 'Operación', col: 'operacion' }, { label: 'Tabla', col: 'tabla' }],
      y: [{ label: 'Consultas', col: 'consultas' }, { label: 'Duración prom. (ms)', col: 'duracion_prom_ms' }],
    }),
    panel({
      tipo: 'table', titulo: 'Últimas peticiones HTTP (timestamp, método, ruta, statusCode, tiempo de respuesta)', stream: 'biblioteca_api', pos: [0, 42, 48, 10],
      sql: `SELECT to_timestamp_micros(_timestamp) AS fecha, method AS metodo, path AS ruta, status_code AS status, duration_ms AS tiempo_ms, trace_id ${REQ} ORDER BY _timestamp DESC LIMIT 50`,
      x: [{ label: 'Fecha', col: 'fecha' }, { label: 'Método', col: 'metodo' }, { label: 'Ruta', col: 'ruta' }, { label: 'statusCode', col: 'status' }],
      y: [{ label: 'Tiempo (ms)', col: 'tiempo_ms' }, { label: 'trace_id', col: 'trace_id' }],
    }),
    panel({
      tipo: 'table', titulo: 'Excepciones y eventos de error', stream: 'biblioteca_api', pos: [0, 52, 48, 9],
      sql: `SELECT to_timestamp_micros(_timestamp) AS fecha, severity AS nivel, event AS evento, path AS ruta, status_code AS status FROM ${API} WHERE severity IN ('ERROR', 'WARN') AND event != 'alerta_recibida' ORDER BY _timestamp DESC LIMIT 50`,
      x: [{ label: 'Fecha', col: 'fecha' }, { label: 'Nivel', col: 'nivel' }, { label: 'Evento', col: 'evento' }, { label: 'Ruta', col: 'ruta' }],
      y: [{ label: 'statusCode', col: 'status' }],
    }),
  ]
);

// ---------------------------------------------------------------- 3) Pipeline CI/CD y alertas
const PIPE = '"cicd_pipeline"';
const dashPipeline = dashboard(
  '3. Pipeline CI/CD y Alertas',
  'Resultados de las pruebas (Jest + Playwright), despliegues en EC2 y alertas operativas disparadas.',
  [
    panel({ tipo: 'metric', titulo: 'Ejecuciones de pruebas', sql: `SELECT count(*) AS valor FROM ${PIPE} WHERE event_type = 'pruebas'`, stream: 'cicd_pipeline', y: [{ label: 'Ejecuciones', col: 'valor' }], decimales: 0, pos: [0, 0, 12, 5] }),
    panel({ tipo: 'metric', titulo: 'Pruebas fallidas (deploy bloqueado)', sql: `SELECT count(*) AS valor FROM ${PIPE} WHERE event_type = 'pruebas' AND status = 'failure'`, stream: 'cicd_pipeline', y: [{ label: 'Fallidas', col: 'valor' }], decimales: 0, pos: [12, 0, 12, 5] }),
    panel({ tipo: 'metric', titulo: 'Despliegues exitosos en EC2', sql: `SELECT count(*) AS valor FROM ${PIPE} WHERE event_type = 'despliegue' AND status = 'success'`, stream: 'cicd_pipeline', y: [{ label: 'Despliegues', col: 'valor' }], decimales: 0, pos: [24, 0, 12, 5] }),
    panel({ tipo: 'metric', titulo: 'Alertas disparadas', sql: `SELECT count(*) AS valor FROM ${API} WHERE event = 'alerta_recibida'`, stream: 'biblioteca_api', y: [{ label: 'Alertas', col: 'valor' }], decimales: 0, pos: [36, 0, 12, 5] }),
    panel({
      tipo: 'bar', titulo: 'Ejecuciones del pipeline por resultado', stream: 'cicd_pipeline', decimales: 0, pos: [0, 5, 24, 9],
      sql: `SELECT histogram(_timestamp, '1 hour') AS x, event_type || ': ' || status AS resultado, count(*) AS total FROM ${PIPE} GROUP BY x, resultado ORDER BY x`,
      x: [T], y: [{ label: 'Ejecuciones', col: 'total' }], breakdown: [{ label: 'Resultado', col: 'resultado' }],
    }),
    panel({
      tipo: 'pie', titulo: 'Resultado de las pruebas', stream: 'cicd_pipeline', decimales: 0, pos: [24, 5, 24, 9],
      sql: `SELECT status AS resultado, count(*) AS total FROM ${PIPE} WHERE event_type = 'pruebas' GROUP BY resultado`,
      x: [{ label: 'Resultado', col: 'resultado' }], y: [{ label: 'Ejecuciones', col: 'total' }],
    }),
    panel({
      tipo: 'table', titulo: 'Registro de ejecuciones del pipeline (commit, rama, usuario)', stream: 'cicd_pipeline', pos: [0, 14, 48, 11],
      sql: `SELECT to_timestamp_micros(_timestamp) AS fecha, event_type AS evento, status AS resultado, branch AS rama, commit_short AS commit, actor AS usuario, jest AS jest, playwright AS playwright, commit_message AS mensaje, run_url AS ejecucion FROM ${PIPE} ORDER BY _timestamp DESC LIMIT 50`,
      x: [{ label: 'Fecha', col: 'fecha' }, { label: 'Evento', col: 'evento' }, { label: 'Resultado', col: 'resultado' }, { label: 'Rama', col: 'rama' }, { label: 'Commit', col: 'commit' }, { label: 'Usuario', col: 'usuario' }],
      y: [{ label: 'Jest', col: 'jest' }, { label: 'Playwright', col: 'playwright' }, { label: 'Mensaje', col: 'mensaje' }, { label: 'Ejecución', col: 'ejecucion' }],
    }),
    panel({
      tipo: 'table', titulo: 'Alertas operativas disparadas', stream: 'biblioteca_api', pos: [0, 25, 48, 9],
      sql: `SELECT to_timestamp_micros(_timestamp) AS fecha, alerta, stream, conteo FROM ${API} WHERE event = 'alerta_recibida' ORDER BY _timestamp DESC LIMIT 50`,
      x: [{ label: 'Fecha', col: 'fecha' }, { label: 'Alerta', col: 'alerta' }, { label: 'Stream', col: 'stream' }],
      y: [{ label: 'Conteo', col: 'conteo' }],
    }),
  ],
  '7d'
);

// ======================================================================= alertas
const ALERTAS = [
  { name: 'cpu_alta_ec2', stream: 'infra_metrics', desc: 'CPU promedio de la EC2 mayor a 80% en 5 minutos',
    sql: 'SELECT avg(cpu_pct) AS cpu FROM "infra_metrics" HAVING avg(cpu_pct) > 80' },
  { name: 'ram_alta_ec2', stream: 'infra_metrics', desc: 'RAM en uso mayor a 90% en 5 minutos',
    sql: 'SELECT avg(ram_pct) AS ram FROM "infra_metrics" HAVING avg(ram_pct) > 90' },
  { name: 'temperatura_alta_ec2', stream: 'infra_metrics', desc: 'Temperatura mayor a 75 °C',
    sql: 'SELECT max(temperatura_c) AS temperatura FROM "infra_metrics" HAVING max(temperatura_c) > 75' },
  { name: 'errores_5xx_api', stream: 'biblioteca_api', desc: 'La API respondió con errores 5xx en los últimos 5 minutos',
    sql: `SELECT count(*) AS errores FROM "biblioteca_api" WHERE event = 'http_request' AND status_code >= 500 HAVING count(*) > 0` },
  { name: 'latencia_alta_api', stream: 'biblioteca_api', desc: 'Latencia p95 de la API mayor a 1000 ms',
    sql: `SELECT approx_percentile_cont(duration_ms, 0.95) AS p95 FROM "biblioteca_api" WHERE event = 'http_request' HAVING approx_percentile_cont(duration_ms, 0.95) > 1000` },
  { name: 'tasa_error_alta_api', stream: 'biblioteca_api', desc: 'Más del 50% de peticiones con error (mínimo 20 peticiones)',
    sql: `SELECT count(*) AS total FROM "biblioteca_api" WHERE event = 'http_request' HAVING count(*) >= 20 AND sum(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) * 100.0 / count(*) > 50` },
  { name: 'pipeline_fallido', stream: 'cicd_pipeline', desc: 'Una ejecución del pipeline falló (pruebas o despliegue)',
    sql: `SELECT count(*) AS fallos FROM "cicd_pipeline" WHERE status = 'failure' HAVING count(*) > 0` },
];

// ======================================================================= ejecución
async function upsert(rutaBase, nombre, cuerpo) {
  const creado = await oo('POST', rutaBase, cuerpo);
  if (creado.ok) return 'creado';
  const actualizado = await oo('PUT', `${rutaBase}/${encodeURIComponent(nombre)}`, cuerpo);
  if (actualizado.ok) return 'actualizado';
  throw new Error(`${nombre}: ${creado.json.message} / ${actualizado.json.message}`);
}

async function esperarOpenObserve() {
  for (let i = 0; i < 30; i++) {
    try {
      if ((await fetch(`${URL_OO}/healthz`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`OpenObserve no responde en ${URL_OO}`);
}

async function configurarDashboards() {
  const { json } = await oo('GET', `/api/${ORG}/dashboards`);
  const existentes = (json.dashboards || []).map((d) => d.v8 || d.v7 || d.v6 || d.v5 || d.v4 || d.v3 || d.v2 || d.v1).filter(Boolean);

  for (const d of [dashInfra, dashApp, dashPipeline]) {
    for (const viejo of existentes.filter((e) => e.title === d.title)) {
      await oo('DELETE', `/api/${ORG}/dashboards/${viejo.dashboardId}?folder=default`);
    }
    const r = await oo('POST', `/api/${ORG}/dashboards?folder=default`, d);
    if (!r.ok) throw new Error(`Dashboard "${d.title}": ${r.json.message}`);
    console.log(`  ✔ dashboard "${d.title}" (${d.tabs[0].panels.length} paneles)`);
  }
}

async function configurarAlertas() {
  if (!WEBHOOK_TOKEN) {
    console.log('  ! ALERT_WEBHOOK_TOKEN no definido: se omiten las alertas');
    return;
  }

  const plantilla = {
    name: 'plantilla_biblioteca',
    type: 'http',
    title: '',
    body: JSON.stringify({ alerta: '{alert_name}', stream: '{stream_name}', tipo: '{alert_type}', conteo: '{alert_count}', inicio: '{alert_start_time}', fin: '{alert_end_time}', url: '{alert_url}' }),
  };
  console.log(`  ✔ plantilla ${await upsert(`/api/${ORG}/alerts/templates`, plantilla.name, plantilla)}`);

  const destino = {
    name: 'webhook_api', type: 'http', url: WEBHOOK_URL, method: 'post', skip_tls_verify: true,
    template: plantilla.name, headers: { 'x-alert-token': WEBHOOK_TOKEN },
  };
  console.log(`  ✔ destino webhook ${await upsert(`/api/${ORG}/alerts/destinations`, destino.name, destino)} -> ${WEBHOOK_URL}`);

  const { json: streams } = await oo('GET', `/api/${ORG}/streams?type=logs`);
  const disponibles = new Set((streams.list || []).map((s) => s.name));
  const { json: lista } = await oo('GET', `/api/v2/${ORG}/alerts`);
  const actuales = lista.list || [];

  for (const a of ALERTAS) {
    if (!disponibles.has(a.stream)) {
      console.log(`  ! alerta "${a.name}" pendiente: el stream "${a.stream}" aún no tiene datos`);
      continue;
    }
    for (const vieja of actuales.filter((x) => x.name === a.name)) {
      await oo('DELETE', `/api/v2/${ORG}/alerts/${vieja.alert_id}`);
    }
    const r = await oo('POST', `/api/v2/${ORG}/alerts?folder=default`, {
      name: a.name,
      description: a.desc,
      stream_type: 'logs',
      stream_name: a.stream,
      is_real_time: false,
      enabled: true,
      query_condition: { type: 'sql', sql: a.sql },
      trigger_condition: { period: 5, operator: '>=', threshold: 1, frequency: 1, frequency_type: 'minutes', silence: 15 },
      destinations: [destino.name],
    });
    if (!r.ok) throw new Error(`Alerta ${a.name}: ${r.json.message}`);
    console.log(`  ✔ alerta "${a.name}" — ${a.desc}`);
  }
}

(async () => {
  console.log(`Configurando OpenObserve en ${URL_OO} (org ${ORG})`);
  await esperarOpenObserve();
  await configurarDashboards();
  await configurarAlertas();
  console.log('OpenObserve configurado.');
})().catch((e) => {
  console.error(`Error al configurar OpenObserve: ${e.message}`);
  process.exit(1);
});
