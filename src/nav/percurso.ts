import { distanciaMetros, type LngLat } from '../geo/distance';
import type { Rota } from '../route/model';

export type TipoManobra =
  | 'direita'
  | 'esquerda'
  | 'leve-direita'
  | 'leve-esquerda'
  | 'forte-direita'
  | 'forte-esquerda'
  | 'manter-direita'
  | 'manter-esquerda'
  | 'retorno'
  | 'rotatoria'
  | 'parada'
  | 'chegada';

export interface Manobra {
  tipo: TipoManobra;
  texto: string;
  pos: LngLat;
  /** Metros desde o começo do percurso até a manobra. */
  dist: number;
}

/** A rota inteira como uma linha só, com distância acumulada em cada ponto. */
export interface Percurso {
  coords: LngLat[];
  acumulada: number[];
  total: number;
  tempoTotal: number;
  manobras: Manobra[];
  /** Distância acumulada até cada ponto da rota (partida, paradas, destino). */
  pontos: number[];
}

/** Traduz o código e o ângulo do BRouter numa instrução; null para curvas desprezíveis. */
export function classificarManobra(
  comando: number,
  angulo: number,
  saida: number,
): { tipo: TipoManobra; texto: string } | null {
  if (comando === 13 || comando === 14 || saida > 0) {
    return { tipo: 'rotatoria', texto: saida > 0 ? `Na rotatória, pegue a ${saida}ª saída` : 'Entre na rotatória' };
  }
  const a = Math.abs(angulo);
  if (comando === 10 || comando === 11 || comando === 12 || a >= 165) {
    return { tipo: 'retorno', texto: 'Faça o retorno' };
  }
  const lado = angulo > 0 ? 'direita' : 'esquerda';
  if (comando === 8 || comando === 9) {
    if (a < 15) return null;
    const ladoManter = comando === 9 ? 'direita' : 'esquerda';
    return { tipo: `manter-${ladoManter}`, texto: `Mantenha-se à ${ladoManter}` };
  }
  if (a < 30) return null;
  if (a < 60) return { tipo: `leve-${lado}`, texto: `Vire levemente à ${lado}` };
  if (a < 135) return { tipo: lado, texto: `Vire à ${lado}` };
  return { tipo: `forte-${lado}`, texto: `Vire acentuadamente à ${lado}` };
}

/** Junta os trechos calculados. Devolve null enquanto algum trecho não estiver pronto. */
export function montarPercurso(rota: Rota): Percurso | null {
  if (rota.trechos.length === 0) return null;
  if (rota.trechos.some((t) => t.estado !== 'pronto' || !t.resultado)) return null;

  const coords: LngLat[] = [];
  const acumulada: number[] = [];
  const manobras: Manobra[] = [];
  const pontos = [0];
  let tempoTotal = 0;

  rota.trechos.forEach((t, k) => {
    const r = t.resultado!;
    const base = coords.length === 0 ? 0 : coords.length - 1;
    r.coords.forEach((c, j) => {
      if (j === 0 && coords.length > 0) return;
      const anterior = coords.at(-1);
      acumulada.push(anterior ? acumulada.at(-1)! + distanciaMetros(anterior, c) : 0);
      coords.push(c);
    });
    for (const m of r.manobras) {
      const c = classificarManobra(m.comando, m.angulo, m.saida);
      if (c) manobras.push({ ...c, pos: r.coords[m.indice], dist: acumulada[base + m.indice] });
    }
    tempoTotal += r.tempo;
    pontos.push(acumulada.at(-1)!);
    if (k < rota.trechos.length - 1) {
      manobras.push({ tipo: 'parada', texto: `Parada ${k + 1}`, pos: coords.at(-1)!, dist: acumulada.at(-1)! });
    }
  });

  const total = acumulada.at(-1) ?? 0;
  manobras.push({ tipo: 'chegada', texto: 'Destino', pos: coords.at(-1)!, dist: total });
  manobras.sort((a, b) => a.dist - b.dist);
  return { coords, acumulada, total, tempoTotal, manobras, pontos };
}

/** Rumo de a para b, em graus (0 = norte, 90 = leste). */
export function rumo(a: LngLat, b: LngLat): number {
  const rad = Math.PI / 180;
  const y = Math.sin((b[0] - a[0]) * rad) * Math.cos(b[1] * rad);
  const x =
    Math.cos(a[1] * rad) * Math.sin(b[1] * rad) -
    Math.sin(a[1] * rad) * Math.cos(b[1] * rad) * Math.cos((b[0] - a[0]) * rad);
  return ((Math.atan2(y, x) / rad) + 360) % 360;
}

