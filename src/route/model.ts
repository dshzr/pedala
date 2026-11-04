import { distanciaMetros, type LngLat } from '../geo/distance';
import { tempoPedalando, type TrechoCalculado } from '../routing/parse';

/** Como um trecho é traçado: pelo roteador (preferindo ciclovia) ou em linha reta. */
export type Modo = 'auto' | 'manual';

export interface Ponto {
  id: string;
  pos: LngLat;
}

export type EstadoTrecho = 'calculando' | 'pronto' | 'erro';

/** Ligação entre o ponto i e o ponto i+1. */
export interface Trecho {
  id: string;
  modo: Modo;
  estado: EstadoTrecho;
  resultado?: TrechoCalculado;
  erro?: string;
}

/** Sempre vale: trechos.length === max(0, pontos.length - 1). */
export interface Rota {
  pontos: Ponto[];
  trechos: Trecho[];
}

export const ROTA_VAZIA: Rota = { pontos: [], trechos: [] };

let contador = 0;
const novoId = (prefixo: string) => `${prefixo}${++contador}`;

export function linhaReta(a: LngLat, b: LngLat): TrechoCalculado {
  const distancia = distanciaMetros(a, b);
  return {
    coords: [a, b],
    pedacos: [{ categoria: 'manual', distancia, coords: [a, b] }],
    distancia,
    subida: 0,
    tempo: tempoPedalando(distancia),
    manobras: [],
  };
}

/** Trecho novo: o manual já nasce pronto; o automático espera o roteador. */
function criarTrecho(a: LngLat, b: LngLat, modo: Modo): Trecho {
  if (modo === 'manual') {
    return { id: novoId('t'), modo, estado: 'pronto', resultado: linhaReta(a, b) };
  }
  return { id: novoId('t'), modo, estado: 'calculando' };
}

export function adicionarPonto(rota: Rota, pos: LngLat, modo: Modo): Rota {
  const ultimo = rota.pontos.at(-1);
  return {
    pontos: [...rota.pontos, { id: novoId('p'), pos }],
    trechos: ultimo ? [...rota.trechos, criarTrecho(ultimo.pos, pos, modo)] : rota.trechos,
  };
}

/** Define o início da rota: cria o primeiro ponto ou move o que já existe. */
export function definirOrigem(rota: Rota, pos: LngLat, modo: Modo): Rota {
  return rota.pontos.length === 0 ? adicionarPonto(rota, pos, modo) : moverPonto(rota, 0, pos);
}

/**
 * Define o destino: com só a origem, cria o segundo ponto (e o trecho já sai calculando);
 * com rota feita, move o último ponto. Sem origem não faz nada.
 */
export function definirDestino(rota: Rota, pos: LngLat, modo: Modo): Rota {
  if (rota.pontos.length === 0) return rota;
  if (rota.pontos.length === 1) return adicionarPonto(rota, pos, modo);
  return moverPonto(rota, rota.pontos.length - 1, pos);
}

/** Põe uma parada antes do destino; o trecho que chegava ao destino vira dois. */
export function inserirParada(rota: Rota, pos: LngLat, modo: Modo): Rota {
  const n = rota.pontos.length;
  if (n < 2) return adicionarPonto(rota, pos, modo);
  const anterior = rota.pontos[n - 2].pos;
  const destino = rota.pontos[n - 1].pos;
  const modoAntigo = rota.trechos[n - 2].modo;
  return {
    pontos: [...rota.pontos.slice(0, n - 1), { id: novoId('p'), pos }, rota.pontos[n - 1]],
    trechos: [
      ...rota.trechos.slice(0, n - 2),
      criarTrecho(anterior, pos, modoAntigo),
      criarTrecho(pos, destino, modoAntigo),
    ],
  };
}

/**
 * Recomeça a rota a partir de onde a pessoa está (saiu do caminho): a nova partida liga
 * direto ao ponto `proximo`; os trechos seguintes continuam iguais.
 */
export function recomecarDe(rota: Rota, pos: LngLat, proximo: number): Rota {
  const restantes = rota.pontos.slice(proximo);
  if (restantes.length === 0) return rota;
  return {
    pontos: [{ id: novoId('p'), pos }, ...restantes],
    trechos: [criarTrecho(pos, restantes[0].pos, 'auto'), ...rota.trechos.slice(proximo)],
  };
}

/** Troca origem e destino. Os trechos são refeitos, porque mão única muda o caminho. */
export function inverter(rota: Rota): Rota {
  const pontos = [...rota.pontos].reverse();
  const modos = rota.trechos.map((t) => t.modo).reverse();
  return {
    pontos,
    trechos: modos.map((modo, k) => criarTrecho(pontos[k].pos, pontos[k + 1].pos, modo)),
  };
}

/** Move o ponto i; só os dois trechos vizinhos são refeitos, mantendo o modo de cada um. */
export function moverPonto(rota: Rota, i: number, pos: LngLat): Rota {
  const pontos = rota.pontos.map((p, k) => (k === i ? { ...p, pos } : p));
  const trechos = rota.trechos.map((t, k) =>
    k === i - 1 || k === i ? criarTrecho(pontos[k].pos, pontos[k + 1].pos, t.modo) : t,
  );
  return { pontos, trechos };
}

/** Remove o ponto i. No meio da rota, os dois trechos vizinhos viram um, com o modo do primeiro. */
export function removerPonto(rota: Rota, i: number): Rota {
  const pontos = rota.pontos.filter((_, k) => k !== i);
  let trechos: Trecho[];
  if (rota.trechos.length === 0) trechos = [];
  else if (i === 0) trechos = rota.trechos.slice(1);
  else if (i === rota.pontos.length - 1) trechos = rota.trechos.slice(0, -1);
  else {
    const modo = rota.trechos[i - 1].modo;
    trechos = [
      ...rota.trechos.slice(0, i - 1),
      criarTrecho(pontos[i - 1].pos, pontos[i].pos, modo),
      ...rota.trechos.slice(i + 1),
    ];
  }
  return { pontos, trechos };
}

function refazerTrecho(rota: Rota, i: number, modo: Modo): Rota {
  const trechos = rota.trechos.map((t, k) =>
    k === i ? criarTrecho(rota.pontos[i].pos, rota.pontos[i + 1].pos, modo) : t,
  );
  return { ...rota, trechos };
}

export function alternarModo(rota: Rota, i: number): Rota {
  return refazerTrecho(rota, i, rota.trechos[i].modo === 'auto' ? 'manual' : 'auto');
}

export function tentarDeNovo(rota: Rota, i: number): Rota {
  return refazerTrecho(rota, i, rota.trechos[i].modo);
}

/** Grava a resposta do roteador; ignora se o trecho já foi trocado (resposta atrasada). */
export function aplicarResultado(rota: Rota, id: string, resultado: TrechoCalculado): Rota {
  if (!rota.trechos.some((t) => t.id === id && t.estado === 'calculando')) return rota;
  return {
    ...rota,
    trechos: rota.trechos.map((t) => (t.id === id ? { ...t, estado: 'pronto', resultado } : t)),
  };
}

export function aplicarErro(rota: Rota, id: string, erro: string): Rota {
  if (!rota.trechos.some((t) => t.id === id && t.estado === 'calculando')) return rota;
  return {
    ...rota,
    trechos: rota.trechos.map((t) => (t.id === id ? { ...t, estado: 'erro', erro } : t)),
  };
}
