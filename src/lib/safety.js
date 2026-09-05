import { auditBefore, auditResult } from './audit.js';
const WRITE_ENABLED = process.env.TV_WRITE_ENABLED === 'true';
export function isWriteEnabled() { return WRITE_ENABLED; }
export function assertWriteAllowed(toolName) {
  if (!WRITE_ENABLED) throw Object.assign(new Error(`Tool "${toolName}" is blocked in read-only mode.`), { code: 'WRITE_LOCKED', hint: 'Start the server with TV_WRITE_ENABLED=true to unlock mutating tools.', tool: toolName });
}
export function wrapMutating(toolName, handler) {
  return async function safeHandler(args) {
    assertWriteAllowed(toolName);
    const entryId = auditBefore(toolName, args);
    let result = null;
    try {
      result = await handler(args);
      auditResult(entryId, result, null);
      return result;
    } catch (err) {
      auditResult(entryId, null, err);
      throw err;
    }
  };
}
export function formatSafetyError(err) {
  if (err.code === 'WRITE_LOCKED') return { success: false, error: err.code, tool: err.tool, hint: err.hint };
  return null;
}
