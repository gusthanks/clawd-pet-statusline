// As fantasias dos ajudantes (mini-Clawds da baia) e quem veste qual (costumeFor). Conta pura,
// sem `$`. Importa só art.ts; equipe.ts desenha o mini com a fantasia por cima.
//
// Coordenadas em células da baia (1 célula = 2,25 px na tela). L = coluna esquerda do mini.
//
// O mini sem fantasia (equipe.ts, mini()):
//   cabeça   rect(L+2, 15, 8, 2)  -> linhas 15-16; olhos em (L+3,16) e (L+8,16)
//   braços   rect(L, 17, 12, 2)   -> linhas 17-18, digitando (sobe 0,6 a cada 0,32 s)
//   barriga/pernas linhas 19-22, escondidas atrás do laptop rect(L+1, 19, 10, 4)
// Com `raise`, a garra direita sobe AO LADO da cabeça: rect(L+10, 15, 2, 2), e os braços
// que digitam encolhem para rect(L, 17, 10, 2).
//
// LIMITES (contando o ponto mais longe de cada animação): x de L até L+13, nada acima da
// linha 9. Animação: só <animate>/<animateTransform> com calcMode="discrete", begin="${b}s"
// e repeatCount indefinite (LOOP); nada de %, rotate, visibility ou CSS.
// Chovendo, o chapéu (hat) some e o guarda-chuva pequeno cobre a cabeça; o objeto (prop) e
// o rosto (face) continuam, desenhados por cima do guarda-chuva.
import { INK, LOOP, rect } from './art'
import type { Costume } from '../types'

// O tipo mora no contrato (types/index.d.ts), porque vai guardado nos atoms 'team' e 'crew'.
export type { Costume }

export type CostumeArt = {
  // chapéu, capacete ou touca; tone (0, 1 ou 2) varia o tom pelo número do agente
  hat: (L: number, tone: number) => string
  // o objeto na garra (ou ao lado); b = começo das animações em segundos (<= 0)
  prop?: (L: number, b: number, tone: number) => string
  // por cima do rosto (ex.: tapa-olho)
  face?: (L: number) => string
  // true: a garra direita sobe ao lado da cabeça segurando o objeto
  raise?: boolean
}

const anim = (attr: string, values: string, dur: number, begin: number) =>
  `<animate attributeName="${attr}" values="${values}" dur="${dur}s" begin="${begin}s" calcMode="discrete" ${LOOP}/>`
const move = (values: string, dur: number, begin: number) =>
  `<animateTransform attributeName="transform" type="translate" values="${values}" dur="${dur}s" begin="${begin}s" calcMode="discrete" ${LOOP}/>`

// várias células 1x1 soltas num <path> só (bem mais curto que um <rect> por célula)
type Pt = [number, number]
const cellsD = (pts: Pt[]) => pts.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('')
const dots = (pts: Pt[], fill: string, inner = '') => `<path fill="${fill}" d="${cellsD(pts)}">${inner}</path>`
// pontos relativos a L
const at = (L: number, pts: Pt[]): Pt[] => pts.map(([x, y]) => [L + x, y])
// a cor do tom (0, 1 ou 2): um tom fora disso volta ao primeiro
const tint = (tones: readonly [string, string, string], tone: number) => tones[tone] ?? tones[0]

const W = '#eeeae0' // o "branco" da casa: creme, nunca branco puro
const GREY = '#8e929a'
const GOLD = '#f5c542'
const WOOD = '#8b5a2b'

