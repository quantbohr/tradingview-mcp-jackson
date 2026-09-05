import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/alerts.js';

export function registerAlertTools(server) {
  server.tool('alert_create', 'Create a price alert with webhook to https://alerts.quantbohr.org', {
    condition: z.string().describe('Alert condition (e.g., "crossing", "greater_than", "less_than")'),
    price: z.coerce.number().describe('Price level for the alert'),
    message: z.string().optional().describe('Alert message'),
  }, async ({ condition, price, message }) => {
    try { return jsonResult(await core.create({ condition, price, message })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('alert_list', 'List active alerts', {}, async () => {
    try { return jsonResult(await core.list()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('alert_delete', 'Delete specific alerts by id, or all alerts', {
    alert_ids: z.array(z.coerce.number()).optional().describe('Specific alert_id(s) to delete (from alert_list)'),
    delete_all: z.coerce.boolean().optional().describe('Delete all alerts'),
  }, async ({ alert_ids, delete_all }) => {
    try { return jsonResult(await core.deleteAlerts({ alert_ids, delete_all })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
