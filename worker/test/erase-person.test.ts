// scripts/erase-person.mjs (B4): strict input, SQL that erases one person and nobody else, never executed by the script.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/hash';
import { eraseSql } from '../scripts/erase-person.mjs';

const migrations = join(import.meta.dirname, '../migrations');
function db(): DatabaseSync {
  const d = new DatabaseSync(':memory:');
  for (const f of readdirSync(migrations).filter((n) => n.endsWith('.sql')).sort()) d.exec(readFileSync(join(migrations, f), 'utf8'));
  return d;
}

describe('erase-person', () => {
  it('refuses anything that is not a plain address, so nothing can break out of the SQL string', () => {
    for (const bad of ["x'@a.com", 'x@a.com; DROP TABLE leads', 'x"@a.com', 'no-at.example.com', '', 'x@a', 'a b@c.com', `${'a'.repeat(65)}@a.com`]) {
      expect(() => eraseSql(bad), bad).toThrow(/not a valid email/);
    }
  });

  it("erases one person's leads, profiles, events and messages; keeps a hashed, unsubscribed newsletter row; leaves others alone", async () => {
    const d = db();
    const h = await sha256Hex('amira@example.com');
    const lead = (id: string, email: string, hash: string) =>
      d.prepare("INSERT INTO leads (id, created_at, name, email, email_hash, consent_contact) VALUES (?, '2026-10-01', 'N', ?, ?, 1)").run(id, email, hash);
    lead('l1', 'amira@example.com', h);
    lead('l2', 'other@example.com', await sha256Hex('other@example.com'));
    for (const l of ['l1', 'l2']) {
      d.prepare("INSERT INTO investor_profiles (lead_id, created_at, updated_at, objective, property_type, risk_tolerance, holding_period) VALUES (?, 'x', 'x', 'o', 'p', 'r', 'h')").run(l);
      d.prepare("INSERT INTO events (id, created_at, type, lead_id) VALUES (?, 'x', 'lead_received', ?)").run(`e-${l}`, l);
      d.prepare("INSERT INTO messages (id, lead_id, created_at, template_id, template_hash, outcome) VALUES (?, ?, 'x', 't', 'h', 'sent')").run(`m-${l}`, l);
    }
    d.prepare("INSERT INTO newsletter_subscribers (id, email, subscribed_at, source, unsubscribe_reason, unsubscribe_reason_detail) VALUES ('s1', 'amira@example.com', 'x', 'footer', 'other', 'words')").run();
    d.prepare("INSERT INTO newsletter_subscribers (id, email, subscribed_at) VALUES ('s2', 'other@example.com', 'x')").run();

    d.exec(eraseSql('  Amira@Example.COM ', new Date('2026-10-17T00:00:00Z')));

    const all = (sql: string) => d.prepare(sql).all();
    expect(all('SELECT id FROM leads')).toEqual([{ id: 'l2' }]);
    expect(all('SELECT lead_id FROM investor_profiles')).toEqual([{ lead_id: 'l2' }]);
    expect(all('SELECT id FROM events')).toEqual([{ id: 'e-l2' }]);
    expect(all('SELECT id FROM messages')).toEqual([{ id: 'm-l2' }]);
    expect(all('SELECT id, email, source, unsubscribe_reason, unsubscribe_reason_detail, unsubscribed_at FROM newsletter_subscribers ORDER BY id')).toEqual([
      { id: 's1', email: `sha256:${h}`, source: null, unsubscribe_reason: null, unsubscribe_reason_detail: null, unsubscribed_at: '2026-10-17T00:00:00.000Z' },
      { id: 's2', email: 'other@example.com', source: null, unsubscribe_reason: null, unsubscribe_reason_detail: null, unsubscribed_at: null },
    ]);
  });

  it('the CLI prints the SQL and exits 0; bad input exits 2 and prints no SQL', () => {
    const script = join(import.meta.dirname, '../scripts/erase-person.mjs');
    expect(execFileSync(process.execPath, [script, 'amira@example.com'], { encoding: 'utf8' })).toMatch(/^-- Erasure for one person.*\nDELETE FROM investor_profiles/);
    let code = 0;
    let out = '';
    try { out = execFileSync(process.execPath, [script, "x'@a.com"], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { code = (e as { status: number }).status; out = (e as { stdout: string }).stdout; }
    expect([code, out]).toEqual([2, '']);
  });
});
