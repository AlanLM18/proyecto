/*
 * Envía un evento del pipeline de GitHub Actions a OpenObserve (RF-03) vía API HTTP/JSON:
 *   POST {OPENOBSERVE_URL}/api/{org}/cicd_pipeline/_json
 *
 * Variables:
 *   OPENOBSERVE_URL, OPENOBSERVE_USER, OPENOBSERVE_PASSWORD, OPENOBSERVE_ORG (default)
 *   EVENT_TYPE   pruebas | despliegue
 *   STATUS       success | failure | cancelled
 *   JEST, PLAYWRIGHT, DETALLE  (opcionales)
 * Además usa las variables que GitHub Actions define en cada job (GITHUB_SHA, GITHUB_ACTOR...).
 *
 * Nunca hace fallar el pipeline: si OpenObserve no responde, solo muestra una advertencia.
 */
const fs = require('fs');

const e = process.env;
const URL_OO = (e.OPENOBSERVE_URL || '').replace(/\/+$/, '');
const ORG = e.OPENOBSERVE_ORG || 'default';

function mensajeCommit() {
  try {
    const evento = JSON.parse(fs.readFileSync(e.GITHUB_EVENT_PATH, 'utf8'));
    return (evento.head_commit?.message || evento.pull_request?.title || '').split('\n')[0].slice(0, 200);
  } catch {
    return '';
  }
}

const registro = {
  event_type: e.EVENT_TYPE || 'pruebas',
  status: e.STATUS || 'unknown',
  repository: e.GITHUB_REPOSITORY || '',
  workflow: e.GITHUB_WORKFLOW || '',
  trigger: e.GITHUB_EVENT_NAME || '',
  branch: e.GITHUB_HEAD_REF || e.GITHUB_REF_NAME || '',
  commit: e.GITHUB_SHA || '',
  commit_short: (e.GITHUB_SHA || '').slice(0, 7),
  commit_message: mensajeCommit(),
  actor: e.GITHUB_ACTOR || '',
  run_id: e.GITHUB_RUN_ID || '',
  run_number: Number(e.GITHUB_RUN_NUMBER || 0),
  run_attempt: Number(e.GITHUB_RUN_ATTEMPT || 1),
  run_url: e.GITHUB_RUN_ID ? `${e.GITHUB_SERVER_URL}/${e.GITHUB_REPOSITORY}/actions/runs/${e.GITHUB_RUN_ID}` : '',
  jest: e.JEST || '',
  playwright: e.PLAYWRIGHT || '',
  detalle: e.DETALLE || '',
  destino: e.EVENT_TYPE === 'despliegue' ? 'AWS EC2' : 'GitHub Actions',
};

(async () => {
  console.log(JSON.stringify(registro, null, 2));

  if (e.GITHUB_STEP_SUMMARY) {
    const icono = registro.status === 'success' ? '✅' : '❌';
    fs.appendFileSync(
      e.GITHUB_STEP_SUMMARY,
      `### ${icono} Evento "${registro.event_type}" enviado a OpenObserve\n\n` +
        `| Campo | Valor |\n|---|---|\n` +
        ['status', 'branch', 'commit_short', 'actor', 'jest', 'playwright'].map((k) => `| ${k} | ${registro[k] || '—'} |`).join('\n') +
        '\n\n'
    );
  }

  if (!URL_OO || !e.OPENOBSERVE_USER) {
    console.log('::warning::OPENOBSERVE_URL/OPENOBSERVE_USER no definidos; el evento no se envió');
    return;
  }

  try {
    const res = await fetch(`${URL_OO}/api/${ORG}/cicd_pipeline/_json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(`${e.OPENOBSERVE_USER}:${e.OPENOBSERVE_PASSWORD}`).toString('base64'),
      },
      body: JSON.stringify([registro]),
      signal: AbortSignal.timeout(15000),
    });
    const texto = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${texto}`);
    console.log(`Evento registrado en OpenObserve (stream cicd_pipeline): ${texto}`);
  } catch (err) {
    console.log(`::warning::No se pudo registrar el evento en OpenObserve: ${err.message}`);
  }
})();
