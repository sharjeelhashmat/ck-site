#!/usr/bin/env python3
"""Compass Key card kit renderer (owner approved 2026-11-23).

Renders social cards from a JSON spec, identical to the approved reference (kit_reference.html and the five approved
PNGs). Two engines, one layout:

  pillow (default)  Python and Pillow only, with the bundled TTF fonts. Runs in a plain cloud sandbox.
  html              The HTML templates in templates/, screenshotted by Playwright (Chromium), with the bundled woff2
                    fonts. Used only when Playwright is installed.

Both engines take their positions from the same layout code below, which follows the browser's own rules for these
fonts (line boxes in 1/64 px, rounded ascent and descent, floored half-leading), so a card lays out the same either way.

Usage:
  python3 render_cards.py SPEC.json [-o OUT] [--engine pillow|html]
SPEC.json holds one card (an object) or a carousel (a list of objects); OUT is a PNG path for one card, a folder for a
list (default: next to the spec). Every spec is checked first: unknown template or field, a missing required field,
an em or en dash, a character the bundled fonts do not have, or text that does not fit, stops with an error. Nothing
is ever drawn with a fallback font.
"""
from __future__ import annotations

import argparse
import html as htmllib
import json
import math
import os
import re
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, features

KIT = Path(__file__).resolve().parent
FONTS = KIT / 'fonts'
ASSETS = KIT / 'assets'
TEMPLATES = KIT / 'templates'

# ---- Brand constants (Rules 1c v6.9). Nothing else is drawn. -------------------------------------------------------
INK, IVORY, BRASS, BRASS_DEEP, SLATE = (0x14, 0x25, 0x2F), (0xF3, 0xF0, 0xE7), (0xC6, 0xA2, 0x72), (0x7E, 0x60, 0x34), (0x8F, 0xA3, 0xAB)
PALETTE = {'ink': INK, 'ivory': IVORY, 'brass': BRASS, 'brass_deep': BRASS_DEEP, 'slate_light': SLATE}
FOOT_RULE = (0x3A, 0x4A, 0x55)  # the approved reference's footer rule colour
FOOTER = 'SHARJEEL HASHMAT / PROPERTY CONSULTANT · UAE'
SIZES = {'feed': (1080, 1350), 'reel': (1080, 1920)}
TEMPLATE_NAMES = ('cover', 'list', 'quote', 'chart', 'closing')
DASHES = re.compile('[\u2012\u2013\u2014\u2015]')  # figure, en, em and horizontal bar dashes; the minus sign U+2212 is fine
MINUS = '−'

# Fonts: (file, ascent, descent, units per em). Ascent and descent are the fonts' own hhea values (equal to their
# typo values, USE_TYPO_METRICS set, no line gap), which is what the browser uses.
FACES = {
    'corm500': ('cormorant-garamond-latin-500-normal.ttf', 924, 287, 1000),
    'corm600': ('cormorant-garamond-latin-600-normal.ttf', 924, 287, 1000),
    'corm500i': ('cormorant-garamond-latin-500-italic.ttf', 924, 287, 1000),
    'inter': ('inter-latin-wght-normal.ttf', 1984, 494, 2048),
}
FACE_NAMES = {'corm500': ('Cormorant Garamond Light', 'Medium'), 'corm600': ('Cormorant Garamond Light', 'SemiBold'),
              'corm500i': ('Cormorant Garamond Light', 'Medium Italic'), 'inter': ('Inter', None)}
W, PAD, CW = 1080, 72, 936  # card width, side padding, content width


class SpecError(ValueError):
    """A spec the kit refuses: the message says which field and why."""


# ---- Fonts ---------------------------------------------------------------------------------------------------------
_font_cache: dict = {}


def font(face: str, size: int, weight: int | None = None) -> ImageFont.FreeTypeFont:
    key = (face, size, weight)
    if key in _font_cache:
        return _font_cache[key]
    path = FONTS / FACES[face][0]
    if not path.is_file():
        raise SpecError(f'font file missing: {path} (the kit never falls back to another font)')
    if not features.check('raqm'):
        # Without raqm (HarfBuzz text shaping) Pillow drops the fonts' kerning, so lines would wrap and sit differently
        # from the approved cards. Pillow from PyPI (pip install pillow) includes it.
        raise SpecError('this Pillow has no raqm text shaping; install Pillow from PyPI (pip install pillow) so cards match the kit')
    f = ImageFont.truetype(str(path), size, layout_engine=ImageFont.Layout.RAQM)
    family, style = f.getname()
    want = FACE_NAMES[face]
    if family != want[0] or (want[1] and style != want[1]):
        raise SpecError(f'{path.name} loaded as {family} {style}, expected {want[0]} {want[1] or ""}')
    if face == 'inter':
        f.set_variation_by_axes([weight or 400])
    _font_cache[key] = f
    return f


