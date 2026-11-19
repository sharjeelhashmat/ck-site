"""Maintenance PR 2 pixel diff. For every PNG present in both folders: the share of pixels that differ in any channel
(a size change counts every pixel outside the shared area as changed), and a diff image: the after shot faded to grey
with every changed pixel in red (a 17-colour palette image). Writes a markdown table to stdout.
Usage: python3 -I diff.py <beforeDir> <afterDir> <diffDir>"""
import os
import sys

import numpy as np
from PIL import Image

before, after, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
rows = []
for name in sorted(f for f in os.listdir(before) if f.endswith('.png')):
    if not os.path.exists(os.path.join(after, name)):
        rows.append((name, None, 'missing after'))
        continue
    a = np.asarray(Image.open(os.path.join(before, name)).convert('RGB')).astype(np.int16)
    b = np.asarray(Image.open(os.path.join(after, name)).convert('RGB')).astype(np.int16)
    h, w = max(a.shape[0], b.shape[0]), max(a.shape[1], b.shape[1])
    pa = np.zeros((h, w, 3), np.int16) - 1
    pb = np.zeros((h, w, 3), np.int16) - 2
    pa[: a.shape[0], : a.shape[1]] = a
    pb[: b.shape[0], : b.shape[1]] = b
    changed = np.any(pa != pb, axis=2)
    pct = 100.0 * changed.sum() / changed.size
    # A palette image: the after shot as 16 light greys (index 0 to 15), changed pixels as index 16 (red). Small on disk,
    # and every changed pixel is still marked at full resolution.
    idx = (np.clip(pb, 0, 255).mean(axis=2) / 16).astype(np.uint8)
    idx[changed] = 16
    img = Image.fromarray(idx, 'P')
    img.putpalette([v for i in range(16) for v in [165 + i * 5] * 3] + [220, 0, 0])
    img.save(os.path.join(out, name.replace('.png', '-diff.png')), optimize=True)
    note = '' if a.shape == b.shape else f'size {a.shape[1]}x{a.shape[0]} to {b.shape[1]}x{b.shape[0]}'
    rows.append((name, pct, note))
print('| shot | pixels changed | note |')
print('|---|---|---|')
for name, pct, note in rows:
    print(f"| {name[:-4]} | {'n/a' if pct is None else f'{pct:.4f}%'} | {note} |")
