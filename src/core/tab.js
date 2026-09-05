/**
 * Core tab management logic.
 * Controls TradingView Desktop tabs via CDP and Electron keyboard shortcuts.
 */
import { getClient, evaluate, reconnectTo } from '../connection.js';

const CDP_HOST = 'localhost';
const CDP_PORT = 9222;

/**
 * List all open chart tabs (CDP page targets).
 */
export async function list() {
  const resp = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/list`);
  const targets = await resp.json();

  const tabs = targets
    .filter(t => t.type === 'page' && /tradingview\.com\/chart/i.test(t.url))
    .map((t, i) => ({
      index: i,
      id: t.id,
      title: t.title.replace(/^Live stock.*charts on /, ''),
      url: t.url,
      chart_id: t.url.match(/\/chart\/([^/?]+)/)?.[1] || null,
    }));

  return { success: true, tab_count: tabs.length, tabs };
}

/**
 * Open a new chart tab via keyboard shortcut (Ctrl+T / Cmd+T).
 */
export async function newTab() {
  const c = await getClient();

  // Electron/TradingView Desktop uses Ctrl+T for new tab on macOS too
  // But some versions use Cmd+T
  const isMac = process.platform === 'darwin';
  const mod = isMac ? 4 : 2; // 4 = meta (Cmd), 2 = ctrl

  await c.Input.dispatchKeyEvent({
    type: 'keyDown',
    modifiers: mod,
    key: 't',
    code: 'KeyT',
    windowsVirtualKeyCode: 84,
  });
  await c.Input.dispatchKeyEvent({ type: 'keyUp', key: 't', code: 'KeyT' });

  await new Promise(r => setTimeout(r, 2000));

  // Verify a new tab appeared
  const state = await list();
  return { success: true, action: 'new_tab_opened', ...state };
}

/**
 * Close the current tab via keyboard shortcut (Ctrl+W / Cmd+W).
 */
export async function closeTab() {
  const before = await list();
  if (before.tab_count <= 1) {
    throw new Error('Cannot close the last tab. Use tv_launch to restart TradingView instead.');
  }

  const c = await getClient();
  const isMac = process.platform === 'darwin';
  const mod = isMac ? 4 : 2;

  await c.Input.dispatchKeyEvent({
    type: 'keyDown',
    modifiers: mod,
    key: 'w',
    code: 'KeyW',
    windowsVirtualKeyCode: 87,
  });
  await c.Input.dispatchKeyEvent({ type: 'keyUp', key: 'w', code: 'KeyW' });

  await new Promise(r => setTimeout(r, 1000));

  const after = await list();
  return { success: true, action: 'tab_closed', tabs_before: before.tab_count, tabs_after: after.tab_count };
}

/**
 * Switch to a tab by index. Reconnects CDP to the new target.
 */
export async function switchTab({ index }) {
  const tabs = await list();
  const idx = Number(index);

  if (idx >= tabs.tab_count) {
    throw new Error(`Tab index ${idx} out of range (have ${tabs.tab_count} tabs)`);
  }

  const target = tabs.tabs[idx];

  // Use CDP Target.activateTarget to bring the tab to front (VISUAL only).
  try {
    await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/activate/${target.id}`);
  } catch (e) {
    throw new Error(`Failed to activate tab ${idx}: ${e.message}`);
  }

  // ⛔⛔ 2026-09-05 — THIS STEP WAS MISSING AND THE DOCSTRING ABOVE CLAIMED IT WAS HERE.
  // /json/activate only fronts the tab in the UI. The cached CDP client stays bound to
  // whichever target it attached to at first connect, so every subsequent read —
  // chart_get_state, data_get_*, quote_get, screenshots — kept hitting the OLD chart
  // while the user was looking at the new one. Nothing errors: you get real, correct-looking
  // data for the wrong symbol, which is indistinguishable from "the chart didn't switch".
  // ⭐ Re-attaching is what makes the READ follow the switch, not just the window.
  try {
    await reconnectTo(target.id);
  } catch (e) {
    // Loud on purpose: the tab may now be visually switched while reads still point
    // elsewhere, and that mismatch must never be reported as success.
    throw new Error(`Tab ${idx} was activated but CDP failed to re-attach to it — `
      + `reads would still target the previous chart: ${e.message}`);
  }

  return { success: true, action: 'switched', index: idx, tab_id: target.id, chart_id: target.chart_id, reattached: true };
}
