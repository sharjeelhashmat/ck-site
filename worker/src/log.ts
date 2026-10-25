// Log hygiene (audit F8): Workers Logs keep every console line, so nothing personal may reach one. Console calls log fixed
// text, counts, or an error message passed through safeError; test/wrangler-config.test.ts pins the full list.

/** An error message that is safe to store and log: email addresses and phone-like digit runs redacted, one line, at most 300 characters. */
export function safeError(e: unknown): string {
  const m = e instanceof Error ? e.message : 'unknown';
  return m
    .replace(/[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+/g, '[redacted]')
    .replace(/\+?\d(?:[\s().-]*\d){6,}/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300) || 'unknown';
}