export interface Projecao {
  /** Metros ao longo do percurso. */
  aoLongo: number;
  /** Metros entre a posição e a linha da rota. */
  afastamento: number;
  ponto: LngLat;
  rumo: number;
}

/**
 * Acha o lugar da rota mais perto da posição. Evita "voltar" no percurso (rotas que passam
 * duas vezes pela mesma rua) penalizando trechos já percorridos ou muito à frente.
 */
export function projetar(p: Percurso, pos: LngLat, progressoAnterior = 0): Projecao {
  const kx = 111320 * Math.cos((pos[1] * Math.PI) / 180);
  const ky = 110540;
  let melhor: Projecao & { nota: number } = {
    aoLongo: 0,
    afastamento: Infinity,
    ponto: p.coords[0],
    rumo: 0,
    nota: Infinity,
  };
  for (let i = 0; i < p.coords.length - 1; i++) {
    const a = p.coords[i];
    const b = p.coords[i + 1];
    const ax = (a[0] - pos[0]) * kx;
    const ay = (a[1] - pos[1]) * ky;
    const dx = (b[0] - a[0]) * kx;
    const dy = (b[1] - a[1]) * ky;
    const d2 = dx * dx + dy * dy;
    const t = d2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / d2)) : 0;
    const afastamento = Math.hypot(ax + t * dx, ay + t * dy);
    const aoLongo = p.acumulada[i] + t * (p.acumulada[i + 1] - p.acumulada[i]);
    let nota = afastamento;
    if (aoLongo < progressoAnterior - 30) nota += 1000;
    else if (aoLongo > progressoAnterior + 400) nota += 150;
    if (nota < melhor.nota) {
      melhor = {
        aoLongo,
        afastamento,
        ponto: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])],
        rumo: rumo(a, b),
        nota,
      };
    }
  }
  const { nota: _nota, ...projecao } = melhor;
  return projecao;
}

export interface EstadoViagem {
  progresso: number;
  restante: number;
  tempoRestante: number;
  proxima: Manobra | null;
  distProxima: number;
  /** A manobra seguinte, quando vem logo depois da próxima. */
  depois: Manobra | null;
  foraDaRota: boolean;
  chegou: boolean;
  /** Índice (em rota.pontos) do próximo ponto ainda não alcançado. */
  proximoPonto: number;
  rumo: number;
  pontoNaRota: LngLat;
}

export const LIMITE_FORA_DA_ROTA = 35;

export function acompanhar(p: Percurso, pos: LngLat, progressoAnterior = 0): EstadoViagem {
  const proj = projetar(p, pos, progressoAnterior);
  const progresso = proj.aoLongo;
  const restante = Math.max(0, p.total - progresso);
  const i = p.manobras.findIndex((m) => m.dist > progresso + 3);
  const proxima = i >= 0 ? p.manobras[i] : null;
  const distProxima = proxima ? proxima.dist - progresso : 0;
  const seguinte = i >= 0 ? p.manobras[i + 1] : undefined;
  const depois = proxima && seguinte && seguinte.dist - proxima.dist < 120 ? seguinte : null;
  let proximoPonto = p.pontos.findIndex((d) => d > progresso + 10);
  if (proximoPonto < 0) proximoPonto = p.pontos.length - 1;
  return {
    progresso,
    restante,
    tempoRestante: p.total > 0 ? (p.tempoTotal * restante) / p.total : 0,
    proxima,
    distProxima,
    depois,
    foraDaRota: proj.afastamento > LIMITE_FORA_DA_ROTA,
    chegou: restante < 25 && proj.afastamento < 40,
    proximoPonto,
    rumo: proj.rumo,
    pontoNaRota: proj.ponto,
  };
}

/** Ponto e rumo a uma distância do começo (usado na simulação). */
export function pontoNaDistancia(p: Percurso, d: number): { pos: LngLat; rumo: number } {
  const alvo = Math.min(Math.max(0, d), p.total);
  let i = p.acumulada.findIndex((a) => a >= alvo);
  if (i <= 0) i = 1;
  const a = p.coords[i - 1];
  const b = p.coords[i];
  const trecho = p.acumulada[i] - p.acumulada[i - 1];
  const t = trecho > 0 ? (alvo - p.acumulada[i - 1]) / trecho : 0;
  return { pos: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], rumo: rumo(a, b) };
}

/** "200 m", "1,2 km" — arredonda como os apps de navegação. */
export function distanciaFalada(m: number): { numero: string; unidade: string } {
  if (m >= 1000) return { numero: (m / 1000).toFixed(m >= 10000 ? 0 : 1).replace('.', ','), unidade: 'km' };
  const passo = m > 300 ? 50 : 10;
  return { numero: String(Math.max(passo, Math.round(m / passo) * passo)), unidade: 'm' };
}
