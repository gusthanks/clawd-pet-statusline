"""O Clawd com o laptop: gera clawd/hooks/laptop.ts.

Desenho próprio deste projeto: o Clawd de frente, com o laptop visto por trás na frente da
barriga (como os mini-Clawds). Cada quadro é uma lista de retângulos (x, y, largura, altura, cor)
numa grade de 34 x 23 células. Mude o desenho aqui e rode:

    python tools/laptop.py            # grava clawd/hooks/laptop.ts
    python tools/laptop.py --preview  # e também tools/laptop-preview.png (precisa do Pillow)
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

O = "#d87656"
E = "#000000"
LID = "#8b8b8b"
EDGE = "#6e6e6e"
LOGO = "#d9d9d9"

HEAD = [(14, 7, 16, 4, O)]
BELLY = [(14, 15, 16, 4, O)]
LEGS = [(x, 19, 2, 4, O) for x in (14, 18, 24, 28)]


def eyes(row=9, h=2):
    return [(16, row, 2, h, E), (26, row, 2, h, E)]


def arms(left=0, right=0):
    # braço esquerdo (10-13) e direito (30-33), e o tronco entre eles; dy sobe o braço
    return [(14, 11, 16, 4, O), (10, 11 - left, 4, 4, O), (30, 11 - right, 4, 4, O)]


def lid(h, bottom=21):
    """A tampa vista por trás, com h linhas de altura, apoiada em `bottom`."""
    if h <= 0:
        return []
    top = bottom - h
    r = [(12, top, 20, h, LID), (12, top, 20, 1, EDGE)]
    if h >= 6:
        r.append((21, top + h // 2 - 1, 2, 2, LOGO))  # o "logo" no meio da tampa
    return r


def slab(y):
    """O laptop fechado, deitado, visto de frente (uma fatia fina)."""
    return [(12, y, 20, 2, LID), (12, y + 1, 20, 1, EDGE)]



def frame(*parts):
    out = []
    for p in parts:
        out += p
    return out


stand = frame(LEGS, BELLY, arms(), HEAD, eyes())
# pega o laptop: ele aparece fechado nas mãos, sobe até a barriga, a tampa abre
grab1 = frame(LEGS, BELLY, arms(-1, -1), HEAD, eyes(10, 1), slab(19))
grab2 = frame(LEGS, BELLY, arms(0, 0), HEAD, eyes(10, 1), slab(17))
open1 = frame(LEGS, BELLY, arms(0, 0), HEAD, eyes(), lid(3, 19))
open2 = frame(LEGS, BELLY, arms(0, 0), HEAD, eyes(), lid(5, 20))
open3 = frame(LEGS, BELLY, arms(0, 0), HEAD, eyes(), lid(7, 21))
open4 = frame(LEGS, BELLY, arms(0, 0), HEAD, eyes(), lid(8, 21))
# digitando: os braços batucam alternados, os olhos olham pra tela
typeA = frame(LEGS, BELLY, arms(1, 0), HEAD, eyes(10, 1), lid(8, 21))
typeB = frame(LEGS, BELLY, arms(0, 0), HEAD, eyes(10, 1), lid(8, 21))
typeC = frame(LEGS, BELLY, arms(0, 1), HEAD, eyes(10, 1), lid(8, 21))

FRAMES = [stand, grab1, grab2, open1, open2, open3, open4, typeA, typeB, typeC]
NAMES = ["stand", "grab1", "grab2", "open1", "open2", "open3", "open4", "typeA", "typeB", "typeC"]
# 17 quadros de entrada, 3 de digitar (17-19), 13 repetições do laço (20-32), 10 de saída (33-42)
SEQ = (
    [0, 0, 0, 0, 1, 1, 2, 2, 3, 4, 5, 6, 6, 6, 7, 8, 9]
    + [7, 8, 9]
    + [7, 8, 9] * 4 + [7]
    + [6, 5, 4, 3, 2, 2, 1, 1, 0, 0]
)
assert len(SEQ) == 43, len(SEQ)


def fmt(v):
    return str(int(v)) if float(v).is_integer() else str(v)


def write():
    colors = [O, E, LID, EDGE, LOGO]  # a ordem é a ordem de pintura: a tampa por cima do corpo
    frames = [["".join(f"M{fmt(x)} {fmt(y)}h{fmt(w)}v{fmt(h)}h-{fmt(w)}z" for x, y, w, h, col in f if col == c) for c in colors] for f in FRAMES]
    lines = [
        "// O Clawd com o laptop, desenhado para este projeto: o Clawd de frente, com o laptop visto",
        "// por trás na frente da barriga. Grade de 34 x 23 células (1 célula = meio pixel do Clawd).",
        "// Gerado por tools/laptop.py: não edite à mão, mude o desenho lá e gere de novo.",
        "",
        f"export const LAPTOP_COLORS = {json.dumps(colors)} as const",
        "export const LAPTOP_FPS = 12",
        "",
        "// Um item por quadro; dentro dele, um caminho por cor (vazio quando a cor não aparece).",
        "// Quadros: " + ", ".join(f"{i} {n}" for i, n in enumerate(NAMES)),
        "export const LAPTOP_FRAMES: readonly (readonly string[])[] = [",
        *[f"  {json.dumps(f)}," for f in frames],
        "]",
        "",
        "// 43 passos a 12 por segundo: entrada 0-16 (pega e abre), digitando 17-19 (o laço),",
        "// mais voltas 20-32, saída 33-42 (fecha e guarda).",
        f"export const LAPTOP_SEQ: readonly number[] = {json.dumps(SEQ)}",
        "",
    ]
    path = os.path.join(ROOT, "clawd", "hooks", "laptop.ts")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))
    print("gravado:", path)


if __name__ == "__main__":
    write()
    if "--preview" in sys.argv:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from pix import sheet
        sheet(FRAMES, os.path.join(ROOT, "tools", "laptop-preview.png"), S=8, labels=NAMES)
        print("prévia: tools/laptop-preview.png")
