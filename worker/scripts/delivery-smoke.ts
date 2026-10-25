// Delivery smoke test (PR 2c item 7b, gap G11). The OWNER runs it, when the owner chooses; nobody else does.
//
//   cd worker && npx tsx scripts/delivery-smoke.ts --confirm staging-local
//
// What it does: starts this Worker LOCALLY with `wrangler dev --local` on a throwaway local D1 and KV (production D1 and
// KV are never touched), with the owner's test switch for this run only (ALLOW_TEST_TURNSTILE=yes with Cloudflare's
// always-pass test secret, replies and the welcome on, owner alerts off). It then sends, through the owner's real
// Resend account, exactly three emails, all to Resend's test inboxes (no person receives anything):
//   one lead reply to delivered+reply-<run>@resend.dev, one to bounced+reply-<run>@resend.dev, and one newsletter
//   welcome to delivered+welcome-<run>@resend.dev
// and checks the local outbox: three rows 'sent', each with a provider id. The bounce itself is reported by Resend
// afterwards (the Worker has no webhook yet): Resend > Emails must show the bounced+ message as Bounced.
// Test addresses: https://resend.com/docs/dashboard/emails/send-test-emails (delivered@, bounced@, complained@ and
// suppressed@resend.dev; all but suppressed accept a +label).
//
// Needs: worker/.dev.vars with RESEND_API_KEY=<key> (git-ignored; this script never reads or prints it), and the
// sender domains verified in Resend (mail.sharjeelhashmat.com for the reply, news.sharjeelhashmat.com for the welcome).
// Production is not involved: staging enquiries to the live Worker stay quarantined (no reply, no alert), unchanged.
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { templateHash, type Template } from '../src/templates';

export const RESEND_TEST_INBOXES = ['delivered@resend.dev', 'bounced@resend.dev'] as const;
const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const SITE = 'https://sharjeelhashmat.com';

/** Refuses to run without the exact confirmation, and with anything that could point wrangler at a remote resource. */
export function assertSafe(argv: string[]): void {
  const i = argv.indexOf('--confirm');
  if (i < 0 || argv[i + 1] !== 'staging-local') throw new Error('usage: npx tsx scripts/delivery-smoke.ts --confirm staging-local');
  const rest = argv.filter((_, j) => j !== i && j !== i + 1);
  if (rest.length) throw new Error(`unexpected arguments: ${rest.join(' ')} (this script takes no other option and never runs remotely)`);
}

export function smokeRecipients(run: string) {
  return {
    delivered: `delivered+reply-${run}@resend.dev`,
    bounced: `bounced+reply-${run}@resend.dev`,
    welcome: `delivered+welcome-${run}@resend.dev`,
  };
}

/** Variables for the local Worker only (passed with --var). RESEND_API_KEY comes from .dev.vars, never from here. */
export function smokeVars(unsubSecret: string): Record<string, string> {
  return {
    OUTBOUND_REPLIES: 'on',
    OUTBOUND_NEWSLETTER: 'on',
    OUTBOUND_ALERTS: 'off',
    EMAIL_PROVIDER: 'resend',
    TURNSTILE_SECRET: '1x0000000000000000000000000000000AA',
    ALLOW_TEST_TURNSTILE: 'yes',
    UNSUB_SECRET: unsubSecret,
    BRN: 'SMOKE-TEST',
    AFFILIATION: 'Delivery smoke test',
    BOOKING_URL: 'https://sharjeelhashmat.com/contact',
    ALERT_EMAIL: 'delivered+alert@resend.dev',
    STAGING_ORIGIN: '',
  };
}

export interface SmokeRow { kind: string; status: string; has_id: number; error: string | null }

