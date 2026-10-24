// The daily retention job (B4) against real D1 in workerd: every rule at its boundary, in one run.
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import worker, { type Env } from '../src/index';
import { sha256Hex } from '../src/hash';
import { runRetention } from '../src/retention';

const cf = env as unknown as Env;
const NOW = new Date('2026-10-17T01:17:00Z');
const daysAgo = (d: number, extraMs = 0) => new Date(NOW.getTime() - d * 86_400_000 - extraMs).toISOString();
const ids = async (sql: string) => ((await cf.DB.prepare(sql).all<{ id: string }>()).results ?? []).map((r) => r.id);

async function lead(id: string, status: string, createdAt: string) {
  await cf.DB.prepare(`INSERT INTO leads (id, created_at, name, email, email_hash, consent_contact, status) VALUES (?1, ?2, 'N', ?3, 'h', 1, ?4)`)
    .bind(id, createdAt, `${id}@example.com`, status).run();
}

beforeEach(async () => {
  for (const t of ['leads', 'investor_profiles', 'events', 'messages', 'newsletter_subscribers']) await cf.DB.exec(`DELETE FROM ${t}`);
});

describe('retention (B4)', () => {
  it('SPAM/TEST/DUPLICATE after 30 days, other leads after 730 days, orphan profiles, events after 365 days, messages after 730 days', async () => {
    await lead('spam-old', 'SPAM', daysAgo(30, 1));
    await lead('test-old', 'TEST', daysAgo(31));
    await lead('dup-old', 'DUPLICATE', daysAgo(40));
    await lead('spam-new', 'SPAM', daysAgo(29));
    await lead('valid-30', 'VALID', daysAgo(40));
    await lead('susp-729', 'SUSPICIOUS', daysAgo(729));
    await lead('valid-old', 'VALID', daysAgo(730, 1));
    await lead('null-old', 'VALID', daysAgo(800));
    for (const l of ['valid-30', 'valid-old', 'spam-old']) {
      await cf.DB.prepare("INSERT INTO investor_profiles (lead_id, created_at, updated_at, objective, property_type, risk_tolerance, holding_period) VALUES (?1, 'x', 'x', 'yield', 'apartment', 'low', '5y')").bind(l).run();
    }
    for (const [id, at] of [['e-old', daysAgo(365, 1)], ['e-new', daysAgo(364)]] as const) {
      await cf.DB.prepare("INSERT INTO events (id, created_at, type) VALUES (?1, ?2, 'lead_received')").bind(id, at).run();
    }
    for (const [id, at] of [['m-old', daysAgo(730, 1)], ['m-new', daysAgo(729)]] as const) {
      await cf.DB.prepare("INSERT INTO messages (id, lead_id, created_at, template_id, template_hash, provider_id, outcome) VALUES (?1, 'valid-30', ?2, 'ACK-COLD', 'h', 'p', 'sent')").bind(id, at).run();
    }
    const r = await runRetention(cf.DB, NOW);
    expect(await ids('SELECT id FROM leads ORDER BY id')).toEqual(['spam-new', 'susp-729', 'valid-30']);
    expect(await ids('SELECT id FROM messages')).toEqual(['m-new']);
    expect(await ids('SELECT lead_id AS id FROM investor_profiles')).toEqual(['valid-30']);
    expect(await ids('SELECT id FROM events')).toEqual(['e-new']);
    expect(r).toMatchObject({ leads_quarantined: 3, leads_expired: 2, investor_profiles: 2, events: 1, messages: 1 });
  });

  it('newsletter: active rows kept; feedback detail cleared after 180 days; unsubscribed > 24 months keeps only the hash', async () => {
    const add = (id: string, email: string, unsub: string | null, fbAt: string | null) =>
      cf.DB.prepare(`INSERT INTO newsletter_subscribers (id, email, subscribed_at, source, unsubscribed_at, unsubscribe_reason, unsubscribe_reason_detail, unsubscribe_feedback_at)
        VALUES (?1, ?2, '2023-01-01T00:00:00Z', 'footer', ?3, ?4, ?5, ?6)`).bind(id, email, unsub, fbAt ? 'other' : null, fbAt ? 'my words' : null, fbAt).run();
    await add('active-old', 'active@example.com', null, null);
    await add('fb-old', 'fb@example.com', daysAgo(200), daysAgo(180, 1));
    await add('fb-new', 'fb2@example.com', daysAgo(200), daysAgo(179));
    await add('gone', 'Gone@Example.com', daysAgo(730, 1), daysAgo(730, 1));
    await add('recent', 'recent@example.com', daysAgo(729), null);
    const r = await runRetention(cf.DB, NOW);
    const rows = (await cf.DB.prepare('SELECT id, email, source, unsubscribe_reason, unsubscribe_reason_detail, unsubscribe_feedback_at, unsubscribed_at FROM newsletter_subscribers ORDER BY id').all()).results;
    const by = Object.fromEntries(rows.map((x) => [x.id, x]));
    expect(by['active-old']).toMatchObject({ email: 'active@example.com', source: 'footer' });
    expect(by['fb-old']).toMatchObject({ email: 'fb@example.com', unsubscribe_reason: 'other', unsubscribe_reason_detail: null });
    expect(by['fb-new']).toMatchObject({ unsubscribe_reason_detail: 'my words' });
    expect(by['gone']).toMatchObject({ email: `sha256:${await sha256Hex('gone@example.com')}`, source: null, unsubscribe_reason: null, unsubscribe_reason_detail: null, unsubscribe_feedback_at: null });
    expect(by['gone']!.unsubscribed_at).not.toBeNull();
    expect(by['recent']).toMatchObject({ email: 'recent@example.com' });
    expect(r).toMatchObject({ feedback_details: 2, subscribers_anonymised: 1 }); // fb-old and gone
    // A second run changes nothing more.
    expect(await runRetention(cf.DB, NOW)).toEqual({ leads_quarantined: 0, leads_expired: 0, investor_profiles: 0, events: 0, messages: 0, feedback_details: 0, subscribers_anonymised: 0 });
  });

  it('the Worker exposes it as the scheduled handler', async () => {
    await lead('spam-old', 'SPAM', daysAgo(400));
    const waits: Promise<unknown>[] = [];
    await worker.scheduled!({ scheduledTime: Date.now(), cron: '17 1 * * *', noRetry() {} } as ScheduledController, cf, { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException() {} } as unknown as ExecutionContext);
    await Promise.all(waits);
    expect(await ids('SELECT id FROM leads')).toEqual([]);
  });
});
