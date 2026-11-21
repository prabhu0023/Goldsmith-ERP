/**
 * The error text kept on a JobRun (EP-10-S2): the error's message with personal data and
 * secrets replaced by placeholders, at most 500 characters.
 */
export const MAX_ERROR_TEXT = 500;

const RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[url]'],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]'],
  [/\b(password|passwd|pwd|token|secret|api[_-]?key|authorization)(\s*[:=]\s*)(?:bearer\s+)?\S+/gi, '$1$2[redacted]'],
  [/\bbearer\s+\S+/gi, 'Bearer [redacted]'],
  [/\+\d[\d\s-]{7,}\d/g, '[phone]'],
  [/\b\d{5}[\s-]?\d{5}\b/g, '[phone]'],
  [/\b\d{10,}\b/g, '[number]'],
  // Long opaque strings (keys, tokens, ids) mixing letters and digits.
  [/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/g, '[redacted]'],
  [/\b\d{6}\b/g, '[code]'],
];

/** Redacted, length-capped text of any thrown value. */
export function redactErrorText(err: unknown): string {
  let text = err instanceof Error ? err.message : String(err);
  for (const [pattern, replacement] of RULES) text = text.replace(pattern, replacement);
  return text.length > MAX_ERROR_TEXT ? text.slice(0, MAX_ERROR_TEXT) : text;
}
