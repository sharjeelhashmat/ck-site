#!/usr/bin/env python3
"""Rebuild proof/: every example rendered by both engines, and the five approved cards compared with the Pillow
renders. Needs Playwright (for the HTML engine). Writes:

  proof/pillow/<name>.png        render_cards.py, Pillow engine (what a plain sandbox produces)
  proof/html/<name>.png          render_cards.py, HTML engine (the kit's reference; check_kit.py compares against it)
  proof/side-by-side/<name>.png  approved | Pillow | difference (red: a channel differs by more than 64), at half size
  proof/stats.json               the numbers behind proof/README.md
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops

KIT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(KIT))
import render_cards as rc  # noqa: E402
from check_kit import parity  # noqa: E402

P = KIT / 'proof'


def changed(a: Image.Image, b: Image.Image, limit: int) -> float:
    r, g, bb = ImageChops.difference(a, b).split()
    m = ImageChops.lighter(ImageChops.lighter(r, g), bb).point(lambda v: 255 if v > limit else 0)
    return m.histogram()[255] * 100 / (a.size[0] * a.size[1])


def diff_image(a: Image.Image, b: Image.Image) -> Image.Image:
    r, g, bb = ImageChops.difference(a, b).split()
    m = ImageChops.lighter(ImageChops.lighter(r, g), bb).point(lambda v: 255 if v > 64 else 0)
    faded = Image.blend(b, Image.new('RGB', b.size, rc.INK), 0.7)
    faded.paste((230, 40, 40), (0, 0), m)
    return faded


stats = {}
examples = sorted((KIT / 'examples').glob('*.json'))
specs = [json.loads(p.read_text(encoding='utf-8')) for p in examples]
for p, spec in zip(examples, specs):
    rc.render(spec, P / 'pillow' / f'{p.stem}.png', 'pillow')
    rc.render(spec, P / 'html' / f'{p.stem}.png', 'html')
for p in examples:
    pil = Image.open(P / 'pillow' / f'{p.stem}.png').convert('RGB')
    htm = Image.open(P / 'html' / f'{p.stem}.png').convert('RGB')
    s = {'pillow_vs_html': dict(zip(('lone_ink_px', 'pct_over_64'), parity(htm, pil)))}
    appr = P / 'approved' / f'{p.stem}.png'
    if appr.is_file():
        a = Image.open(appr).convert('RGB')
        s['html_vs_approved'] = {'pct_any': changed(a, htm, 0), 'pct_over_64': changed(a, htm, 64)}
        s['pillow_vs_approved'] = {'pct_any': changed(a, pil, 0), 'pct_over_64': changed(a, pil, 64), 'lone_ink_px': parity(a, pil)[0]}
        w, h = a.size
        sheet = Image.new('RGB', (w * 3 + 40, h), (0, 0, 0))
        for i, im in enumerate((a, pil, diff_image(a, pil))):
            sheet.paste(im, (i * (w + 20), 0))
        out = P / 'side-by-side' / f'{p.stem}.png'
        out.parent.mkdir(parents=True, exist_ok=True)
        sheet.resize((sheet.size[0] // 2, h // 2), Image.Resampling.LANCZOS).save(out, optimize=True)
    stats[p.stem] = s
(P / 'stats.json').write_text(json.dumps(stats, indent=2) + '\n', encoding='utf-8')
print(json.dumps(stats, indent=1))