// piloto: capacete vermelho (framboesa no tom 2), faixa creme (amarela no tom 1), viseira escura
const PIL_RED = ['#e5484d', '#e5484d', '#d33a62'] as const
const PIL_STRIPE = [W, GOLD, W] as const
const PIL_VISOR = '#27324a'
const PIL_SHINE = '#9fd3f5'
// pirata: tricórnio carvão / marrom / azul-marinho, galão dourado, espada de aço
const PIR_HAT = ['#43434f', '#4a3830', '#34425e'] as const
const PIR_STEEL = '#949ba8'
const PIR_GRIP = '#6b4423'
// detetive: boné xadrez por tom [base, claro], pala; lupa de latão
const DET_TWEED = ['#9c6b3c', '#8f7a48', '#a35f3d'] as const
const DET_CHECK = ['#b9864f', '#ad9660', '#bf7a52'] as const
const DET_BILL = '#6e4322'
const DET_BRASS = '#b8860b'
const DET_LENS = '#8fd0ff'
// astronauta: casco da bolha (luz e sombra), vidro, luz da antena por tom, estrela
const AST_HI = '#c6cdd9'
const AST_LO = '#7a8396'
const AST_GLASS = '#5ab4f5'
const AST_BEACON = ['#e5484d', '#3ecf8e', '#a78bfa'] as const
const AST_STAR = '#eaa400'
const AST_GLOW = '#fbe08a'
// engenheiro: capacete de obra (tom 1 mais claro, tom 2 mais fundo), aba escura, nervura clara
const ENG_HAT = ['#f5c21b', '#f8d34a', '#eeb10f'] as const
const ENG_BRIM = '#c48a0a'
const ENG_RIB = '#fff0a6'
// pintor: boina caída para a esquerda (aba de baixo mais escura) e rolo turquesa com armação
const PIN_BERET = ['#3b5bdb', '#4466e6', '#3352cc'] as const
const PIN_BERET_DK = '#2a43a8'
const PIN_ROLL = '#2bb3a3'
const PIN_ROLL_DK = '#1d8579'
const PIN_ROLL_HI = '#6fdccd'
// chef: touca creme com sombra e contorno (some menos no tema claro); frigideira e ovo
const CHEF_SH = '#d2d1c8'
const CHEF_EDGE = '#b9b4a6'
const CHEF_PAN = '#7a7f88' // cinza médio: o #5b5f66 sumia no fundo escuro
const CHEF_YOLK = '#f5b731'
// 9 passos de 0,2 s: a frigideira desce 1 no passo 2; o ovo desce junto e sobe até -3
const CHEF_TOSS = '0 0;0 0;0 1;0 0;0 0;0 0;0 0;0 0;0 0'
const CHEF_EGG = '0 0;0 0;0 1;0 -1;0 -2;0 -3;0 -3;0 -2;0 -1'
// juiz: barrete violeta (o tom muda o corpo), topo lilás, pompom dourado; martelo de madeira
const JUIZ_BODY = ['#7c3aed', '#8b5cf6', '#6d28d9'] as const
const JUIZ_TOP = '#a78bfa'
const JUIZ_HEAD = '#b07a45'
const JUIZ_END = '#7a4f2a'

