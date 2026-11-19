// The stylesheet and fonts the tool serves (Text and Data modules, see wrangler.toml [[rules]]): the public site's own
// global.css, data-card.css and launch-cards.css, so the preview looks exactly like the site; its three @fontsource
// imports are replaced by @font-face rules for the same three files, copied into assets/fonts (SIL OFL, licences beside).
import globalCss from '../../../site/src/styles/global.css';
import dataCardCss from '../../../site/src/styles/data-card.css';
import launchCss from '../../../site/src/styles/launch-cards.css';
import toolCss from './tool.css';
import inter from '../assets/fonts/inter-latin-wght-normal.woff2';
import serif600 from '../assets/fonts/cormorant-garamond-latin-600-normal.woff2';
import serifItalic from '../assets/fonts/cormorant-garamond-latin-400-italic.woff2';
import { buildCss } from './css';
import type { Assets } from './app';

export const ASSETS: Assets = {
  css: buildCss(globalCss, [dataCardCss, launchCss, toolCss]),
  fonts: {
    'inter-latin-wght-normal.woff2': inter,
    'cormorant-garamond-latin-600-normal.woff2': serif600,
    'cormorant-garamond-latin-400-italic.woff2': serifItalic,
  },
};
