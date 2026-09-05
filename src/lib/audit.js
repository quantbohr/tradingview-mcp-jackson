import fs from 'fs';
import os from 'os';
import path from 'path';
const LOG_DIR = path.join(os.homedir(), '.tradingview-mcp');
const LOG_FILE = path.join(LOG_DIR, 'audit.ndjson');
let _ready = false;
function ensureDir() {
  if (_ready) return;
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  _ready = true;
}
export function auditBefore(tool, args, sessionId = null) {
  ensureDir();
  const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry = { entryId, ts: new Date().toISOString(), phase: 'before', tool, args: JSON.parse(JSON.stringify(args ?? {})), sessionId, result: null, error: null };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
  return entryId;
}
export function auditResult(entryId, result, error = null) {
  ensureDir();
  const entry = { entryId, ts: new Date().toISOString(), phase: 'after', result: result ? JSON.parse(JSON.stringify(result)) : null, error: error ? { message: error.message } : null };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
}
export function auditTail(n = 20) {
  ensureDir();
  if (!fs.existsSync(LOG_FILE)) return [];
  return fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean).slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
