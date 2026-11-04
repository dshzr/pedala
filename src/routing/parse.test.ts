import { describe, expect, it } from 'vitest';
import { classificar } from './classify';
import { lerRespostaBrouter, type RespostaBrouter } from './parse';
import amostra from './__fixtures__/paulista.json';

describe('classificar', () => {
  it('ciclovia separada, ciclofaixa em qualquer lado e calçada compartilhada contam como ciclovia', () => {
    expect(classificar('highway=cycleway surface=concrete')).toBe('ciclovia');
    expect(classificar('highway=primary cycleway:right=lane')).toBe('ciclovia');
    expect(classificar('highway=secondary cycleway:both=track')).toBe('ciclovia');
    expect(classificar('highway=footway bicycle=designated')).toBe('ciclovia');
  });

  it('rua residencial e ciclorrota pintada são ruas calmas', () => {
    expect(classificar('highway=residential')).toBe('calma');
    expect(classificar('highway=tertiary cycleway:right=shared_lane')).toBe('calma');
    expect(classificar('reversedirection=yes highway=living_street')).toBe('calma');
  });

  it('avenida sem estrutura é via com trânsito', () => {
    expect(classificar('highway=primary cycleway:both=no')).toBe('trafego');
    expect(classificar('highway=secondary')).toBe('trafego');
    expect(classificar('')).toBe('trafego');
  });
});

describe('lerRespostaBrouter', () => {
  const resultado = lerRespostaBrouter(amostra as RespostaBrouter);

  it('a soma dos pedaços bate com a distância da rota', () => {
    const soma = resultado.pedacos.reduce((s, p) => s + p.distancia, 0);
    expect(resultado.distancia).toBe(4197);
    expect(soma).toBe(4197);
  });

  it('os pedaços cobrem a geometria inteira, de ponta a ponta e sem buracos', () => {
    const { coords, pedacos } = resultado;
    expect(pedacos[0].coords[0]).toEqual(coords[0]);
    expect(pedacos.at(-1)!.coords.at(-1)).toEqual(coords.at(-1));
    for (let i = 1; i < pedacos.length; i++) {
      expect(pedacos[i].coords[0]).toEqual(pedacos[i - 1].coords.at(-1));
    }
    const pontos = pedacos.reduce((s, p) => s + p.coords.length, 0) - (pedacos.length - 1);
    expect(pontos).toBe(coords.length);
  });

  it('pedaços vizinhos nunca têm a mesma categoria', () => {
    for (let i = 1; i < resultado.pedacos.length; i++) {
      expect(resultado.pedacos[i].categoria).not.toBe(resultado.pedacos[i - 1].categoria);
    }
  });

  it('a rota da Paulista sai com cerca de três quartos em ciclovia', () => {
    const ciclovia = resultado.pedacos
      .filter((p) => p.categoria === 'ciclovia')
      .reduce((s, p) => s + p.distancia, 0);
    expect(ciclovia / resultado.distancia).toBeGreaterThan(0.7);
  });

  it('traz o tempo estimado pelo roteador', () => {
    expect(resultado.tempo).toBeGreaterThan(300);
  });

  it('lê as conversões com índice dentro da geometria', () => {
    expect(resultado.manobras.length).toBeGreaterThan(5);
    for (const m of resultado.manobras) {
      expect(m.indice).toBeGreaterThan(0);
      expect(m.indice).toBeLessThan(resultado.coords.length);
    }
    expect(resultado.manobras.some((m) => m.comando === 5 && m.angulo > 45)).toBe(true);
  });

  it('recusa resposta sem rota', () => {
    expect(() => lerRespostaBrouter({ features: [] })).toThrow();
  });
});
