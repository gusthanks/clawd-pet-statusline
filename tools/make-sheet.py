"""Gera docs/sheet/*.svg: uma animação por situação do Clawd, tirada do código de verdade.

Uso:  python tools/make-sheet.py [pasta-do-mod]
(por padrão a pasta clawd/ deste repositório). Precisa do Claude Code (`claude plugin test`).
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(ROOT, "clawd")
OUT = os.path.join(ROOT, "docs", "sheet")
W, H = 561, 62  # a pista sem statusline: 66 colunas de ~8,5 px, e a altura mínima da faixa
CLAUDE = "claude.cmd" if os.name == "nt" else "claude"

tmp = tempfile.mkdtemp(prefix="clawd-sheet-")
plugin = os.path.join(tmp, "clawd")
shutil.copytree(SRC, plugin, ignore=shutil.ignore_patterns("*.test.tsx"))
shutil.copy(os.path.join(ROOT, "tools", "sheet.test.tsx"), os.path.join(plugin, "hooks", "sheet.test.tsx"))

res = subprocess.run([CLAUDE, "plugin", "test", "./clawd"], cwd=tmp, capture_output=True, text=True,
                     encoding="utf-8", errors="replace", timeout=1800)
log = res.stdout + res.stderr
shots = dict(re.findall(r"@@SHEET ([\w-]+)@@(.*?)@@END@@", log, re.S))
fails = re.findall(r"^\(fail\) .*$", log, re.M)

os.makedirs(OUT, exist_ok=True)
for name, inner in shots.items():
    if name.startswith("_"):
        continue
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
        f'<rect width="{W}" height="{H}" rx="10" fill="#262624"/>{inner}</svg>'
    )
    with open(os.path.join(OUT, f"{name}.svg"), "w", encoding="utf-8", newline="\n") as f:
        f.write(svg)
    print(f"{name}.svg  {len(svg) // 1024} KB")

print(f"{len([n for n in shots if not n.startswith('_')])} animações em {OUT}")
for line in fails:
    print("FALHOU:", line)
if not shots:
    print(log[-3000:])
print("pasta temporária (pode apagar depois):", tmp)
