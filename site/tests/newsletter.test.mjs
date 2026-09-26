// Run after `npm run build`. Newsletter signup blocks and their contract with the Worker route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const htmlFiles = walk(dist).filter((f) => f.endsWith('.html'));
const forms = (h) => [...h.matchAll(/<form class="nl-form"[^>]*>/g)].map((m) => ({
  worker: m[0].match(/data-worker="([^"]+)"/)?.[1],
  sitekey: m[0].match(/data-sitekey="([^"]+)"/)?.[1],
  source: m[0].match(/data-source="([^"]+)"/)?.[1],
}));

test('newsletter: every page has the footer signup; article pages add one tagged with the article', () => {
  for (const f of htmlFiles) {
    const h = readFileSync(f, 'utf8');
    const article = f.match(/[\\/]insights[\\/]([^\\/]+)\.html$/);
    const sources = forms(h).map((x) => x.source);
    assert.deepEqual(sources, article ? [`insights/${article[1]}`, 'footer'] : ['footer'], f);
    for (const x of forms(h)) {
      assert.equal(x.worker, 'https://ck-lead-worker.sharjeelhashmat.workers.dev', `${f}: worker URL`);
      assert.equal(x.sitekey, '0x4AAAAAAE9Ndhe9on1juQ_h', `${f}: turnstile key`);
    }
    assert.match(h, /class="nl-form"[\s\S]*?name="company_website"/, `${f}: honeypot`);
  }
});

test('newsletter: the Worker route exists and accepts every source label the site sends', () => {
  const index = readFileSync(join(root, '../worker/src/index.ts'), 'utf8');
  assert.match(index, /url\.pathname === '\/api\/newsletter\/subscribe'/);
  const nl = readFileSync(join(root, '../worker/src/newsletter.ts'), 'utf8');
  const accepted = new RegExp(nl.match(/const SOURCES = \/(.+)\/;/)[1]);
  for (const f of htmlFiles) for (const { source } of forms(readFileSync(f, 'utf8'))) assert.match(source, accepted, `${f}: source ${source} would be dropped`);
});

test('newsletter: no Turnstile script is added to pages without the enquiry form (loaded on first interaction instead)', () => {
  for (const f of htmlFiles) {
    const h = readFileSync(f, 'utf8');
    if (h.includes('id="lead-form"')) continue;
    assert.doesNotMatch(h, /<script[^>]+src="https:\/\/challenges\.cloudflare\.com/, f);
  }
});