def metrics(face: str, size: int) -> tuple[int, int]:
    """Rounded ascent and descent in px, as the browser computes them."""
    _, asc, desc, upm = FACES[face]
    return round(asc * size / upm), round(desc * size / upm)


def lu(px: float) -> float:
    """A length in the browser's layout units (1/64 px, rounded down)."""
    return math.floor(px * 64) / 64


_notdef: dict = {}


def missing_glyphs(f: ImageFont.FreeTypeFont, text: str) -> list[str]:
    """Characters the font has no glyph for (they would render as the .notdef box)."""
    key = id(f)
    if key not in _notdef:
        _notdef[key] = (f.getbbox(''), bytes(f.getmask('')))
    nd = _notdef[key]
    out = []
    for ch in sorted(set(text)):
        if ch.isspace():
            continue
        if (f.getbbox(ch), bytes(f.getmask(ch))) == nd:
            out.append(ch)
    return out


# ---- Text measurement and wrapping ---------------------------------------------------------------------------------
class Style:
    def __init__(self, face, size, weight=None, color=IVORY, spacing=0.0, line_height=None):
        self.face, self.size, self.weight, self.color, self.spacing = face, size, weight, color, spacing
        self.f = font(face, size, weight)
        self.a, self.d = metrics(face, size)
        self.lh = lu(size * line_height) if line_height else float(self.a + self.d)

    def width(self, text: str) -> float:
        return self.f.getlength(text) + self.spacing * len(text)

    def text_top(self, line_top: float) -> float:
        return line_top + math.floor((self.lh - (self.a + self.d)) / 2)


def norm(text: str) -> list[str]:
    """Paragraphs (split on newline), with runs of spaces collapsed as the browser does."""
    return [' '.join(p.split()) for p in str(text).split('\n')]


def wrap(text: str, st: Style, width: float, field: str) -> list[str]:
    lines = []
    for para in norm(text):
        cur = ''
        for word in para.split(' '):
            if not word:
                continue
            cand = f'{cur} {word}' if cur else word
            if not cur or st.width(cand) <= width + 0.01:
                if not cur and st.width(word) > width + 0.01:
                    raise SpecError(f'{field}: "{word}" is wider than the card')
                cur = cand
            else:
                lines.append(cur)
                cur = word
        lines.append(cur)
    return lines


# ---- Spec checking -------------------------------------------------------------------------------------------------
FIELDS = {
    'cover': ({'label', 'kicker', 'title', 'lede'}, {'page'}),
    'list': ({'label', 'title', 'items'}, {'page'}),
    'quote': ({'label', 'quote', 'source'}, {'context', 'page'}),
    'chart': ({'label', 'title', 'period', 'areas', 'source'}, {'page'}),
    'closing': (set(), {'tagline', 'pillars', 'page'}),
}
COMMON = {'template', 'size', 'name'}


def texts_of(value) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [t for v in value.values() for t in texts_of(v)]
    if isinstance(value, list):
        return [t for v in value for t in texts_of(v)]
    return []


