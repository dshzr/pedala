import { describe, expect, it } from 'vitest';
import type { LngLat } from '../geo/distance';
import type { TrechoCalculado } from '../routing/parse';
import { ESTADO_INICIAL, reduzir, type Acao } from './historico';
import {
  ROTA_VAZIA,
  adicionarPonto,
  alternarModo,
  aplicarResultado,
  moverPonto,
  removerPonto,
  type Rota,
} from './model';
import { resumir } from './stats';

const A: LngLat = [-46.66, -23.56];
const B: LngLat = [-46.65, -23.56];
const C: LngLat = [-46.64, -23.56];
const D: LngLat = [-46.63, -23.56];

function rotaCom(...pontos: LngLat[]): Rota {
  return pontos.reduce((r, p) => adicionarPonto(r, p, 'auto'), ROTA_VAZIA);
}

const calculado = (metrosCiclovia: number, metrosTrafego: number, subida = 0): TrechoCalculado => ({
  coords: [A, B],
  pedacos: [
    { categoria: 'ciclovia', distancia: metrosCiclovia, coords: [A, B] },
    { categoria: 'trafego', distancia: metrosTrafego, coords: [B, C] },
  ],
  distancia: metrosCiclovia + metrosTrafego,
  subida,
  tempo: 600,
  manobras: [],
});

describe('modelo da rota', () => {
  it('sempre tem um trecho a menos que pontos', () => {
    let r = rotaCom(A);
    expect(r.trechos).toHaveLength(0);
    r = adicionarPonto(r, B, 'auto');
    r = adicionarPonto(r, C, 'manual');
    expect(r.pontos).toHaveLength(3);
    expect(r.trechos.map((t) => t.modo)).toEqual(['auto', 'manual']);
  });

  it('trecho manual nasce pronto, em linha reta; o automático espera o roteador', () => {
    const r = adicionarPonto(adicionarPonto(rotaCom(A, B), C, 'manual'), D, 'auto');
    expect(r.trechos[0].estado).toBe('calculando');
    expect(r.trechos[1].estado).toBe('pronto');
    expect(r.trechos[1].resultado!.coords).toEqual([B, C]);
    expect(r.trechos[1].resultado!.distancia).toBeGreaterThan(900);
    expect(r.trechos[2].estado).toBe('calculando');
  });

  it('mover um ponto refaz só os dois trechos vizinhos', () => {
    const r = rotaCom(A, B, C, D);
    const movida = moverPonto(r, 1, [-46.655, -23.57]);
    expect(movida.trechos[0].id).not.toBe(r.trechos[0].id);
    expect(movida.trechos[1].id).not.toBe(r.trechos[1].id);
    expect(movida.trechos[2].id).toBe(r.trechos[2].id);
  });

  it('mover o primeiro ponto refaz só o primeiro trecho e mantém o modo', () => {
    const r = adicionarPonto(adicionarPonto(rotaCom(A), B, 'manual'), C, 'auto');
    const movida = moverPonto(r, 0, [-46.67, -23.55]);
    expect(movida.trechos[0].id).not.toBe(r.trechos[0].id);
    expect(movida.trechos[0].modo).toBe('manual');
    expect(movida.trechos[1].id).toBe(r.trechos[1].id);
  });

  it('remover o ponto do meio junta os vizinhos num trecho só', () => {
    const r = rotaCom(A, B, C, D);
    const sem = removerPonto(r, 1);
    expect(sem.pontos.map((p) => p.pos)).toEqual([A, C, D]);
    expect(sem.trechos).toHaveLength(2);
    expect(sem.trechos[1].id).toBe(r.trechos[2].id);
  });

  it('remover as pontas tira só o trecho da ponta', () => {
    const r = rotaCom(A, B, C);
    expect(removerPonto(r, 0).trechos.map((t) => t.id)).toEqual([r.trechos[1].id]);
    expect(removerPonto(r, 2).trechos.map((t) => t.id)).toEqual([r.trechos[0].id]);
    expect(removerPonto(rotaCom(A), 0)).toEqual(ROTA_VAZIA);
  });

  it('alternar o modo troca automático por linha reta e vice-versa', () => {
    const r = rotaCom(A, B);
    const manual = alternarModo(r, 0);
    expect(manual.trechos[0]).toMatchObject({ modo: 'manual', estado: 'pronto' });
    expect(alternarModo(manual, 0).trechos[0]).toMatchObject({ modo: 'auto', estado: 'calculando' });
  });

  it('ignora resposta atrasada de um trecho que já foi trocado', () => {
    const r = rotaCom(A, B);
    const antigo = r.trechos[0].id;
    const movida = moverPonto(r, 1, C);
    expect(aplicarResultado(movida, antigo, calculado(100, 0))).toBe(movida);
  });
});

