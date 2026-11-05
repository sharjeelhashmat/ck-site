// Rules 1c v5.8, the only design spec (the same values as the Sharjeel Hashmat Design System tokens.json), as checks
// on CSS text. Used by tests/design-rules.test.mjs on the source stylesheets and again on the built CSS and HTML.
//   Faces: Cormorant Garamond 600 (names, headlines) and Cormorant Garamond Italic 400 (taglines, pull quotes), never
//   below 22px. Inter 400 (body, labels in capitals) and Inter 500 (data, tables, big figures). No other weights.
//   Type scale: the --fs-* tokens in global.css. Spacing: the nine --space-* steps. Corners: the five --radius-* tokens.

export const WEIGHTS = { sans: ['400', '500'], serifNormal: ['600'], serifItalic: ['400'] };

// The type scale in px (global.css :root, rem x 16), and which face may use each step.
export const FS = { 'display-xl': 64, 'display-lg': 44, heading: 28, tagline: 22, label: 12, body: 16, data: 16, stat: 48, small: 14 };
export const SERIF_STEPS = ['display-xl', 'display-lg', 'heading', 'tagline'];
export const SANS_STEPS = ['label', 'body', 'data', 'stat', 'small'];
export const SPACE = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48, 16: 64, 24: 96 };
export const RADIUS = { sm: '8px', md: '12px', lg: '16px', xl: '24px', full: '9999px' };
export const RADIUS_FULL_ONLY = /\.fab--wa\b|avatar|headshot/;
export const REMOVED_TOKENS = /--r-(pill|field|card)\b/;

// The only @fontsource files the site may import, and the only font files the build may emit. Inter is the variable
// font: one file per subset carries the whole weight axis (there are no separate weight files); the CSS keeps it at
// 400 and 500. Fontsource also emits a .woff fallback beside each Cormorant .woff2.
export const FONTSOURCE_ALLOWED = [
  '@fontsource-variable/inter',
  '@fontsource/cormorant-garamond/600.css',
  '@fontsource/cormorant-garamond/400-italic.css',
  '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff2?url',
  '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-italic.woff2?url',
];
export const FONT_FILE_ALLOWED = /^(cormorant-garamond-[a-z-]+-(600-normal|400-italic)|inter-[a-z-]+-wght-normal)\.[\w-]+\.woff2?$/;

// Elements the browser makes bold by default. Only b, strong and th appear in the site; global.css sets b and strong to
// 500 and th to 400 (table headers are labels).
export const UA_BOLD_UNCOVERED = /<(h4|h5|h6|optgroup|dt)[\s>]/;

const familyOf = (v) => (/var\(--serif\)|cormorant/i.test(v) ? 'serif' : /var\(--sans\)|inter/i.test(v) ? 'sans' : null);
const WEIGHT_WORDS = { normal: '400', bold: '700' };

// Splits CSS into innermost rule blocks: [{ selector, body }]. @font-face and other at-rule bodies are skipped;
// @media and @supports are walked into.
export function blocks(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') {
      stack.push({ prelude: text.slice(start, i).split(/[;}]/).pop().trim(), open: i + 1 });
      start = i + 1;
    } else if (c === '}') {
      const b = stack.pop();
      if (b && !b.prelude.startsWith('@')) {
        const body = text.slice(b.open, i);
        if (!body.includes('{')) out.push({ selector: b.prelude, body });
      }
      start = i + 1;
    }
  }
  return out;
}

// Declarations of one block, in order: [[property, value]]. Values keep their spelling, without !important.
export function declarations(body) {
  const d = [];
  for (const part of body.split(/;(?![^(]*\))/)) {
    const i = part.indexOf(':');
    if (i > 0) d.push([part.slice(0, i).trim().toLowerCase(), part.slice(i + 1).replace(/!important/, '').trim()]);
  }
  return d;
}

// What one block sets: { family, weight, style, size, upper, shorthand }, each null when left to inheritance.
export function fontOf(body) {
  const r = { family: null, weight: null, style: null, size: null, upper: false, shorthand: false };
  for (const [k, v] of declarations(body)) {
    if (k === 'font') { r.shorthand = true; r.family = familyOf(v); }
    if (k === 'font-family') r.family = familyOf(v);
    if (k === 'font-weight') r.weight = WEIGHT_WORDS[v] || v;
    if (k === 'font-style') r.style = /italic|oblique/.test(v) ? 'italic' : 'normal';
    if (k === 'font-size') r.size = v;
    if (k === 'text-transform') r.upper = v === 'uppercase';
  }
  return r;
}

// A font-size value as the scale steps it spans: "var(--fs-body)" -> ['body'];
// "clamp(var(--fs-heading), 1.25rem + 2vw, var(--fs-display-lg))" -> ['heading', 'display-lg']; anything else -> null.
export function steps(v) {
  const one = v.match(/^var\(--fs-([a-z-]+)\)$/);
  if (one) return FS[one[1]] ? [one[1]] : null;
  const c = v.match(/^clamp\(\s*var\(--fs-([a-z-]+)\)\s*,[^,]+,\s*var\(--fs-([a-z-]+)\)\s*\)$/);
  return c && FS[c[1]] && FS[c[2]] ? [c[1], c[2]] : null;
}

