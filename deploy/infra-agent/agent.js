/*
 * Agente de monitoreo de infraestructura (RF-05).
 * Lee las métricas del HOST (la instancia EC2) desde /proc y /sys montados en el
 * contenedor y las envía cada N segundos a OpenObserve vía API HTTP/JSON
 * (stream "infra_metrics"). No tiene dependencias: solo Node.js.
 *
 *   CPU (%)            /host/proc/stat
 *   RAM (MB y %)       /host/proc/meminfo
 *   Ancho de banda     /host/proc/1/net/dev   (interfaces reales del host)
 *   Disco (%)          statfs sobre /hostfs
 *   Temperatura (°C)   /host/sys/class/thermal y /host/sys/class/hwmon
 *
 * Las instancias EC2 virtualizadas normalmente NO exponen sensores térmicos. En ese
 * caso se reporta una temperatura ESTIMADA a partir de la carga de CPU y se marca con
 * temperatura_fuente = "estimada" para no confundirla con una lectura real.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const URL_OO = (process.env.OPENOBSERVE_URL || 'http://openobserve:5080').replace(/\/+$/, '');
const ORG = process.env.OPENOBSERVE_ORG || 'default';
const STREAM = process.env.OPENOBSERVE_STREAM || 'infra_metrics';
const INTERVALO = Number(process.env.INTERVALO_SEGUNDOS || 10) * 1000;
const PROC = process.env.HOST_PROC || '/host/proc';
const SYS = process.env.HOST_SYS || '/host/sys';
const ROOTFS = process.env.HOST_ROOTFS || '/hostfs';
const HOST = process.env.HOST_NAME || os.hostname();
const AUTH = 'Basic ' + Buffer.from(`${process.env.OPENOBSERVE_USER}:${process.env.OPENOBSERVE_PASSWORD}`).toString('base64');

const leer = (ruta) => {
  try {
    return fs.readFileSync(ruta, 'utf8');
  } catch {
    return null;
  }
};
const redondear = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

// ------------------------------------------------------------------ CPU
function muestraCpu() {
  const linea = (leer(`${PROC}/stat`) || '').split('\n').find((l) => l.startsWith('cpu '));
  if (!linea) return null;
  const v = linea.trim().split(/\s+/).slice(1).map(Number);
  const inactivo = v[3] + (v[4] || 0); // idle + iowait
  const total = v.reduce((a, b) => a + b, 0);
  return { inactivo, total };
}

// ------------------------------------------------------------------ RAM
function memoria() {
  const txt = leer(`${PROC}/meminfo`) || '';
  const kb = (clave) => Number((txt.match(new RegExp(`^${clave}:\\s+(\\d+)`, 'm')) || [])[1] || 0);
  const total = kb('MemTotal');
  const disponible = kb('MemAvailable');
  const swapTotal = kb('SwapTotal');
  const swapLibre = kb('SwapFree');
  return {
    ram_total_mb: redondear(total / 1024),
    ram_usada_mb: redondear((total - disponible) / 1024),
    ram_pct: total ? redondear(((total - disponible) / total) * 100) : 0,
    swap_usada_mb: redondear((swapTotal - swapLibre) / 1024),
  };
}

// ------------------------------------------------------------------ Red
const IGNORAR_IF = /^(lo|docker\d*|br-|veth|virbr)/;
function muestraRed() {
  const txt = leer(`${PROC}/1/net/dev`) || leer(`${PROC}/net/dev`) || '';
  let rx = 0;
  let tx = 0;
  for (const linea of txt.split('\n').slice(2)) {
    const [nombre, datos] = linea.split(':');
    if (!datos || IGNORAR_IF.test(nombre.trim())) continue;
    const c = datos.trim().split(/\s+/).map(Number);
    rx += c[0];
    tx += c[8];
  }
  return { rx, tx, t: Date.now() };
}

// ------------------------------------------------------------------ Disco
function disco() {
  try {
    const s = fs.statfsSync(ROOTFS);
    const total = s.blocks * s.bsize;
    const libre = s.bavail * s.bsize;
    return { disco_total_gb: redondear(total / 1e9), disco_pct: redondear(((total - libre) / total) * 100) };
  } catch {
    return {};
  }
}

// ------------------------------------------------------------------ Temperatura
function temperaturaSensor() {
  const lecturas = [];
  const zonas = path.join(SYS, 'class/thermal');
  for (const z of fs.existsSync(zonas) ? fs.readdirSync(zonas) : []) {
    if (z.startsWith('thermal_zone')) lecturas.push(Number(leer(path.join(zonas, z, 'temp'))));
  }
  const hwmon = path.join(SYS, 'class/hwmon');
  for (const h of fs.existsSync(hwmon) ? fs.readdirSync(hwmon) : []) {
    const dir = path.join(hwmon, h);
    for (const f of fs.readdirSync(dir).filter((x) => /^temp\d+_input$/.test(x))) lecturas.push(Number(leer(path.join(dir, f))));
  }
  const validas = lecturas.filter((t) => Number.isFinite(t) && t > 0).map((t) => t / 1000);
  return validas.length ? Math.max(...validas) : null;
}

// ------------------------------------------------------------------ Ciclo
let cpuPrevio = muestraCpu();
let redPrevia = muestraRed();

async function enviar(registro) {
  const res = await fetch(`${URL_OO}/api/${ORG}/${STREAM}/_json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH },
    body: JSON.stringify([registro]),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
}

async function ciclo() {
  const cpu = muestraCpu();
  const red = muestraRed();

  const dTotal = cpu.total - cpuPrevio.total;
  const cpuPct = dTotal > 0 ? redondear((1 - (cpu.inactivo - cpuPrevio.inactivo) / dTotal) * 100) : 0;
  const seg = Math.max((red.t - redPrevia.t) / 1000, 0.001);
  const rxKbps = redondear(((red.rx - redPrevia.rx) * 8) / 1000 / seg);
  const txKbps = redondear(((red.tx - redPrevia.tx) * 8) / 1000 / seg);
  cpuPrevio = cpu;
  redPrevia = red;

  const sensor = temperaturaSensor();
  const [carga1, carga5, carga15] = (leer(`${PROC}/loadavg`) || '0 0 0').split(' ').map(Number);

  const registro = {
    _timestamp: Date.now() * 1000, // microsegundos
    host: HOST,
    cpu_pct: cpuPct,
    cpu_nucleos: (leer(`${PROC}/cpuinfo`) || '').split('\n').filter((l) => l.startsWith('processor')).length,
    carga_1m: carga1,
    carga_5m: carga5,
    carga_15m: carga15,
    ...memoria(),
    red_rx_kbps: Math.max(rxKbps, 0),
    red_tx_kbps: Math.max(txKbps, 0),
    red_total_kbps: Math.max(redondear(rxKbps + txKbps), 0),
    ...disco(),
    temperatura_c: sensor ?? redondear(32 + cpuPct * 0.45, 1),
    temperatura_fuente: sensor !== null ? 'sensor' : 'estimada',
    uptime_horas: redondear(Number((leer(`${PROC}/uptime`) || '0').split(' ')[0]) / 3600),
  };

  try {
    await enviar(registro);
  } catch (e) {
    console.error(`[infra-agent] no se pudo enviar a OpenObserve: ${e.message}`);
  }
  console.log(JSON.stringify(registro));
}

console.log(`[infra-agent] enviando métricas de ${HOST} a ${URL_OO}/api/${ORG}/${STREAM}/_json cada ${INTERVALO / 1000}s`);
setTimeout(() => {
  ciclo();
  setInterval(ciclo, INTERVALO);
}, 2000);
