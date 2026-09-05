import fs from 'fs';
const VALID_OPERATORS = ['>', '<', '>=', '<=', '==', 'crosses_above', 'crosses_below', 'between'];
const VALID_TIMEFRAMES = ['1', '3', '5', '15', '30', '60', '120', '240', 'D', 'W', 'M'];
export function loadAndValidateRules(rulesPath) {
  if (!fs.existsSync(rulesPath)) throw new Error(`rules.json not found at ${rulesPath}.\nFix: cp rules.example.json rules.json`);
  let rules;
  try { rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8')); }
  catch (err) { throw new Error(`rules.json parse error: ${err.message}`); }
  const errors = validateRules(rules);
  if (errors.length > 0) throw new Error(`rules.json has ${errors.length} error(s):\n` + errors.map((e,i) => `  ${i+1}. [${e.field}] ${e.reason}`).join('\n') + '\n\nSee rules.example.json for the correct schema.');
  return rules;
}
export function validateRules(rules) {
  const errors = [];
  if (!Array.isArray(rules.watchlist) || rules.watchlist.length === 0) errors.push({ field: 'watchlist', reason: 'Must be a non-empty array of symbol strings.' });
  if (!VALID_TIMEFRAMES.includes(rules.default_timeframe)) errors.push({ field: 'default_timeframe', reason: `Must be one of: ${VALID_TIMEFRAMES.join(', ')}.` });
  if (!Array.isArray(rules.conditions) || rules.conditions.length === 0) {
    errors.push({ field: 'conditions', reason: 'Must be a non-empty array. The old bias_criteria string format is no longer valid — see rules.example.json.' });
  } else {
    rules.conditions.forEach((c, i) => {
      const p = `conditions[${i}]`;
      if (!c.id) errors.push({ field: `${p}.id`, reason: 'Required string.' });
      if (!c.indicator) errors.push({ field: `${p}.indicator`, reason: 'Required. Use full TradingView name e.g. "Relative Strength Index".' });
      if (!VALID_OPERATORS.includes(c.operator)) errors.push({ field: `${p}.operator`, reason: `Must be one of: ${VALID_OPERATORS.join(', ')}.` });
      if (c.operator === 'between') {
        if (typeof c.threshold_low !== 'number' || typeof c.threshold_high !== 'number') errors.push({ field: `${p}.threshold_low/high`, reason: 'Both required for "between".' });
      } else if (typeof c.threshold !== 'number') {
        errors.push({ field: `${p}.threshold`, reason: 'Required number.' });
      }
    });
  }
  if (rules.pass_gate !== undefined && (typeof rules.pass_gate !== 'number' || rules.pass_gate < 0 || rules.pass_gate > 1)) errors.push({ field: 'pass_gate', reason: 'Must be a number between 0 and 1.' });
  return errors;
}