export const COSTUMES: Record<Exclude<Costume, ''>, CostumeArt> = {
  piloto: {
    // capacete de corrida: cúpula com faixa no meio, viseira escura com brilho azul e o protetor
    // da face esquerda descendo até o queixo
    hat: (L, tone) => {
      const red = tint(PIL_RED, tone)
      return (
        rect(L + 4, 11, 4, 1, red) + rect(L + 3, 12, 6, 1, red) + rect(L + 2, 13, 8, 1, red) + rect(L + 1, 14, 1, 3, red) + rect(L + 10, 14, 1, 1, red) +
        rect(L + 5, 11, 2, 3, tint(PIL_STRIPE, tone)) + rect(L + 2, 14, 8, 1, PIL_VISOR) + rect(L + 3, 14, 1, 1, PIL_SHINE)
      )
    },
    // a bandeira quadriculada 4x3 no mastro erguido; fundo e casas trocam de cor juntos a cada
    // 0,6 s (a bandeira tremula sem sair do lugar)
    prop: (L, b) =>
      rect(L + 11, 9, 1, 6, GREY) +
      rect(L + 7, 9, 4, 3, W, anim('fill', `${W};${INK}`, 1.2, b)) +
      dots(at(L, [[7, 9], [9, 9], [8, 10], [10, 10], [7, 11], [9, 11]]), INK, anim('fill', `${INK};${W}`, 1.2, b)),
    raise: true,
  },
  pirata: {
    // tricórnio: o galão dourado desce em V das duas pontas até a frente, caveira creme no centro
    hat: (L, tone) => {
      const c = tint(PIR_HAT, tone)
      return (
        rect(L + 3, 11, 6, 1, c) + rect(L + 1, 12, 10, 3, c) + rect(L + 5, 12, 2, 1, W) +
        dots(at(L, [[1, 11], [10, 11], [2, 12], [9, 12], [3, 13], [8, 13], [4, 14], [5, 14], [6, 14], [7, 14]]), GOLD)
      )
    },
    // tapa-olho 2x2 no olho direito (o esquerdo continua à mostra)
    face: L => rect(L + 7, 15, 2, 2, INK),
    // a espada erguida: lâmina de aço, guarda dourada e o cabo na garra; a cada 1,6 s ela dá
    // uma estocada de 1 célula para cima (0,4 s) e volta, sem largar a garra
    prop: (L, b) =>
      `<g>${rect(L + 11, 10, 1, 4, PIR_STEEL)}${rect(L + 10, 14, 3, 1, GOLD)}${rect(L + 11, 15, 1, 1, PIR_GRIP)}${move('0 0;0 0;0 -1;0 0', 1.6, b)}</g>`,
    raise: true,
  },
  detetive: {
    // boné de caçador (deerstalker): copa, abas descendo nas orelhas, pala curta no meio e uma
    // faixa de xadrez (uma faixa só, como o destaque dos outros chapéus; o xadrez inteiro virava ruído)
    hat: (L, tone) => {
      const c = tint(DET_TWEED, tone)
      return (
        rect(L + 3, 12, 6, 1, c) + rect(L + 2, 13, 8, 2, c) + rect(L + 2, 15, 1, 2, c) + rect(L + 9, 15, 1, 2, c) +
        dots(at(L, [[3, 13], [5, 13], [7, 13], [9, 13]]), tint(DET_CHECK, tone)) + rect(L + 4, 14, 4, 1, DET_BILL)
      )
    },
    // lupa redonda de latão, lente azul com brilho, cabo na garra; varre num quadradinho (procurando)
    prop: (L, b) =>
      `<g>${rect(L + 10, 9, 2, 1, DET_BRASS)}${rect(L + 10, 12, 2, 1, DET_BRASS)}${rect(L + 9, 10, 1, 2, DET_BRASS)}${rect(L + 12, 10, 1, 2, DET_BRASS)}` +
      `${rect(L + 10, 10, 2, 2, DET_LENS)}${rect(L + 10, 10, 1, 1, W)}${rect(L + 11, 13, 1, 2, WOOD)}${move('0 0;1 0;1 1;0 1', 1.6, b)}</g>`,
    raise: true,
  },
  astronauta: {
    // bolha de vidro: casco claro em cima/esquerda, escuro na sombra (aparece nos dois temas), vidro
    // azul só acima da cabeça (o rosto fica laranja), brilho, antena com luz da cor do tom
    hat: (L, tone) =>
      `<rect x="${L + 2}" y="12" width="8" height="3" fill="${AST_GLASS}" fill-opacity="0.5"/>` +
      rect(L + 4, 11, 4, 1, AST_HI) + rect(L + 2, 12, 2, 1, AST_HI) + rect(L + 1, 13, 1, 4, AST_HI) +
      rect(L + 8, 12, 2, 1, AST_LO) + rect(L + 10, 13, 1, 4, AST_LO) +
      dots(at(L, [[4, 12], [3, 13]]), W) + rect(L + 7, 10, 1, 1, AST_LO) + rect(L + 7, 9, 1, 1, tint(AST_BEACON, tone)),
    // estrela de cinco pontas flutuando ao lado, miolo aceso; cintila: some as pontas e fica só o brilho
    prop: (L, b) =>
      dots(at(L, [[11, 9], [9, 10], [10, 10], [12, 10], [13, 10], [10, 11], [12, 11], [10, 12], [12, 12]]), AST_STAR, anim('opacity', '1;1;0', 2.4, b)) +
      dots(at(L, [[11, 10], [11, 11]]), AST_GLOW),
  },
  engenheiro: {
    // capacete de obra: cúpula alta com nervura clara, aba escura
    hat: (L, tone) => {
      const c = tint(ENG_HAT, tone)
      return rect(L + 4, 11, 4, 1, c) + rect(L + 3, 12, 6, 1, c) + rect(L + 2, 13, 8, 1, c) + rect(L + 1, 14, 10, 1, ENG_BRIM) + rect(L + 5, 11, 2, 3, ENG_RIB)
    },
    // chave inglesa: mandíbula fixa alta à esquerda, móvel baixa à direita; descansa 1 s e
    // recua 1 célula (aperta o parafuso)
    prop: (L, b) =>
      `<g>${rect(L + 10, 9, 1, 3, GREY)}${rect(L + 11, 11, 3, 1, GREY)}${rect(L + 13, 10, 1, 1, GREY)}${rect(L + 11, 12, 2, 1, GREY)}${rect(L + 11, 13, 1, 2, GREY)}` +
      `${move('0 0;0 0;-1 0', 1.5, b)}</g>`,
    raise: true,
  },
  pintor: {
    // boina larga e achatada, caída para a esquerda, com o pito no alto; a aba caída para em L+1
    // (em L+0 ela encostava no objeto do vizinho, que vai até a coluna L+13 dele)
    hat: (L, tone) => {
      const c = tint(PIN_BERET, tone)
      return rect(L + 7, 11, 1, 1, PIN_BERET_DK) + rect(L + 4, 12, 6, 1, c) + rect(L + 1, 13, 9, 1, c) + rect(L + 1, 14, 3, 1, PIN_BERET_DK) + rect(L + 4, 14, 6, 1, c)
    },
    // rolo com a armação saindo da ponta direita até o cabo na garra; a gota se forma, espera e cai
    prop: (L, b) =>
      rect(L + 9, 10, 4, 1, PIN_ROLL) + rect(L + 9, 11, 4, 1, PIN_ROLL_DK) + rect(L + 9, 10, 1, 1, PIN_ROLL_HI) +
      rect(L + 13, 10, 1, 3, GREY) + rect(L + 11, 13, 3, 1, GREY) + rect(L + 11, 14, 1, 1, GREY) +
      `<g>${rect(L + 10, 12, 1, 1, PIN_ROLL)}${move('0 0;0 0;0 1;0 2', 1.6, b)}</g>`,
    raise: true,
  },
  chef: {
    // toque: copa arredondada (L+2..L+8) com contorno à direita e embaixo, cinta estreita
    // (L+3..L+7); o tom muda o topo (duas bolhas, cúpula, ou mais alto)
    hat: (L, tone) =>
      rect(L + 3, tone === 2 ? 9 : 10, 5, tone === 2 ? 2 : 1, W) + rect(L + 2, 11, 7, 2, W) + rect(L + 3, 13, 5, 2, W) + rect(L + 3, 14, 5, 1, CHEF_SH) +
      rect(L + 8, 11, 1, 2, CHEF_EDGE) + rect(L + 2, 12, 1, 1, CHEF_EDGE) + rect(L + 7, 13, 1, 1, CHEF_SH) + (tone ? '' : rect(L + 5, 10, 1, 1, CHEF_SH)),
    // frigideira (L+9..L+13): dá um tranco para baixo e joga o ovo, que sobe 3 linhas e volta
    prop: (L, b) =>
      `<g>${rect(L + 9, 13, 1, 2, CHEF_PAN)}${rect(L + 13, 13, 1, 2, CHEF_PAN)}${rect(L + 10, 14, 3, 1, CHEF_PAN)}${move(CHEF_TOSS, 1.8, b)}</g>` +
      `<g>${rect(L + 10, 13, 3, 1, W)}${rect(L + 11, 12, 1, 1, CHEF_YOLK)}${move(CHEF_EGG, 1.8, b)}</g>`,
    raise: true,
  },
  juiz: {
    // barrete violeta com topo lilás e pompom dourado
    hat: (L, tone) => rect(L + 2, 13, 8, 2, tint(JUIZ_BODY, tone)) + rect(L + 3, 12, 6, 1, JUIZ_TOP) + rect(L + 5, 11, 2, 1, GOLD),
    // martelo: cabo na garra, cabeça de madeira com as pontas escuras; bate duas vezes e descansa
    prop: (L, b) =>
      `<g>${rect(L + 11, 12, 1, 4, WOOD)}${rect(L + 9, 10, 5, 2, JUIZ_HEAD)}${rect(L + 9, 10, 1, 2, JUIZ_END)}${rect(L + 13, 10, 1, 2, JUIZ_END)}` +
      `${move('0 0;0 -1;0 0;0 -1;0 0;0 0;0 0;0 0', 2.4, b)}</g>`,
    raise: true,
  },
}

