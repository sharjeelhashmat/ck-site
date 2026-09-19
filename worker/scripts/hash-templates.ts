import { readFileSync } from 'node:fs';
import { templateHash, type Template } from '../src/templates';

const tpls = (JSON.parse(readFileSync(new URL('../templates/lead-replies.v1.json', import.meta.url), 'utf8')) as { templates: Template[] }).templates;
console.log('| Template | Version | Lane | Hash |\n|---|---|---|---|');
for (const t of tpls) console.log(`| ${t.id} | ${t.version} | ${t.lane} | ${await templateHash(t)} |`);
