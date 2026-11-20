// The tool's stylesheet: the site's global.css with its @fontsource @import lines replaced by local @font-face rules.
export const FONT_FACES = [
  "@font-face{font-family:'Inter Variable';font-style:normal;font-display:swap;font-weight:100 900;src:url(/assets/fonts/inter-latin-wght-normal.woff2) format('woff2-variations')}",
  "@font-face{font-family:'Cormorant Garamond';font-style:normal;font-display:swap;font-weight:600;src:url(/assets/fonts/cormorant-garamond-latin-600-normal.woff2) format('woff2')}",
  "@font-face{font-family:'Cormorant Garamond';font-style:italic;font-display:swap;font-weight:400;src:url(/assets/fonts/cormorant-garamond-latin-400-italic.woff2) format('woff2')}",
].join('\n');

export function buildCss(globalCss: string, rest: string[]): string {
  const base = globalCss.replace(/^@import\s+'@fontsource[^']*';\s*$/gm, '');
  if (/@import/.test(base)) throw new Error('global.css has an @import the research tool does not know');
  return [FONT_FACES, base, ...rest].join('\n');
}