export const COSTUME_KINDS = Object.keys(COSTUMES) as Exclude<Costume, ''>[]

export const isCostume = (v: unknown): v is Costume => v === '' || (typeof v === 'string' && v in COSTUMES)

// ---------- quem veste qual: pela tarefa ----------

// As palavras de cada fantasia, na ordem em que são testadas: o pirata vem ANTES do piloto
// ("cético: verificação" é pirata) e o engenheiro antes do pintor ("corrigir cores" é obra, não
// pintura). Cada palavra casa no começo de uma palavra do texto ("verific" pega "verificar" e
// "verificação"); as de WHOLE só casam inteiras (com um "s" de plural): "cor" nunca pega "corrigir".
const WORDS: [Exclude<Costume, ''>, string[]][] = [
  ['pirata', ['cetic', 'refut', 'derrub', 'atac', 'critic', 'critiq', 'contest', 'quebr', 'advers']],
  ['juiz', ['julg', 'decid', 'avali', 'escolh', 'vot', 'rank', 'veredit', 'judge', 'prioriz', 'parecer']],
  ['piloto', ['verific', 'confer', 'confirm', 'revis', 'review', 'verify', 'check', 'test', 'pytest', 'valid', 'audit', 'sweep', 'compara', 'compare']],
  ['detetive', ['investig', 'pesquis', 'research', 'mapear', 'mapa', 'scan', 'levant', 'explor', 'busc', 'procur', 'diagnos', 'sond', 'find', 'search', 'medir', 'varr', 'inventari', 'forens']],
  ['astronauta', ['plan', 'spec', 'especific', 'roadmap', 'estim', 'arquitet', 'estrateg']],
  ['engenheiro', ['implement', 'corrig', 'correc', 'consert', 'fix', 'constru', 'build', 'reescrev', 'refator', 'migr', 'instal', 'aplic', 'divid', 'encan', 'rota']],
  ['pintor', ['desenh', 'design', 'visual', 'imagem', 'svg', 'layout', 'icone', 'arte', 'ilustr', 'tema', 'cor', 'css', 'ui', 'harmoniz']],
  ['chef', ['redig', 'escrev', 'write', 'redator', 'copywrit', 'docs', 'documenta', 'readme', 'resum', 'juntar', 'consolid', 'relatorio', 'conteudo', 'checklist', 'fechar', 'prepar', 'sintet', 'sintes', 'synth', 'compil']],
]

