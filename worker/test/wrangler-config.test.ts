// wrangler.toml settings and log hygiene that must not drift (PR 2b items 2c and 4a; audit M5 and F8).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { safeError } from '../src/log';

const root = join(import.meta.dirname, '..');
const toml = readFileSync(join(root, 'wrangler.toml'), 'utf8');
const section = (name: string) => toml.match(new RegExp(`^\\[${name.replace('.', '\\.')}\\]\\n((?:[^\\[\\n][^\\n]*\\n|\\n)*)`, 'm'))?.[1] ?? '';

describe('wrangler.toml', () => {
  it('STAGING_ORIGIN is the staging Worker ck-site-staging, not the production site Worker ck-site-web', () => {
    expect(toml).toMatch(/^STAGING_ORIGIN = "https:\/\/ck-site-staging\.sharjeelhashmat\.workers\.dev"/m);
    expect(toml).not.toMatch(/ck-site-web/);
  });

  it('observability: on, every event kept, query strings redacted, invocation logs (URL and headers) off', () => {
    const o = section('observability');
    expect(o).toMatch(/^enabled = true$/m);
    expect(o).toMatch(/^head_sampling_rate = 1$/m);
    expect(o).toMatch(/^redact_query_string = true$/m);
    expect(section('observability.logs')).toMatch(/^invocation_logs = false$/m);
  });
});

describe('logs carry nothing personal', () => {
  const files = readdirSync(join(root, 'src')).filter((f) => f.endsWith('.ts'));
  const calls = files.flatMap((f) => [...readFileSync(join(root, 'src', f), 'utf8').matchAll(/console\.\w+\([^\n]*/g)].map((m) => `${f}: ${m[0].trim()}`));

  it('the Worker has exactly these console calls (a new one needs review here)', () => {
    expect(calls.sort()).toEqual([
      "index.ts: console.error('lead: TURNSTILE_SECRET is not set; rejecting the enquiry (fail closed)');",
      "index.ts: console.error('newsletter: TURNSTILE_SECRET is not set; rejecting the signup (fail closed)');",
      "index.ts: console.error('retention: failed', safeError(e)); throw e; },",
      "index.ts: console.error('worker: unhandled error', safeError(e));",
      "index.ts: console.log('retention', JSON.stringify(r)),",
      "market.ts: console.error('market: read failed', safeError(e));",
    ]);
  });

  it('safeError redacts addresses and phone numbers, keeps one line, caps the length', () => {
    expect(safeError(new Error('D1_ERROR: x for Someone.Name+tag@example.co.uk failed'))).toBe('D1_ERROR: x for [redacted] failed');
    expect(safeError(new Error('bad +971 55 541 4468 and 0555414468'))).toBe('bad [redacted] and [redacted]');
    expect(safeError(new Error('a\n  b'))).toBe('a b');
    expect(safeError(new Error('x'.repeat(500)))).toHaveLength(300);
    expect(safeError('not an error')).toBe('unknown');
  });
});
