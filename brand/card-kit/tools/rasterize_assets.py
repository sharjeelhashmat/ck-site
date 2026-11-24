#!/usr/bin/env python3
"""Rebuild the two PNG rasters the Pillow engine pastes (Pillow cannot draw SVG). Run only when an SVG in assets/
changes; needs Playwright. Each raster is the SVG drawn by Chromium at exactly the size and pixel position the HTML
templates draw it, on a transparent background, so both engines show the same pixels.

  assets/mark-ivory-36x34.png        assets/mark-ivory.svg at 36 x 34 (the card header mark)
  assets/logo-horizontal-ivory-760.png  assets/logo-horizontal-ivory.svg at 760 px wide (the closing card), drawn 1/3 px
                                     below the top edge: on the closing card the logo's top is always at n + 1/3 px
                                     (its height is 760 x 960 / 2880 = 253.33 and it is centred), so the raster carries
                                     that fraction and the Pillow engine pastes it at the whole pixel above.
"""
import os
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

ASSETS = Path(__file__).resolve().parent.parent / 'assets'
JOBS = [('mark-ivory.svg', 'mark-ivory-36x34.png', 36, 34, 0), ('logo-horizontal-ivory.svg', 'logo-horizontal-ivory-760.png', 760, 255, 1 / 3)]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CARD_KIT_CHROMIUM') or None)
    for src, out, w, h, top in JOBS:
        page = browser.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
        # A file page (not set_content): a page on about:blank may not load file:// images.
        doc = Path(tempfile.mkdtemp()) / 'raster.html'
        doc.write_text(f'<html><body style="margin:0;background:transparent"><img src="{(ASSETS / src).as_uri()}" style="display:block;position:absolute;left:0;top:{top}px;width:{w}px"></body></html>')
        page.goto(doc.as_uri())
        if not page.evaluate('() => { const i = document.images[0]; return i.complete && i.naturalWidth > 0; }'):
            raise SystemExit(f'{src} did not load')
        page.screenshot(path=str(ASSETS / out), omit_background=True, clip={'x': 0, 'y': 0, 'width': w, 'height': h})
        page.close()
        print(f'{out}: {w}x{h}')
    browser.close()