def check_spec(spec: dict) -> dict:
    if not isinstance(spec, dict):
        raise SpecError('a card spec must be a JSON object')
    tpl = spec.get('template')
    if tpl not in TEMPLATE_NAMES:
        raise SpecError(f'template must be one of {", ".join(TEMPLATE_NAMES)} (got {tpl!r})')
    req, opt = FIELDS[tpl]
    unknown = set(spec) - req - opt - COMMON
    if unknown:
        raise SpecError(f'{tpl}: unknown field(s) {", ".join(sorted(unknown))}')
    missing = [k for k in sorted(req) if spec.get(k) in (None, '', [])]
    if missing:
        raise SpecError(f'{tpl}: missing {", ".join(missing)}')
    size = spec.get('size', 'feed')
    if size not in SIZES:
        raise SpecError(f'size must be one of {", ".join(SIZES)} (got {size!r})')
    for t in texts_of(spec):
        if DASHES.search(t):
            raise SpecError(f'em or en dash in "{t}" (write "to" for ranges, or a comma)')
    if tpl == 'list':
        if not isinstance(spec['items'], list) or not 1 <= len(spec['items']) <= 6:
            raise SpecError('list: items must be a list of 1 to 6 entries')
        for i, it in enumerate(spec['items']):
            if isinstance(it, dict):
                if set(it) - {'text', 'source'} or not it.get('text'):
                    raise SpecError(f'list: item {i + 1} must be text or {{"text", "source"}}')
            elif not isinstance(it, str) or not it.strip():
                raise SpecError(f'list: item {i + 1} must be text or {{"text", "source"}}')
    if tpl == 'chart':
        areas = spec['areas']
        if not isinstance(areas, list) or not 1 <= len(areas) <= 4:
            raise SpecError('chart: areas must be a list of 1 to 4 areas')
        for i, a in enumerate(areas):
            if not isinstance(a, dict) or set(a) - {'name', 'dld', 'now', 'before', 'change_pct'}:
                raise SpecError(f'chart: area {i + 1} fields are name, dld, now, before and optionally change_pct')
            for k in ('name', 'dld'):
                if not isinstance(a.get(k), str) or not a[k].strip():
                    raise SpecError(f'chart: area {i + 1} needs {k} (common name first, the DLD name under it)')
            for k in ('now', 'before'):
                p = a.get(k)
                if not isinstance(p, dict) or set(p) != {'year', 'value_bn'} or not isinstance(p['value_bn'], (int, float)) or p['value_bn'] < 0:
                    raise SpecError(f'chart: area {i + 1} {k} must be {{"year", "value_bn"}} with a value of 0 or more')
            if 'change_pct' in a and not isinstance(a['change_pct'], (int, float)):
                raise SpecError(f'chart: area {i + 1} change_pct must be a number')
    return spec


