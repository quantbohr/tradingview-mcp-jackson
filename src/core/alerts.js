/**
 * Core alert logic.
 */
import { evaluate, evaluateAsync, getClient } from '../connection.js';

export async function create({ condition, price, message }) {
  // Get current symbol from chart to build the alert
  const symbol = await evaluate(`
    (function() {
      try {
        return window.TradingViewApi._activeChartWidgetWV.value().symbol();
      } catch(e) { return null; }
    })()
  `);

  if (!symbol) throw new Error('Could not determine current chart symbol.');

  const conditionType = /greater|above|over/i.test(condition) ? 'greater_than'
    : /less|below|under/i.test(condition) ? 'less_than'
    : 'cross';

  const DEFAULT_WEBHOOK = 'https://alerts.quantbohr.org';

  // 2026-07-28: rewritten against a REAL captured create_alert request (Network-captured
  // while manually creating a working alert in the TV Desktop UI — see session notes).
  // The old shape (top-level `condition` singular, `notify: {...}` nested object,
  // `Content-Type: application/json`) was never valid against the current API — every
  // call failed with a generic `invalid_request` regardless of schema tweaks, which masked
  // that the whole envelope was wrong, not just a field or two. Real shape: everything
  // wrapped in `payload`, `conditions` is an ARRAY, notification flags are flat fields
  // (no `notify` object), and the body must be sent as `text/plain;charset=UTF-8` (matches
  // what TV's own frontend sends — `application/json` triggers a CORS preflight this
  // endpoint doesn't allow, which is what actually produced "Failed to fetch").
  const payload = {
    payload: {
      conditions: [{
        type: conditionType,
        frequency: 'on_first_fire',
        series: [
          { type: 'barset' },
          { type: 'value', value: price },
        ],
        resolution: '1',
      }],
      symbol: `={"currency-id":"USD","session":"regular","symbol":${JSON.stringify(symbol)}}`,
      resolution: '1',
      message: message || `${symbol} ${condition} ${price}`,
      sound_file: 'alert/voices/hey-take-a-look',
      sound_duration: 0,
      popup: true,
      auto_deactivate: true,
      email: false,
      sms_over_email: true,
      mobile_push: true,
      web_hook: DEFAULT_WEBHOOK,
      name: null,
      expiration: null,
      active: true,
      ignore_warnings: true,
    },
  };

  const result = await evaluateAsync(`
    fetch('https://pricealerts.tradingview.com/create_alert', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(${JSON.stringify(payload)}),
    })
      .then(function(r) { return r.json(); })
      .then(function(d) { return { ok: d.s === 'ok', alert_id: d.r?.alert_id, raw: d }; })
      .catch(function(e) { return { ok: false, error: e.message }; })
  `);

  if (!result?.ok) {
    throw new Error(`Alert creation failed: ${JSON.stringify(result?.raw || result?.error)}`);
  }

  return { success: true, alert_id: result.alert_id, price, condition, message: payload.payload.message, symbol, source: 'rest_api' };
}

export async function list() {
  // Use pricealerts REST API — returns structured data with alert_id, symbol, price, conditions
  const result = await evaluateAsync(`
    fetch('https://pricealerts.tradingview.com/list_alerts', { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.s !== 'ok' || !Array.isArray(data.r)) return { alerts: [], error: data.errmsg || 'Unexpected response' };
        return {
          alerts: data.r.map(function(a) {
            var sym = '';
            try { sym = JSON.parse(a.symbol.replace(/^=/, '')).symbol || a.symbol; } catch(e) { sym = a.symbol; }
            return {
              alert_id: a.alert_id,
              symbol: sym,
              type: a.type,
              message: a.message,
              active: a.active,
              condition: a.condition,
              resolution: a.resolution,
              created: a.create_time,
              last_fired: a.last_fire_time,
              expiration: a.expiration,
            };
          })
        };
      })
      .catch(function(e) { return { alerts: [], error: e.message }; })
  `);
  return { success: true, alert_count: result?.alerts?.length || 0, source: 'internal_api', alerts: result?.alerts || [], error: result?.error };
}

export async function deleteAlerts({ delete_all, alert_ids }) {
  // 2026-07-28: `delete_alerts` (plural REST endpoint, sibling of create_alert/list_alerts)
  // discovered live — probed candidate endpoint names against the real API (it distinguishes
  // "no_such_endpoint" from "invalid_request", so wrong-URL vs wrong-body is unambiguous) and
  // confirmed the working body shape: {"payload":{"alert_ids":[...]}}. Individual deletion by
  // id is now real, not a DOM-click fallback.
  if (Array.isArray(alert_ids) && alert_ids.length) {
    const result = await evaluateAsync(`
      fetch('https://pricealerts.tradingview.com/delete_alerts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ payload: { alert_ids: ${JSON.stringify(alert_ids)} } }),
      })
        .then(function(r) { return r.json(); })
        .then(function(d) { return { ok: d.s === 'ok', raw: d }; })
        .catch(function(e) { return { ok: false, error: e.message }; })
    `);
    if (!result?.ok) {
      throw new Error(`Alert deletion failed: ${JSON.stringify(result?.raw || result?.error)}`);
    }
    return { success: true, deleted: alert_ids, source: 'rest_api' };
  }
  if (delete_all) {
    const result = await evaluate(`
      (function() {
        var alertBtn = document.querySelector('[data-name="alerts"]');
        if (alertBtn) alertBtn.click();
        var header = document.querySelector('[data-name="alerts"]');
        if (header) {
          header.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }));
          return { context_menu_opened: true };
        }
        return { context_menu_opened: false };
      })()
    `);
    return { success: true, note: 'Alert deletion requires manual confirmation in the context menu.', context_menu_opened: result?.context_menu_opened || false, source: 'dom_fallback' };
  }
  throw new Error('Pass alert_ids: [...] for individual deletion, or delete_all: true.');
}
