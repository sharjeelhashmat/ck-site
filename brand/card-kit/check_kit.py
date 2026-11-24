#!/usr/bin/env python3
"""Card kit check (CI job "card-kit", and by hand: python3 check_kit.py). Python and Pillow only.

Renders every example spec in examples/ with render_cards.py (Pillow engine) and fails when:
  1. a card is not 1080 x 1350 (feed) or 1080 x 1920 (reel);
  2. a font did not load or would fall back: every face must load from fonts/ under its own name, every character
     must have a glyph in the kit fonts, and the renderer must refuse a character the fonts lack and a missing font file;
  3. any pixel in a chart's bar area is outside the palette (Ink, Ivory, Brass, Brass Deep, Slate Light), allowing
     anti-aliasing: a pixel may lie between two palette colours;
  4. any text (specs, templates, README, code) contains an em or en dash, or the renderer accepts one;
  5. the Pillow card no longer matches the kit's HTML rendering (proof/html, the approved layout): more than 1,000
     inked pixels with no inked pixel within 1 px in the other image, or more than 1.5% of pixels differing by more
     than 64 in any channel. Glyph anti-aliasing differs between the two engines; a moved, missing or rewrapped line
     does not pass.
With --html (needs Playwright) it also renders every example with the HTML engine and checks the same rules.
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

import render_cards as rc

KIT = Path(__file__).resolve().parent
FAILS: list[str] = []


def fail(msg: str):
    FAILS.append(msg)
    print(f'FAIL {msg}')


def ok(msg: str):
    print(f'ok   {msg}')


PAL = list(rc.PALETTE.values())


def seg_dist(p, a, b) -> float:
    ab = [b[i] - a[i] for i in range(3)]
    den = sum(v * v for v in ab)
    t = 0.0 if not den else max(0.0, min(1.0, sum((p[i] - a[i]) * ab[i] for i in range(3)) / den))
    return sum((p[i] - (a[i] + t * ab[i])) ** 2 for i in range(3)) ** 0.5


def off_palette(img: Image.Image, box, tol: float = 3.0) -> int:
    """Colours in box farther than tol from every segment between two palette colours (a blend of two of them, which
    is what anti-aliasing draws), or from a palette colour itself."""
    colours = img.convert('RGB').crop(box).getcolors(1 << 24) or []
    return sum(1 for _, c in colours if min(seg_dist(c, PAL[i], PAL[j]) for i in range(len(PAL)) for j in range(i, len(PAL))) > tol)


def ink(img: Image.Image) -> Image.Image:
    """255 where a pixel differs from Ink by more than 40 in some channel."""
    d = ImageChops.difference(img.convert('RGB'), Image.new('RGB', img.size, rc.INK))
    r, g, b = d.split()
    return ImageChops.lighter(ImageChops.lighter(r, g), b).point(lambda v: 255 if v > 40 else 0)


def count(mask: Image.Image) -> int:
    return mask.histogram()[255]


def parity(a: Image.Image, b: Image.Image) -> tuple[int, float]:
    ia, ib = ink(a), ink(b)
    da, db = ia.filter(ImageFilter.MaxFilter(3)), ib.filter(ImageFilter.MaxFilter(3))
    lone = count(ImageChops.subtract(ia, db)) + count(ImageChops.subtract(ib, da))
    r, g, bb = ImageChops.difference(a.convert('RGB'), b.convert('RGB')).split()
    big = ImageChops.lighter(ImageChops.lighter(r, g), bb).point(lambda v: 255 if v > 64 else 0)
    return lone, count(big) * 100 / (a.size[0] * a.size[1])


def check_card(name: str, spec: dict, out: Path, engine: str):
    try:
        rep = rc.render(spec, out, engine)
    except rc.SpecError as e:
        fail(f'{name} ({engine}): refused: {e}')
        return
    img = Image.open(out)
    want = rc.SIZES[spec.get('size', 'feed')]
    (ok if img.size == want else fail)(f'{name} ({engine}): size {img.size[0]}x{img.size[1]} (want {want[0]}x{want[1]})')
    known = {'corm500', 'corm600', 'corm500i'} | {f'inter@{w}' for w in (400, 500, 600, 700)}
    extra = set(rep['faces']) - known
    (fail if extra else ok)(f'{name} ({engine}): fonts {", ".join(rep["faces"])}' + (f' (unexpected {extra})' if extra else ''))
    if rep['chart_area']:
        n = off_palette(img, rep['chart_area'])
        (fail if n else ok)(f'{name} ({engine}): chart area {rep["chart_area"]}: {n} colour(s) outside the palette')
    ref = KIT / 'proof' / 'html' / f'{name}.png'
    if engine == 'pillow':
        if not ref.is_file():
            fail(f'{name}: no proof/html/{name}.png to compare with')
        else:
            lone, big = parity(Image.open(ref), img)
            (fail if lone > 1000 or big > 1.5 else ok)(f'{name} (pillow) vs proof/html: {lone} lone inked px, {big:.3f}% px differ by more than 64')


def main() -> int:
    html = '--html' in sys.argv
    examples = sorted((KIT / 'examples').glob('*.json'))
    templates = {json.loads(p.read_text(encoding='utf-8'))['template'] for p in examples}
    (ok if templates >= set(rc.TEMPLATE_NAMES) else fail)(f'examples cover {", ".join(sorted(templates))}')
    sizes = {json.loads(p.read_text(encoding='utf-8')).get('size', 'feed') for p in examples}
    (ok if sizes >= set(rc.SIZES) else fail)(f'examples cover sizes {", ".join(sorted(sizes))}')
    with tempfile.TemporaryDirectory() as tmp:
        for p in examples:
            spec = json.loads(p.read_text(encoding='utf-8'))
            check_card(p.stem, spec, Path(tmp) / f'{p.stem}.png', 'pillow')
            if html:
                check_card(p.stem, spec, Path(tmp) / f'{p.stem}-html.png', 'html')

        # The renderer must refuse what would break the kit.
        cover = json.loads((KIT / 'examples' / '1_cover.json').read_text(encoding='utf-8'))
        for label, bad, expect in (
            ('an en dash', {**cover, 'lede': 'Plots from 2026 \u2013 2028.'}, 'dash'),
            ('an em dash', {**cover, 'lede': 'Plots \u2014 and villas.'}, 'dash'),
            ('a character the fonts lack', {**cover, 'lede': 'Area Ω and ب.'}, 'no glyph'),
            ('text that does not fit', {**cover, 'lede': 'A long sentence about villas and plots. ' * 20}, 'does not fit'),
            ('an unknown field', {**cover, 'colour': 'red'}, 'unknown field'),
        ):
            try:
                rc.layout(bad)
                fail(f'the renderer accepted {label}')
            except rc.SpecError as e:
                (ok if expect in str(e) else fail)(f'the renderer refuses {label}: {e}')
        # A missing font file is an error, never a fallback.
        saved, rc.FONTS = rc.FONTS, Path(tmp) / 'no-fonts'
        rc._font_cache.clear()
        try:
            rc.layout(cover)
            fail('the renderer drew without its font files')
        except rc.SpecError as e:
            ok(f'the renderer refuses a missing font file: {e}')
        finally:
            rc.FONTS = saved
            rc._font_cache.clear()
        # The palette check itself: a grey block in the chart area must fail it.
        chart = json.loads((KIT / 'examples' / '4_chart.json').read_text(encoding='utf-8'))
        rep = rc.render(chart, Path(tmp) / 'grey.png')
        img = Image.open(Path(tmp) / 'grey.png').convert('RGB')
        x0, y0, _, _ = rep['chart_area']
        ImageDraw.Draw(img).rectangle((x0 + 600, y0 + 150, x0 + 640, y0 + 170), fill=(128, 128, 128))
        (ok if off_palette(img, rep['chart_area']) else fail)('the palette check catches a grey block in the chart area')

    # No em or en dash in any kit text file.
    for f in sorted(KIT.rglob('*')):
        if f.suffix in {'.py', '.json', '.md', '.html', '.css', '.txt'} and f.is_file():
            t = f.read_text(encoding='utf-8')
            if rc.DASHES.search(t):
                fail(f'{f.relative_to(KIT)}: em or en dash')
    ok('no em or en dash in the kit text files')

    print(f'\n{len(FAILS)} failure(s)')
    return 1 if FAILS else 0


if __name__ == '__main__':
    sys.exit(main())