# ---- Layout: one list of drawing operations, used by both engines --------------------------------------------------
class Layout:
    def __init__(self, spec: dict):
        self.spec = spec
        self.tpl = spec['template']
        self.size = spec.get('size', 'feed')
        self.w, self.h = SIZES[self.size]
        self.ops: list = []
        self.texts: list = []  # (field, text, Style) for glyph checks
        self.chart_area = None
        self.foot_top = self.h - 101

    # Operations
    def text(self, field, x, top, s, st: Style):
        self.texts.append((field, s, st))
        self.ops.append(('text', x, top + st.a, s, st))

    def rect(self, x0, y0, x1, y1, color):
        self.ops.append(('rect', x0, y0, x1, y1, color))

    def block(self, field, text, st: Style, x, top, width, align='left') -> float:
        """A wrapped text block; returns its height."""
        lines = wrap(text, st, width, field)
        for i, line in enumerate(lines):
            lx = x if align == 'left' else x + (width - st.width(line)) / 2
            self.text(field, lx, st.text_top(top + i * st.lh), line, st)
        return len(lines) * st.lh

    def fits(self, bottom, limit, what):
        if bottom > limit + 0.01:
            raise SpecError(f'{self.tpl}: {what} does not fit ({bottom - limit:.0f}px too long); shorten the text or split the card')

    # Header and footer (identical on every card except the closing card, which has no header)
    def header(self):
        label = str(self.spec['label']).upper()
        st = Style('inter', 22, 500, BRASS, 22 * .28)
        if PAD + 42 + 24 + st.width(label) > PAD + CW:
            raise SpecError(f'label "{label}" is too long for the header')
        self.text('label', PAD + CW - st.width(label), 88 + (56 - (st.a + st.d)) / 2, label, st)
        self.ops.append(('image', 'mark', 74, 99, 36, 34))
        self.rect(PAD, 172, PAD + CW, 174, BRASS)

    def footer(self):
        self.rect(PAD, self.foot_top, PAD + CW, self.foot_top + 1, FOOT_RULE)
        left = Style('inter', 20, 400, BRASS, 20 * .22)
        top = self.h - 100 + (100 - (left.a + left.d)) / 2
        self.text('footer', PAD, top, FOOTER, left)
        page = self.spec.get('page')
        if page:
            st = Style('inter', 20, 600, IVORY, 20 * .1)
            x = PAD + CW - st.width(str(page))
            if x < PAD + left.width(FOOTER) + 16:
                raise SpecError('page is too long for the footer')
            self.text('page', x, top, str(page), st)

    # Templates
    def cover(self):
        s = self.spec
        y = 174 + 90
        y += self.block('kicker', str(s['kicker']).upper(), Style('inter', 24, 600, BRASS, 24 * .3), PAD, y, CW) + 18
        y += self.block('title', s['title'], Style('corm600', 104, line_height=1.02), PAD, y, CW) + 34
        self.rect(PAD, y, PAD + 200, y + 7, BRASS)
        y += 7 + 40
        y += self.block('lede', s['lede'], Style('inter', 36, 400, line_height=1.45), PAD, y, CW)
        self.fits(y, self.foot_top - 40, 'the cover text')

    def list(self):
        s = self.spec
        y = 174 + 56
        y += self.block('title', s['title'], Style('corm600', 80, line_height=1.05), PAD, y, CW) + 34
        self.rect(PAD, y, PAD + 200, y + 7, BRASS)
        y += 7 + 40
        num = Style('corm500', 58, color=BRASS, line_height=1)
        body = Style('inter', 34, 400, line_height=1.42)
        src = Style('inter', 21, 400, SLATE, 21 * .06)
        tx = PAD + 48 + 44
        for i, it in enumerate(s['items']):
            text, source = (it['text'], it.get('source')) if isinstance(it, dict) else (it, None)
            self.text('items', PAD, num.text_top(y), str(i + 1), num)
            h = self.block('items', text, body, tx, y, CW - 48 - 44)
            if source:
                h += 10 + self.block('items', source, src, tx, y + h + 10, CW - 48 - 44)
            y += max(num.lh, h) + (46 if i < len(s['items']) - 1 else 0)
        self.fits(y, self.foot_top - 40, 'the list')

    def quote(self):
        s = self.spec
        y = 174 + 150 + 24
        mk = Style('corm500', 110, color=BRASS, line_height=.6)
        self.text('quote', PAD + (CW - mk.width('“')) / 2, mk.text_top(y), '“', mk)
        y += mk.lh + 36
        y += self.block('quote', s['quote'], Style('corm500', 74, line_height=1.14), PAD + 40, y, CW - 80, 'center')
        if s.get('context'):
            y += 40 + self.block('context', s['context'], Style('inter', 30, 400, SLATE, line_height=1.5), PAD + 70, y + 40, CW - 140, 'center') + 34
        else:
            y += 40  # the quote's bottom margin and the source's top margin collapse to the larger one
        y += self.block('source', s['source'], Style('inter', 22, 400, SLATE, 22 * .06), PAD, y, CW, 'center')
        self.fits(y, self.foot_top - 40, 'the quote')

    def chart(self):
        s = self.spec
        y = 174 + 56
        y += self.block('title', s['title'], Style('corm600', 66, line_height=1.05), PAD, y, CW) + 40
        y += self.block('period', str(s['period']).upper(), Style('inter', 22, 400, BRASS, 22 * .2), PAD, y, CW)
        name, dld = Style('corm600', 60), Style('inter', 21, 400, SLATE)
        yr_now, yr_before = Style('inter', 24, 600, IVORY), Style('inter', 24, 600, BRASS_DEEP)
        val = Style('inter', 30, 600, IVORY)
        values = [a[k]['value_bn'] for a in s['areas'] for k in ('now', 'before')]
        top_value = max(values) or 1
        chart_top = None
        for i, a in enumerate(s['areas']):
            y += 70 if i == 0 else 80
            chart_top = y if chart_top is None else chart_top
            y += self.block('areas', a['name'], name, PAD, y, CW) + 6
            y += self.block('areas', f'DLD: {a["dld"]}', dld, PAD, y, CW) + 22
            now, before = a['now'], a['before']
            change = a.get('change_pct')
            if change is None and before['value_bn'] > 0:
                change = (now['value_bn'] / before['value_bn'] - 1) * 100
            chg_text = '' if change is None else ('+' if change > 0 else MINUS if change < 0 else '') + f'{abs(change):.1f}%'
            chg = Style('inter', 30, 700, BRASS if change is not None and change < 0 else IVORY)
            for row, (point, yr, kind) in enumerate(((now, yr_now, 'now'), (before, yr_before, 'before'))):
                rt = y + row * 56
                self.text('areas', PAD, rt + (56 - (yr.a + yr.d)) / 2, str(point['year']), yr)
                bw = round(point['value_bn'] / top_value * 560)
                bw = max(bw, 14) if point['value_bn'] > 0 else 0
                if bw:
                    self.ops.append(('bar', PAD + 90, rt + 21, PAD + 90 + bw, rt + 35, kind))
                vt = f'AED {point["value_bn"]:.2f}bn'
                vx = PAD + 90 + bw + 18
                self.text('areas', vx, rt + (56 - (val.a + val.d)) / 2, vt, val)
                limit = PAD + CW
                if kind == 'now' and chg_text:
                    cx = PAD + CW - chg.width(chg_text)
                    self.text('areas', cx, rt + (56 - (chg.a + chg.d)) / 2, chg_text, chg)
                    limit = cx - 24
                if vx + val.width(vt) > limit:
                    raise SpecError(f'chart: the value for {a["name"]} {point["year"]} runs into the change figure')
            y += 112
        src = Style('inter', 20, 400, SLATE, line_height=1.5)
        lines = wrap(s['source'], src, CW, 'source')
        src_top = self.h - 130 - len(lines) * src.lh
        self.block('source', s['source'], src, PAD, src_top, CW)
        self.fits(y, src_top - 30, 'the chart')
        self.chart_area = (PAD, round(chart_top), PAD + CW, round(y))

    def closing(self):
        s = self.spec
        tagline = s.get('tagline') or 'Clarity before commitment.'
        pillars = str(s.get('pillars') or 'NUMBERS FIRST · STRAIGHT ANSWERS · NO PITCH').upper()
        tag, pil = Style('corm500i', 56), Style('inter', 26, 400, SLATE, 26 * .24)
        tag_lines, pil_lines = wrap(tagline, tag, CW, 'tagline'), wrap(pillars, pil, CW, 'pillars')
        logo_h = 760 * 960 / 2880
        total = logo_h + 70 + len(tag_lines) * tag.lh + 40 + 3 + 40 + len(pil_lines) * pil.lh
        box_h = self.h - 200
        self.fits(total, box_h, 'the closing card')
        y = 88 + (box_h - total) / 2
        self.ops.append(('image', 'logo', 160, y, 760, logo_h))
        y += logo_h + 70
        y += self.block('tagline', tagline, tag, PAD, y, CW, 'center') + 40
        self.rect(480, y, 600, y + 3, BRASS)
        y += 3 + 40
        self.block('pillars', pillars, pil, PAD, y, CW, 'center')

    def build(self):
        if self.tpl != 'closing':
            self.header()
        getattr(self, self.tpl)()
        self.footer()
        for field, s, st in self.texts:
            miss = missing_glyphs(st.f, s)
            if miss:
                raise SpecError(f'{field}: the kit fonts have no glyph for {", ".join(repr(c) for c in miss)} (no fallback font is used)')
        return self


