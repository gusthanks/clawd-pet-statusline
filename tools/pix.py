"""Desenha quadros de pixel (listas de retângulos) num PNG, para conferir a arte sem navegador."""
import re
from PIL import Image, ImageDraw

RECT = re.compile(r"M(-?[\d.]+) (-?[\d.]+)h(-?[\d.]+)v(-?[\d.]+)h-?[\d.]+z")


def rects_of_path(d):
    return [(float(a), float(b), float(c), float(e)) for a, b, c, e in RECT.findall(d)]


def sheet(frames, path, W=34, H=23, S=10, cols=5, labels=None, bg=(43, 43, 43)):
    """frames: lista de listas de (x, y, w, h, '#cor')."""
    rows = (len(frames) + cols - 1) // cols
    pad = 16
    img = Image.new("RGB", (cols * (W * S + pad) + pad, rows * (H * S + pad + 12) + pad), bg)
    dr = ImageDraw.Draw(img)
    for i, fr in enumerate(frames):
        ox = pad + (i % cols) * (W * S + pad)
        oy = pad + 12 + (i // cols) * (H * S + pad + 12)
        dr.rectangle([ox, oy, ox + W * S - 1, oy + H * S - 1], fill=(30, 30, 30))
        for gx in range(0, W + 1, 2):
            dr.line([ox + gx * S, oy, ox + gx * S, oy + H * S], fill=(50, 50, 50))
        for x, y, w, h, c in fr:
            dr.rectangle([ox + x * S, oy + y * S, ox + (x + w) * S - 1, oy + (y + h) * S - 1], fill=c)
        dr.text((ox, oy - 12), labels[i] if labels else f"#{i}", fill=(200, 200, 200))
    img.save(path)
