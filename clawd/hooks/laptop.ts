// O Clawd com o laptop, desenhado para este projeto: o Clawd de frente, com o laptop visto
// por trás na frente da barriga. Grade de 34 x 23 células (1 célula = meio pixel do Clawd).
// Gerado por tools/laptop.py: não edite à mão, mude o desenho lá e gere de novo.

export const LAPTOP_COLORS = ["#d87656", "#000000", "#8b8b8b", "#6e6e6e", "#d9d9d9"] as const
export const LAPTOP_FPS = 12

// Um item por quadro; dentro dele, um caminho por cor (vazio quando a cor não aparece).
// Quadros: 0 stand, 1 grab1, 2 grab2, 3 open1, 4 open2, 5 open3, 6 open4, 7 typeA, 8 typeB, 9 typeC
export const LAPTOP_FRAMES: readonly (readonly string[])[] = [
  ["M14 19h2v4h-2zM18 19h2v4h-2zM24 19h2v4h-2zM28 19h2v4h-2zM14 15h16v4h-16zM14 11h16v4h-16zM10 11h4v4h-4zM30 11h4v4h-4zM14 7h16v4h-16z", "M16 9h2v2h-2zM26 9h2v2h-2z", "", "", ""],
  ["M14 19h2v4h-2zM18 19h2v4h-2zM24 19h2v4h-2zM28 19h2v4h-2zM14 15h16v4h-16zM14 11h16v4h-16zM10 12h4v4h-4zM30 12h4v4h-4zM14 7h16v4h-16z", "M16 10h2v1h-2zM26 10h2v1h-2z", "M12 19h20v2h-20z", "M12 20h20v1h-20z", ""],
  ["M14 19h2v4h-2zM18 19h2v4h-2zM24 19h2v4h-2zM28 19h2v4h-2zM14 15h16v4h-16zM14 11h16v4h-16zM10 11h4v4h-4zM30 11h4v4h-4zM14 7h16v4h-16z", "M16 10h2v1h-2zM26 10h2v1h-2z", "M12 17h20v2h-20z", "M12 18h20v1h-20z", ""],
  ["M14 19h2v4h-2zM18 19h2v4h-2zM24 19h2v4h-2zM28 19h2v4h-2zM14 15h16v4h-16zM14 11h16v4h-16zM10 11h4v4h-4zM30 11h4v4h-4zM14 7h16v4h-16z", "M16 9h2v2h-2zM26 9h2v2h-2z", "M12 16h20v3h-20z", "M12 16h20v1h-20z", ""],
  ["M14 19h2v4h-2zM18 19h2v4h-2zM24 19h2v4h-2zM28 19h2v4h-2zM14 15h16v4h-16zM14 11h16v4h-16zM10 11h4v4h-4zM30 11h4v4h-4zM14 7h16v4h-16z", "M16 9h2v2h-2zM26 9h2v2h-2z", "M12 15h20v5h-20z", "M12 15h20v1h-20z", ""],
  ["M14 19h2v4h-2zM18 19h2v4h-2zM24 19h2v4h-2zM28 19h2v4h-2zM14 15h16v4h-16zM14 11h16v4h-16zM10 11h4v4h-4zM30 11h4v4h-4zM14 7h16v4h-16z", "M16 9h2v2h-2zM26 9h2v2h-2z", "M12 14h20v7h-20z", "M12 14h20v1h-20z", "M21 16h2v2h-2z"],
  ["M14 19h2v4h-2zM18 19h2v4h-2zM24 19h2v4h-2zM28 19h2v4h-2zM14 15h16v4h-16zM14 11h16v4h-16zM10 11h4v4h-4zM30 11h4v4h-4zM14 7h16v4h-16z", "M16 9h2v2h-2zM26 9h2v2h-2z", "M12 13h20v8h-20z", "M12 13h20v1h-20z", "M21 16h2v2h-2z"],
  ["M14 19h2v4h-2zM18 19h2v4h-2zM24 19h2v4h-2zM28 19h2v4h-2zM14 15h16v4h-16zM14 11h16v4h-16zM10 10h4v4h-4zM30 11h4v4h-4zM14 7h16v4h-16z", "M16 10h2v1h-2zM26 10h2v1h-2z", "M12 13h20v8h-20z", "M12 13h20v1h-20z", "M21 16h2v2h-2z"],
  ["M14 19h2v4h-2zM18 19h2v4h-2zM24 19h2v4h-2zM28 19h2v4h-2zM14 15h16v4h-16zM14 11h16v4h-16zM10 11h4v4h-4zM30 11h4v4h-4zM14 7h16v4h-16z", "M16 10h2v1h-2zM26 10h2v1h-2z", "M12 13h20v8h-20z", "M12 13h20v1h-20z", "M21 16h2v2h-2z"],
  ["M14 19h2v4h-2zM18 19h2v4h-2zM24 19h2v4h-2zM28 19h2v4h-2zM14 15h16v4h-16zM14 11h16v4h-16zM10 11h4v4h-4zM30 10h4v4h-4zM14 7h16v4h-16z", "M16 10h2v1h-2zM26 10h2v1h-2z", "M12 13h20v8h-20z", "M12 13h20v1h-20z", "M21 16h2v2h-2z"],
]

// 43 passos a 12 por segundo: entrada 0-16 (pega e abre), digitando 17-19 (o laço),
// mais voltas 20-32, saída 33-42 (fecha e guarda).
export const LAPTOP_SEQ: readonly number[] = [0, 0, 0, 0, 1, 1, 2, 2, 3, 4, 5, 6, 6, 6, 7, 8, 9, 7, 8, 9, 7, 8, 9, 7, 8, 9, 7, 8, 9, 7, 8, 9, 7, 6, 5, 4, 3, 2, 2, 1, 1, 0, 0]