# ---- Pillow engine -------------------------------------------------------------------------------------------------
def snap(v: float) -> int:
    return int(math.floor(v + 0.5))


def aa_round_rect(img: Image.Image, box, radius: float, color, border: float = 0):
    """An anti-aliased rounded rectangle (solid, or only its border), drawn at 8x and reduced."""
    x0, y0, x1, y1 = box
    k = 8
    w, h = x1 - x0, y1 - y0
    m = Image.new('L', (w * k, h * k), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle((0, 0, w * k - 1, h * k - 1), radius=radius * k, fill=255)
    if border:
        b = border * k
        d.rounded_rectangle((b, b, w * k - 1 - b, h * k - 1 - b), radius=max(radius - border, 0) * k, fill=0)
    m = m.resize((w, h), Image.Resampling.BOX)
    img.paste(Image.new('RGB', (w, h), color), (x0, y0), m)


def draw_text(img: Image.Image, x: float, baseline: float, s: str, st: Style):
    d = ImageDraw.Draw(img)
    by = snap(baseline)
    if not st.spacing:
        d.text((x, by), s, font=st.f, fill=st.color, anchor='ls')
        return
    for i, ch in enumerate(s):
        if not ch.isspace():
            d.text((x, by), ch, font=st.f, fill=st.color, anchor='ls')
        nxt = s[i + 1:i + 2]
        adv = (st.f.getlength(ch + nxt) - st.f.getlength(nxt)) if nxt else st.f.getlength(ch)
        x += adv + st.spacing


def raster(name: str) -> Image.Image:
    path = ASSETS / {'mark': 'mark-ivory-36x34.png', 'logo': 'logo-horizontal-ivory-760.png'}[name]
    if not path.is_file():
        raise SpecError(f'asset missing: {path}')
    return Image.open(path).convert('RGBA')


def render_pillow(lay: Layout) -> Image.Image:
    img = Image.new('RGB', (lay.w, lay.h), INK)
    for op in lay.ops:
        kind = op[0]
        if kind == 'text':
            _, x, base, s, st = op
            draw_text(img, x, base, s, st)
        elif kind == 'rect':
            _, x0, y0, x1, y1, color = op
            ImageDraw.Draw(img).rectangle((snap(x0), snap(y0), snap(x1) - 1, snap(y1) - 1), fill=color)
        elif kind == 'bar':
            _, x0, y0, x1, y1, which = op
            box = (snap(x0), snap(y0), snap(x1), snap(y1))
            if which == 'now':
                aa_round_rect(img, box, 7, BRASS)
            else:
                aa_round_rect(img, box, 7, BRASS_DEEP, border=3)
        elif kind == 'image':
            _, name, x, y, w, h = op
            im = raster(name)
            layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
            # The logo raster carries its 1/3 px offset (tools/rasterize_assets.py), so it goes at the pixel above.
            layer.paste(im, (snap(x), math.floor(y) if name == 'logo' else snap(y)))
            img = Image.alpha_composite(img.convert('RGBA'), layer).convert('RGB')
    return img


# ---- HTML engine (Playwright, optional) ----------------------------------------------------------------------------
def fill(template: str, ctx: dict) -> str:
    """Placeholders: {{name}} escaped, {{&name}} raw, {{#name}}...{{/name}} a list or an optional value."""
    def section(m):
        key, inner = m.group(1), m.group(2)
        v = ctx.get(key)
        if isinstance(v, list):
            return ''.join(fill(inner, {**ctx, **item}) for item in v)
        return fill(inner, ctx) if v else ''
    out = re.sub(r'\{\{#(\w+)\}\}(.*?)\{\{/\1\}\}', section, template, flags=re.S)
    out = re.sub(r'\{\{&(\w+)\}\}', lambda m: str(ctx.get(m.group(1), '')), out)
    return re.sub(r'\{\{(\w+)\}\}', lambda m: htmllib.escape(str(ctx.get(m.group(1), '')), quote=True), out)


def br(text: str) -> str:
    return '<br>'.join(htmllib.escape(p) for p in norm(text))


def page_html(spec: dict, lay: Layout) -> str:
    tpl = spec['template']
    read = lambda n: (TEMPLATES / n).read_text(encoding='utf-8')
    ctx = {**spec, 'css': (TEMPLATES / 'card.css').as_uri(), 'mark': (ASSETS / 'mark-ivory.svg').as_uri(),
           'logo': (ASSETS / 'logo-horizontal-ivory.svg').as_uri(), 'footer': FOOTER,
           'size_class': ' reel' if lay.size == 'reel' else ''}
    for k in ('label', 'kicker', 'period'):
        if k in spec:
            ctx[k] = str(spec[k]).upper()
    if tpl == 'cover' or tpl == 'list' or tpl == 'chart':
        ctx['title_html'] = br(spec['title'])
    if tpl == 'quote':
        ctx['quote_html'] = br(spec['quote'])
    if tpl == 'list':
        ctx['items'] = [{'n': i + 1, 'text': it['text'] if isinstance(it, dict) else it,
                         'source': it.get('source') if isinstance(it, dict) else None} for i, it in enumerate(spec['items'])]
    if tpl == 'chart':
        bars = iter(op for op in lay.ops if op[0] == 'bar')
        areas = []
        for a in spec['areas']:
            row = {'name': a['name'], 'dld': a['dld']}
            for kind in ('now', 'before'):
                p = a[kind]
                row[f'{kind}_year'], row[f'{kind}_text'] = p['year'], f'AED {p["value_bn"]:.2f}bn'
                row[f'{kind}_w'] = 0
                if p['value_bn'] > 0:
                    op = next(bars)
                    row[f'{kind}_w'] = snap(op[3]) - snap(op[1])
            ch = a.get('change_pct')
            if ch is None and a['before']['value_bn'] > 0:
                ch = (a['now']['value_bn'] / a['before']['value_bn'] - 1) * 100
            row['change_text'] = '' if ch is None else ('+' if ch > 0 else MINUS if ch < 0 else '') + f'{abs(ch):.1f}%'
            row['chg_class'] = ' down' if ch is not None and ch < 0 else ''
            areas.append(row)
        ctx['areas'] = areas
    if tpl == 'closing':
        ctx['tagline'] = spec.get('tagline') or 'Clarity before commitment.'
        ctx['pillars'] = str(spec.get('pillars') or 'NUMBERS FIRST · STRAIGHT ANSWERS · NO PITCH').upper()
    ctx['header'] = '' if tpl == 'closing' else fill(read('_header.html'), ctx)
    ctx['footer'] = fill(read('_footer.html'), {**ctx, 'footer': FOOTER})
    ctx['body'] = fill(read(f'{tpl}.html'), ctx)
    return fill(read('_page.html'), ctx)


def render_html(specs_layouts: list, outs: list):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        raise SpecError('the html engine needs Playwright (pip install playwright); the pillow engine needs nothing else') from e
    exe = os.environ.get('CARD_KIT_CHROMIUM') or None
    with sync_playwright() as p, tempfile.TemporaryDirectory() as tmp:
        browser = p.chromium.launch(executable_path=exe)
        try:
            for (spec, lay), out in zip(specs_layouts, outs):
                page = browser.new_page(viewport={'width': lay.w, 'height': lay.h}, device_scale_factor=1)
                doc = Path(tmp) / 'card.html'
                doc.write_text(page_html(spec, lay), encoding='utf-8')
                page.goto(doc.as_uri())
                status = page.evaluate('async () => { await document.fonts.ready; await Promise.all([...document.fonts].map((f) => f.load().catch(() => null))); return [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.style} ${f.status}`); }')
                bad = [s for s in status if not s.endswith(' loaded')]
                if bad or len(status) != 4:
                    raise SpecError(f'html engine: kit fonts did not load ({bad or status})')
                page.locator('#card').screenshot(path=str(out))
                page.close()
        finally:
            browser.close()


# ---- Entry points --------------------------------------------------------------------------------------------------
def layout(spec: dict) -> Layout:
    return Layout(check_spec(spec)).build()


def render(spec: dict, out: Path, engine: str = 'pillow') -> dict:
    """Render one card. Returns a report: size, engine, fonts used, chart area."""
    lay = layout(spec)
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    if engine == 'html':
        render_html([(spec, lay)], [out])
    elif engine == 'pillow':
        render_pillow(lay).save(out, optimize=True)
    else:
        raise SpecError(f'engine must be pillow or html (got {engine!r})')
    faces = sorted({f'{st.face}{"@" + str(st.weight) if st.weight else ""}' for _, _, st in lay.texts})
    return {'out': str(out), 'template': lay.tpl, 'size': [lay.w, lay.h], 'engine': engine, 'faces': faces,
            'chart_area': lay.chart_area, 'texts': [s for _, s, _ in lay.texts]}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description='Render Compass Key social cards from a JSON spec.')
    ap.add_argument('spec', help='JSON file: one card (object) or a carousel (list)')
    ap.add_argument('-o', '--out', help='PNG path for one card, folder for a list (default: next to the spec)')
    ap.add_argument('--engine', choices=('pillow', 'html'), default='pillow')
    a = ap.parse_args(argv)
    src = Path(a.spec)
    data = json.loads(src.read_text(encoding='utf-8'))
    cards = data if isinstance(data, list) else [data]
    if isinstance(data, list):
        folder = Path(a.out) if a.out else src.with_suffix('')
        outs = [folder / ((c.get('name') or '%d_%s' % (i + 1, c.get('template', 'card'))) + '.png') for i, c in enumerate(cards)]
    else:
        outs = [Path(a.out) if a.out else src.with_suffix('.png')]
    try:
        for c, o in zip(cards, outs):
            r = render(c, o, a.engine)
            print(f'{r["out"]}: {r["template"]} {r["size"][0]}x{r["size"][1]} ({r["engine"]})')
    except SpecError as e:
        print(f'refused: {e}', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