const SERIF_TAGS = /(^|[\s>+~])h[123](?=$|[.#:[\s])/;
const subjectOf = (sel) => sel.trim().split(/\s*[\s>+~]\s*/).pop();
const classesOf = (s) => [...s.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);

// Classes that mean Cormorant: classes of blocks that set the Cormorant family, plus classes found on h1 to h3 in the
// markup (`headingClasses`). A block that sets only a weight or size on one of them is judged as Cormorant.
export function serifClasses(allBlocks, headingClasses = []) {
  const set = new Set(headingClasses);
  for (const b of allBlocks) {
    if (fontOf(b.body).family !== 'serif') continue;
    for (const sel of b.selector.split(',')) for (const c of classesOf(subjectOf(sel))) set.add(c);
  }
  return set;
}

// Classes used on h1, h2 and h3 in markup (.astro, .mjs, .ts or built HTML).
export const headingClasses = (src) => [...src.matchAll(/<h[123]\b[^>]*\sclass="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean);

const isSpaceToken = (t) => t === '0' || t === 'auto' || (/^var\(--space-(\d+)\)$/.test(t) && SPACE[t.match(/\d+/)[0]]);
const isRadiusToken = (t) => t === '0' || /^var\(--radius-(sm|md|lg|xl|full)\)$/.test(t);
const SPACING = /^(scroll-)?(margin|padding)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(row-|column-)?gap$/;
const RADIUS_PROP = /^border(-(top|bottom|start|end)-(left|right|start|end))?-radius$/;

// Every rule in `css` that breaks Rules 1c v5.8, as "selector: reason" strings.
export function violations(css, serif = serifClasses(blocks(css))) {
  const bad = [];
  if (REMOVED_TOKENS.test(css)) bad.push(`removed radius token ${css.match(REMOVED_TOKENS)[0]}`);
  for (const { selector, body } of blocks(css)) {
    const f = fontOf(body);
    if (f.shorthand) bad.push(`${selector}: font shorthand (write font-family, font-weight, font-size and line-height)`);
    if (f.weight && !/^\d{3}$/.test(f.weight)) bad.push(`${selector}: font-weight ${f.weight}`);
    for (const [k, v] of declarations(body)) {
      if (SPACING.test(k)) {
        const off = v.split(/\s+/).filter((t) => !isSpaceToken(t));
        if (off.length) bad.push(`${selector}: ${k} ${v} (only 0, auto and the --space-* steps)`);
      }
      if (RADIUS_PROP.test(k)) {
        const off = v.split(/\s+/).filter((t) => !isRadiusToken(t));
        if (off.length) bad.push(`${selector}: ${k} ${v} (only 0 and the --radius-* tokens)`);
        if (/--radius-full/.test(v) && !RADIUS_FULL_ONLY.test(selector)) bad.push(`${selector}: --radius-full is only for avatars, the headshot frame and the WhatsApp button`);
      }
    }
    for (const sel of selector.split(',').map((s) => s.trim())) {
      let family = f.family;
      if (!family && (f.weight || f.size)) {
        const subject = subjectOf(sel);
        family = SERIF_TAGS.test(` ${subject}`) || classesOf(subject).some((c) => serif.has(c)) ? 'serif' : 'sans';
      }
      const italic = f.style === 'italic';
      const weight = f.weight && /^\d{3}$/.test(f.weight) ? f.weight : null; // a keyword weight is reported above
      if (f.size && f.size !== 'inherit') {
        const st = steps(f.size);
        if (!st) bad.push(`${sel}: font-size ${f.size} (only a --fs-* step, or a clamp() between two)`);
        else if (family === 'serif') {
          if (st.some((s) => FS[s] < 22)) bad.push(`${sel}: Cormorant at ${f.size}, below 22px`);
          else if (st.some((s) => !SERIF_STEPS.includes(s))) bad.push(`${sel}: Cormorant at ${f.size}, an Inter step`);
          else if (st.includes('tagline') && !italic) bad.push(`${sel}: the tagline step is Cormorant Italic`);
        } else if (family === 'sans' && st.some((s) => !SANS_STEPS.includes(s))) bad.push(`${sel}: Inter at ${f.size}, a Cormorant step`);
      }
      if (family === 'serif') {
        if (!f.weight && f.family === 'serif') bad.push(`${sel}: Cormorant set without its weight (600, or 400 italic)`);
        else if (weight && !(italic ? WEIGHTS.serifItalic : WEIGHTS.serifNormal).includes(weight)) bad.push(`${sel}: Cormorant ${italic ? 'italic' : 'normal'} at ${weight}`);
      } else if (family === 'sans' && weight) {
        if (!WEIGHTS.sans.includes(weight)) bad.push(`${sel}: Inter at ${weight}`);
        else if (f.upper && weight !== '400') bad.push(`${sel}: a label (capitals) at ${weight}; labels are 400`);
      }
    }
  }
  return bad;
}

// CSS from an .astro or .html file: its <style> blocks and every style="..." attribute (as a rule on that element's tag).
export function markupCss(src) {
  const parts = [...src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  for (const m of src.matchAll(/<([a-zA-Z][\w-]*)\b[^>]*?\sstyle=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g)) {
    parts.push(`${m[1]} { ${m[2] ?? m[3] ?? m[4]} }`);
  }
  return parts.join('\n');
}

export const fontsourceRefs = (src) => [...src.matchAll(/['"](@fontsource[^'"]*)['"]/g)].map((m) => m[1]);
