import type { LngLat } from '../geo/distance';
import type { TrechoCalculado } from '../routing/parse';
import {
  ROTA_VAZIA,
  adicionarPonto,
  alternarModo,
  definirDestino,
  definirOrigem,
  inserirParada,
  inverter,
  recomecarDe,
  aplicarErro,
  aplicarResultado,
  moverPonto,
  removerPonto,
  tentarDeNovo,
  type Modo,
  type Rota,
} from './model';

export interface Estado {
  rota: Rota;
  /** Versões anteriores da rota, para desfazer. A mais recente fica no fim. */
  passado: Rota[];
}

export type Acao =
  | { tipo: 'adicionar'; pos: LngLat; modo: Modo }
  | { tipo: 'origem'; pos: LngLat; modo: Modo }
  | { tipo: 'destino'; pos: LngLat; modo: Modo }
  | { tipo: 'parada'; pos: LngLat; modo: Modo }
  | { tipo: 'inverter' }
  | { tipo: 'recomecar'; pos: LngLat; proximo: number }
  | { tipo: 'mover'; i: number; pos: LngLat }
  | { tipo: 'remover'; i: number }
  | { tipo: 'alternar'; i: number }
  | { tipo: 'tentar'; i: number }
  | { tipo: 'limpar' }
  | { tipo: 'desfazer' }
  | { tipo: 'resultado'; id: string; resultado: TrechoCalculado }
  | { tipo: 'erro'; id: string; erro: string };

export const ESTADO_INICIAL: Estado = { rota: ROTA_VAZIA, passado: [] };
const LIMITE_HISTORICO = 100;

function editar(estado: Estado, rota: Rota): Estado {
  return { rota, passado: [...estado.passado, estado.rota].slice(-LIMITE_HISTORICO) };
}

export function reduzir(estado: Estado, acao: Acao): Estado {
  switch (acao.tipo) {
    case 'adicionar':
      return editar(estado, adicionarPonto(estado.rota, acao.pos, acao.modo));
    case 'origem':
      return editar(estado, definirOrigem(estado.rota, acao.pos, acao.modo));
    case 'destino': {
      const rota = definirDestino(estado.rota, acao.pos, acao.modo);
      return rota === estado.rota ? estado : editar(estado, rota);
    }
    case 'parada':
      return editar(estado, inserirParada(estado.rota, acao.pos, acao.modo));
    case 'recomecar':
      return editar(estado, recomecarDe(estado.rota, acao.pos, acao.proximo));
    case 'inverter':
      return estado.rota.pontos.length > 1 ? editar(estado, inverter(estado.rota)) : estado;
    case 'mover':
      return editar(estado, moverPonto(estado.rota, acao.i, acao.pos));
    case 'remover':
      return editar(estado, removerPonto(estado.rota, acao.i));
    case 'alternar':
      return editar(estado, alternarModo(estado.rota, acao.i));
    case 'limpar':
      return estado.rota.pontos.length ? editar(estado, ROTA_VAZIA) : estado;
    case 'desfazer': {
      const anterior = estado.passado.at(-1);
      return anterior ? { rota: anterior, passado: estado.passado.slice(0, -1) } : estado;
    }
    case 'tentar':
      return { ...estado, rota: tentarDeNovo(estado.rota, acao.i) };
    case 'resultado':
      return { ...estado, rota: aplicarResultado(estado.rota, acao.id, acao.resultado) };
    case 'erro':
      return { ...estado, rota: aplicarErro(estado.rota, acao.id, acao.erro) };
  }
}
