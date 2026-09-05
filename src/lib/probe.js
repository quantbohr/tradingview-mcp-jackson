const CDP_HOST = process.env.TV_CDP_HOST || '127.0.0.1';
const CDP_PORT = parseInt(process.env.TV_CDP_PORT || '9222', 10);
const TIMEOUT_MS = parseInt(process.env.TV_CONNECT_TIMEOUT_MS || '5000', 10);
export const FailureMode = {
  TV_NOT_RUNNING: 'TV_NOT_RUNNING',
  DEBUG_PORT_NOT_ENABLED: 'DEBUG_PORT_NOT_ENABLED',
  NO_CHART_TARGET: 'NO_CHART_TARGET',
  CHART_NOT_LOADED: 'CHART_NOT_LOADED',
  INTERNAL_API_CHANGED: 'INTERNAL_API_CHANGED',
};
async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { code: 'HTTP_ERROR' });
    return await res.json();
  } finally { clearTimeout(t); }
}
function fail(mode, diag, hint) {
  return { ok: false, failure: mode, hint, tvVersion: diag.tvVersion ?? null, chartSymbol: null, pineApiStable: false, diagnostics: diag };
}
export async function probe(cdpClient = null) {
  const diag = { host: CDP_HOST, port: CDP_PORT, tvVersion: null, pinePathAttempted: "study._graphics._primitivesCollection.dwglines.get('lines').get(false)._primitivesDataById", pinePathFound: null, error: null };
  let versionJson;
  try {
    versionJson = await fetchWithTimeout(`http://${CDP_HOST}:${CDP_PORT}/json/version`, TIMEOUT_MS);
  } catch (err) {
    diag.error = err.message;
    if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED') || err.name === 'AbortError')
      return fail(FailureMode.TV_NOT_RUNNING, diag, `TradingView is not running with --remote-debugging-port=${CDP_PORT}. Use the launch script.`);
    return fail(FailureMode.DEBUG_PORT_NOT_ENABLED, diag, `Reached port ${CDP_PORT} but /json/version failed: ${err.message}. Ensure TV was launched with the debug flag.`);
  }
  diag.tvVersion = versionJson?.['Browser'] ?? null;
  let targets;
  try {
    targets = await fetchWithTimeout(`http://${CDP_HOST}:${CDP_PORT}/json`, TIMEOUT_MS);
  } catch (err) {
    diag.error = err.message;
    return fail(FailureMode.NO_CHART_TARGET, diag, `CDP /json failed: ${err.message}`);
  }
  const chartTarget = (targets || []).find(t => t.type === 'page' && (t.url?.includes('tradingview.com') || t.url?.startsWith('file://')));
  if (!chartTarget) return fail(FailureMode.NO_CHART_TARGET, diag, `No chart page found. Ensure TradingView is open with a chart visible (not minimised).`);
  diag.targetUrl = chartTarget.url;
  if (!cdpClient) return { ok: true, failure: null, hint: '', tvVersion: diag.tvVersion, chartSymbol: null, pineApiStable: null, diagnostics: { ...diag, note: 'Partial probe — no CRI client provided' } };
  let tvGlobal;
  try {
    tvGlobal = await cdpClient.Runtime.evaluate({ expression: `(function(){ try { return { ok: !!(window.tvWidget || window.TradingView) }; } catch(e){ return { ok: false, reason: e.message }; } })()`, returnByValue: true, timeout: 3000 });
  } catch (err) {
    diag.error = err.message;
    return fail(FailureMode.CHART_NOT_LOADED, diag, 'Chart page found but TradingView JS not initialised. Wait a few seconds and retry.');
  }
  if (!tvGlobal?.result?.value?.ok) return fail(FailureMode.CHART_NOT_LOADED, diag, `TradingView global not found. Chart may still be loading.`);
  let pineProbe;
  try {
    pineProbe = await cdpClient.Runtime.evaluate({ expression: `(function(){ try { const studies = Object.values(window.tvWidget?._chartWidgetsCollection?._chartWidgets??{}).flatMap(cw=>Object.values(cw?._studyStorage?._studies??{})); if(!studies.length) return {found:null,reason:'no_studies'}; const path=studies[0]?._graphics?._primitivesCollection; return {found:!!path}; } catch(e){ return {found:false,reason:e.message}; } })()`, returnByValue: true, timeout: 3000 });
  } catch (err) {
    diag.pinePathFound = false; diag.error = err.message;
    return fail(FailureMode.INTERNAL_API_CHANGED, diag, `Pine graphics path inaccessible. TV version: ${diag.tvVersion}. Check repo for update.`);
  }
  const pv = pineProbe?.result?.value;
  diag.pinePathFound = pv?.found ?? false;
  if (pv?.found === false && pv?.reason !== 'no_studies') return fail(FailureMode.INTERNAL_API_CHANGED, diag, `Pine graphics path changed (${pv?.reason}). TV: ${diag.tvVersion}. Tools affected: data_get_pine_lines/labels/boxes/tables. Check repo.`);
  return { ok: true, failure: null, hint: '', tvVersion: diag.tvVersion, chartSymbol: null, pineApiStable: pv?.found !== false, diagnostics: diag };
}