/** The verdict from the local outbox rows, oldest first: the delivered reply, the bounced reply, the welcome. */
export function judge(rows: SmokeRow[]): { ok: boolean; lines: string[] } {
  const replies = rows.filter((r) => r.kind === 'lead_reply');
  const welcome = rows.find((r) => r.kind === 'newsletter_welcome');
  const line = (label: string, r: SmokeRow | undefined) =>
    !r ? `${label}: FAIL (no row)` : r.status === 'sent' && r.has_id ? `${label}: PASS` : `${label}: FAIL (${r.status}${r.error ? ` ${r.error}` : ''})`;
  const lines = [line('lead reply (delivered)', replies[0]), line('lead reply (bounced)', replies[1]), line('newsletter welcome', welcome)];
  return { ok: lines.every((l) => l.endsWith(': PASS')), lines };
}

const wrangler = (args: string[]) => new Promise<string>((ok, fail) => {
  execFile('npx', ['--no-install', 'wrangler', ...args], { maxBuffer: 4 * 1024 * 1024, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } },
    (err, stdout) => (err ? fail(new Error(`wrangler ${args[0]} ${args[1] ?? ''} failed`)) : ok(stdout)));
});

async function waitForHealth(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('the local Worker did not start');
}

const post = (path: string, body: unknown) =>
  fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: SITE }, body: JSON.stringify(body) });

async function main(): Promise<void> {
  assertSafe(process.argv.slice(2));
  const run = randomBytes(4).toString('hex');
  const to = smokeRecipients(run);
  const state = mkdtempSync(join(tmpdir(), 'ck-delivery-smoke-'));
  let dev: ChildProcess | undefined;
  try {
    // Local D1 (all migrations) and local KV (every template approved by its current hash), in the throwaway folder.
    await wrangler(['d1', 'migrations', 'apply', 'ck-leads', '--local', '--persist-to', state]);
    const templates = (JSON.parse(readFileSync(new URL('../templates/lead-replies.v1.json', import.meta.url), 'utf8')) as { templates: Template[] }).templates;
    const approved: Record<string, string> = {};
    for (const t of templates) approved[t.id] = await templateHash(t);
    await wrangler(['kv', 'key', 'put', 'approved_templates', JSON.stringify(approved), '--binding', 'KV', '--local', '--persist-to', state]);

    const vars = Object.entries(smokeVars(randomBytes(24).toString('hex'))).flatMap(([k, v]) => ['--var', `${k}:${v}`]);
    dev = spawn('npx', ['--no-install', 'wrangler', 'dev', '--local', '--persist-to', state, '--port', String(PORT), '--ip', '127.0.0.1', ...vars],
      { stdio: 'ignore', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
    await waitForHealth();

    const lead = (email: string) => ({
      name: 'Smoke Test', email, phone: '', country: 'AE', intent: 'invest', budget_band: 'over_5m', timeline: 'now', funding: 'cash',
      message: 'Delivery smoke test.', consent_contact: true, consent_nurture: false, company_website: '', turnstile_token: 'XXXX.DUMMY.TOKEN.XXXX',
    });
    for (const email of [to.delivered, to.bounced]) console.log(`POST /lead: ${(await post('/lead', lead(email))).status}`);
    console.log(`POST /api/newsletter/subscribe: ${(await post('/api/newsletter/subscribe', { email: to.welcome, source: 'footer', company_website: '', turnstile_token: 'XXXX.DUMMY.TOKEN.XXXX' })).status}`);

    const out = await wrangler(['d1', 'execute', 'ck-leads', '--local', '--persist-to', state, '--json', '--command',
      'SELECT kind, status, provider_id IS NOT NULL AS has_id, error FROM outbox ORDER BY created_at']);
    const rows = ((JSON.parse(out) as Array<{ results: SmokeRow[] }>)[0]?.results ?? []);
    const v = judge(rows);
    for (const l of v.lines) console.log(l);
    console.log(`bounce: open Resend > Emails; the message to ${to.bounced} must show Bounced (checked by hand, no webhook yet)`);
    if (!v.ok) process.exitCode = 1;
  } finally {
    dev?.kill();
    rmSync(state, { recursive: true, force: true });
  }
}

if (process.argv[1] && /delivery-smoke\.ts$/.test(process.argv[1])) {
  main().catch((e) => { console.log(`delivery smoke: FAIL (${e instanceof Error ? e.message : 'unknown'})`); process.exitCode = 1; });
}