// Curtas ou ambíguas: só inteiras. "arte" não pega "artefato", "tema" não pega "temático",
// "rota" não pega "rotação", "mapa" não pega "mapamundi", "spec" não pega "special", "check" não
// pega "checklist" nem "checkout". "compara"/"compare" (e não "compar") não pegam "compartilhar";
// "documenta" não pega o substantivo "documento" (o assunto, não a tarefa).
const WHOLE = new Set(['ui', 'cor', 'css', 'svg', 'arte', 'tema', 'rota', 'mapa', 'spec', 'check'])

const PATTERNS: [Exclude<Costume, ''>, RegExp][] = WORDS.map(([costume, words]) => [
  costume,
  new RegExp(words.map(w => (WHOLE.has(w) ? `\\b${w}s?\\b` : `\\b${w}`)).join('|')),
])

// minúsculas, sem acento, e tudo o que não é letra ou número vira espaço ("_" e "-" separam palavras)
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// A primeira fantasia cujas palavras aparecem no texto (já normalizado), ou ''.
function match(text: string): Costume {
  if (!text) return ''
  for (const [costume, re] of PATTERNS) if (re.test(text)) return costume
  return ''
}

// O tipo do agente, quando ele diz a tarefa sozinho.
const BY_TYPE: Record<string, Exclude<Costume, ''>> = { explore: 'detetive', plan: 'astronauta' }

// A primeira ferramenta: ler e pesquisar é coisa de detetive; editar e escrever, de engenheiro.
const BY_TOOL: Record<string, Exclude<Costume, ''>> = {
  Read: 'detetive',
  Grep: 'detetive',
  Glob: 'detetive',
  WebSearch: 'detetive',
  WebFetch: 'detetive',
  Edit: 'engenheiro',
  Write: 'engenheiro',
  NotebookEdit: 'engenheiro',
}

export type CostumeHints = { label?: string; type?: string; firstTool?: string }

// A fantasia pela tarefa, nesta ordem: o verbo do rótulo (o que vem antes do ':' em "verificar:
// limites"; sem ':', a primeira palavra, como em "Fix the header"); o tipo Explore ou Plan (que
// dizem a tarefa melhor que um substantivo solto do rótulo: "Forense de instalação" [Explore] só
// lê); o rótulo inteiro; o nome do tipo dizendo (como "code-reviewer"); a primeira ferramenta.
// Nada casou: '' (o mini de sempre, sem fantasia).
export function costumeFor({ label, type, firstTool }: CostumeHints): Costume {
  const text = normalize(label ?? '')
  const colon = (label ?? '').indexOf(':')
  const verb = colon >= 0 ? normalize((label ?? '').slice(0, colon)) : (text.split(' ')[0] ?? '')
  const kind = normalize(type ?? '')
  return match(verb) || BY_TYPE[kind] || match(text) || match(kind) || (firstTool ? BY_TOOL[firstTool] ?? '' : '')
}

// A fantasia ao longo da vida do ajudante: uma fantasia decidida nunca troca por outra. Só o ''
// (nada casou ainda) é refeito, com as pistas que foram chegando (o rótulo, a 1ª ferramenta);
// como cada pista chega uma vez só, o '' vira fantasia no máximo uma vez.
export const settleCostume = (prev: Costume | undefined, hints: CostumeHints): Costume => (prev ? prev : costumeFor(hints))
