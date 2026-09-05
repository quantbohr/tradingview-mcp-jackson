export function toolError(code, context = {}, hint = '') {
  return { success: false, error: code, context, hint };
}
export const Errors = {
  sessionExpired: (detail) => toolError('SESSION_EXPIRED', { detail }, 'TradingView session expired. Restart TradingView.'),
  chartNotLoaded: () => toolError('CHART_NOT_LOADED', {}, 'Chart still loading. Wait and retry, or run tv_health_check.'),
  internalApiChanged: (path, tvVersion) => toolError('INTERNAL_API_CHANGED', { path, tvVersion }, 'Undocumented TV internal path changed. Check tv_version and repo for update.'),
  writeLocked: (toolName) => toolError('WRITE_LOCKED', { tool: toolName }, 'Server is in read-only mode. Start with TV_WRITE_ENABLED=true to unlock.'),
  cdpTimeout: (toolName, timeoutMs) => toolError('CDP_TIMEOUT', { tool: toolName, timeoutMs }, 'CDP call timed out. TradingView may be busy. Retry in a few seconds.'),
};