describe('histórico', () => {
  it('desfazer volta a versão anterior; respostas do roteador não entram no histórico', () => {
    let e = ESTADO_INICIAL;
    const passos: Acao[] = [
      { tipo: 'adicionar', pos: A, modo: 'auto' },
      { tipo: 'adicionar', pos: B, modo: 'auto' },
    ];
    for (const p of passos) e = reduzir(e, p);
    const id = e.rota.trechos[0].id;
    e = reduzir(e, { tipo: 'resultado', id, resultado: calculado(500, 500) });
    expect(e.passado).toHaveLength(2);
    expect(e.rota.trechos[0].estado).toBe('pronto');

    e = reduzir(e, { tipo: 'desfazer' });
    expect(e.rota.pontos).toHaveLength(1);
    e = reduzir(e, { tipo: 'desfazer' });
    e = reduzir(e, { tipo: 'desfazer' });
    expect(e.rota).toEqual(ROTA_VAZIA);
  });
});

describe('resumo', () => {
  it('soma distâncias por categoria e calcula o % em ciclovia', () => {
    let r = adicionarPonto(rotaCom(A, B), C, 'manual');
    r = aplicarResultado(r, r.trechos[0].id, calculado(3000, 1000, 25));
    const resumo = resumir(r);
    const manual = r.trechos[1].resultado!.distancia;
    expect(resumo.porCategoria.ciclovia).toBe(3000);
    expect(resumo.porCategoria.trafego).toBe(1000);
    expect(resumo.porCategoria.manual).toBeCloseTo(manual);
    expect(resumo.distancia).toBeCloseTo(4000 + manual);
    expect(resumo.pctCiclovia).toBeCloseTo((3000 / (4000 + manual)) * 100);
    expect(resumo.subida).toBe(25);
  });

  it('conta trechos calculando e com erro, sem somar a distância deles', () => {
    let e = reduzir(reduzir(reduzir(ESTADO_INICIAL, { tipo: 'adicionar', pos: A, modo: 'auto' }), { tipo: 'adicionar', pos: B, modo: 'auto' }), { tipo: 'adicionar', pos: C, modo: 'auto' });
    e = reduzir(e, { tipo: 'erro', id: e.rota.trechos[0].id, erro: 'longe' });
    const resumo = resumir(e.rota);
    expect(resumo).toMatchObject({ calculando: 1, erros: 1, distancia: 0, pctCiclovia: 0 });
  });
});

describe('origem e destino', () => {
  it('origem cria o primeiro ponto e depois só o move', async () => {
    const { definirOrigem } = await import('./model');
    const r = definirOrigem(ROTA_VAZIA, A, 'auto');
    expect(r.pontos.map((p) => p.pos)).toEqual([A]);
    const r2 = definirOrigem(adicionarPonto(r, B, 'auto'), C, 'auto');
    expect(r2.pontos.map((p) => p.pos)).toEqual([C, B]);
    expect(r2.trechos[0].estado).toBe('calculando');
  });

  it('destino com só a origem já cria o trecho calculando', async () => {
    const { definirDestino } = await import('./model');
    const r = definirDestino(rotaCom(A), B, 'auto');
    expect(r.pontos.map((p) => p.pos)).toEqual([A, B]);
    expect(r.trechos).toHaveLength(1);
    expect(r.trechos[0]).toMatchObject({ modo: 'auto', estado: 'calculando' });
  });

  it('destino numa rota feita move o último ponto; sem origem não faz nada', async () => {
    const { definirDestino } = await import('./model');
    const r = rotaCom(A, B, C);
    const nova = definirDestino(r, D, 'auto');
    expect(nova.pontos.map((p) => p.pos)).toEqual([A, B, D]);
    expect(nova.trechos[0].id).toBe(r.trechos[0].id);
    expect(definirDestino(ROTA_VAZIA, D, 'auto')).toBe(ROTA_VAZIA);
  });
});

describe('parada e inversão', () => {
  it('parada entra antes do destino e divide o último trecho', async () => {
    const { inserirParada } = await import('./model');
    const r = rotaCom(A, B, D);
    const nova = inserirParada(r, C, 'auto');
    expect(nova.pontos.map((p) => p.pos)).toEqual([A, B, C, D]);
    expect(nova.trechos).toHaveLength(3);
    expect(nova.trechos[0].id).toBe(r.trechos[0].id);
    expect(nova.pontos.at(-1)!.id).toBe(r.pontos.at(-1)!.id);
  });

  it('inverter troca origem e destino e refaz os trechos mantendo o modo', async () => {
    const { inverter } = await import('./model');
    const r = adicionarPonto(rotaCom(A, B), C, 'manual');
    const inv = inverter(r);
    expect(inv.pontos.map((p) => p.pos)).toEqual([C, B, A]);
    expect(inv.trechos.map((t) => t.modo)).toEqual(['manual', 'auto']);
    expect(inv.trechos[0].resultado!.coords).toEqual([C, B]);
  });
});

describe('recomeçar de onde a pessoa está', () => {
  it('nova partida liga ao próximo ponto e mantém os trechos seguintes', async () => {
    const { recomecarDe } = await import('./model');
    const r = rotaCom(A, B, C, D);
    const X: LngLat = [-46.645, -23.57];
    const nova = recomecarDe(r, X, 2);
    expect(nova.pontos.map((p) => p.pos)).toEqual([X, C, D]);
    expect(nova.trechos).toHaveLength(2);
    expect(nova.trechos[0]).toMatchObject({ modo: 'auto', estado: 'calculando' });
    expect(nova.trechos[1].id).toBe(r.trechos[2].id);
  });
});
