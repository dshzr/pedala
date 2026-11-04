import { describe, expect, it } from 'vitest';
import type { LngLat } from '../geo/distance';
import { adicionarPonto, aplicarResultado, ROTA_VAZIA, type Rota } from '../route/model';
import { lerRespostaBrouter, type RespostaBrouter } from '../routing/parse';
import amostra from '../routing/__fixtures__/paulista.json';
import {
  acompanhar,
  classificarManobra,
  distanciaFalada,
  montarPercurso,
  pontoNaDistancia,
} from './percurso';

const resultado = lerRespostaBrouter(amostra as RespostaBrouter);

function rotaDaAmostra(): Rota {
  const a = resultado.coords[0];
  const b = resultado.coords.at(-1)!;
  let r = adicionarPonto(adicionarPonto(ROTA_VAZIA, a, 'auto'), b, 'auto');
  r = aplicarResultado(r, r.trechos[0].id, resultado);
  return r;
}

describe('classificarManobra', () => {
  it('traduz ângulos em instruções', () => {
    expect(classificarManobra(5, 89, 0)?.texto).toBe('Vire à direita');
    expect(classificarManobra(2, -89, 0)?.texto).toBe('Vire à esquerda');
    expect(classificarManobra(3, -45, 0)?.texto).toBe('Vire levemente à esquerda');
    expect(classificarManobra(7, 150, 0)?.tipo).toBe('forte-direita');
    expect(classificarManobra(11, 161, 0)?.tipo).toBe('retorno');
    expect(classificarManobra(13, -125, 2)?.texto).toBe('Na rotatória, pegue a 2ª saída');
  });

  it('ignora curvas pequenas e "siga em frente"', () => {
    expect(classificarManobra(1, 2, 0)).toBeNull();
    expect(classificarManobra(6, 21, 0)).toBeNull();
    expect(classificarManobra(9, 4, 0)).toBeNull();
  });
});

describe('montarPercurso', () => {
  it('espera todos os trechos ficarem prontos', () => {
    const r = adicionarPonto(adicionarPonto(ROTA_VAZIA, [0, 0], 'auto'), [0.01, 0], 'auto');
    expect(montarPercurso(r)).toBeNull();
  });

  it('a distância bate com a do roteador e termina na chegada', () => {
    const p = montarPercurso(rotaDaAmostra())!;
    expect(Math.abs(p.total - resultado.distancia) / resultado.distancia).toBeLessThan(0.03);
    expect(p.manobras.at(-1)).toMatchObject({ tipo: 'chegada' });
    expect(p.manobras.at(-1)!.dist).toBe(p.total);
    for (let i = 1; i < p.manobras.length; i++) expect(p.manobras[i].dist).toBeGreaterThanOrEqual(p.manobras[i - 1].dist);
  });

  it('junta trechos sem repetir o ponto de emenda e marca a parada', () => {
    const meio: LngLat = [-46.6, -23.6];
    let r = adicionarPonto(adicionarPonto(adicionarPonto(ROTA_VAZIA, [-46.7, -23.6], 'manual'), meio, 'manual'), [-46.5, -23.6], 'manual');
    r = { ...r };
    const p = montarPercurso(r)!;
    expect(p.coords).toHaveLength(3);
    expect(p.pontos).toHaveLength(3);
    expect(p.manobras.map((m) => m.tipo)).toEqual(['parada', 'chegada']);
  });
});

describe('acompanhar', () => {
  const p = montarPercurso(rotaDaAmostra())!;

  it('em cima da rota: progresso certo e dentro da rota', () => {
    const e = acompanhar(p, p.coords[50]);
    expect(e.progresso).toBeCloseTo(p.acumulada[50], 0);
    expect(e.foraDaRota).toBe(false);
    expect(e.restante).toBeCloseTo(p.total - p.acumulada[50], 0);
    expect(e.tempoRestante).toBeLessThan(p.tempoTotal);
    expect(e.proxima!.dist).toBeGreaterThan(e.progresso);
  });

  it('a 100 m da rota: fora da rota', () => {
    const [lon, lat] = p.coords[50];
    expect(acompanhar(p, [lon + 0.001, lat + 0.0005]).foraDaRota).toBe(true);
  });

  it('perto do destino: chegou', () => {
    expect(acompanhar(p, p.coords.at(-1)!, p.total - 50).chegou).toBe(true);
  });

  it('simulação anda pela linha', () => {
    const { pos } = pontoNaDistancia(p, 1000);
    const e = acompanhar(p, pos, 950);
    expect(e.progresso).toBeCloseTo(1000, -1);
    expect(e.foraDaRota).toBe(false);
  });
});

describe('distanciaFalada', () => {
  it('arredonda', () => {
    expect(distanciaFalada(187)).toEqual({ numero: '190', unidade: 'm' });
    expect(distanciaFalada(420)).toEqual({ numero: '400', unidade: 'm' });
    expect(distanciaFalada(1540)).toEqual({ numero: '1,5', unidade: 'km' });
    expect(distanciaFalada(3)).toEqual({ numero: '10', unidade: 'm' });
  });
});
