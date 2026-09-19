import { readFileSync } from 'node:fs';
import { TEMPLATE_IDS } from '../src/lanes';
import { KNOWN_SLOTS, slotsUsed, type Template } from '../src/templates';

const tpls = (JSON.parse(readFileSync(new URL('../templates/lead-replies.v1.json', import.meta.url), 'utf8')) as { templates: Template[] }).templates;
const banned = (JSON.parse(readFileSync(new URL('../../guardrails/banned-phrases.json', import.meta.url), 'utf8')) as { phrases: string[] }).phrases;

const errors: string[] = [];
const err = (id: string, m: string) => errors.push(`${id}: ${m}`);

const ids = new Set<string>();
for (const t of tpls) {
  if (ids.has(t.id)) err(t.id, 'duplicate id');
  ids.add(t.id);

  const text = `${t.subject}\n${t.body}`;
  const used = slotsUsed(text);
  for (const s of used) {
    if (!(KNOWN_SLOTS as readonly string[]).includes(s)) err(t.id, `unknown slot ${s}`);
    if (!t.slots.includes(s)) err(t.id, `slot ${s} used but not declared`);
  }
  for (const s of t.slots) if (!used.includes(s)) err(t.id, `slot ${s} declared but unused`);

  const stripped = text.replace(/\{\{[a-z_]+\}\}/g, '');
  if (/\d/.test(stripped)) err(t.id, 'contains digits: no numeric claims allowed in templates');
  if (/[!$%]/.test(stripped) || /\bAED\b/i.test(stripped)) err(t.id, 'contains !, $, % or AED');
  for (const p of banned) if (stripped.toLowerCase().includes(p.toLowerCase())) err(t.id, `banned phrase: ${p}`);

  if (!used.includes('affiliation_line')) err(t.id, 'missing affiliation_line');
  if (t.marketing && !used.includes('unsubscribe_url')) err(t.id, 'marketing template without unsubscribe_url');
  if (!t.marketing && used.includes('unsubscribe_url')) err(t.id, 'non-marketing template must not carry unsubscribe_url');
  if (!/^Automated (acknowledgment|message)\./m.test(t.body)) err(t.id, 'missing automated-message notice');
  if (t.body.length > 1200) err(t.id, 'body too long');
  if (t.stream !== 'leads' && t.stream !== 'news') err(t.id, 'stream must be leads or news');
  if ((TEMPLATE_IDS as readonly string[]).includes(t.id) && t.stream !== 'leads') err(t.id, 'lane-mapped templates must be stream leads');
  if (t.stream === 'news' && !t.marketing) err(t.id, 'news-stream templates must be marketing (with unsubscribe)');
}
for (const id of TEMPLATE_IDS) if (!ids.has(id)) errors.push(`${id}: template missing`);

if (errors.length) {
  console.error(errors.map((e) => `FAIL ${e}`).join('\n'));
  process.exit(1);
}
console.log(`OK: ${tpls.length} templates pass lint`);
