import { describe, expect, it } from 'vitest';
import { mensagemErroLocalizacao, nomeAceitavel } from './lugares';

describe('nomeAceitavel', () => {
  it('recusa CEP e descrições longas, aceita nomes de rua', () => {
    expect(nomeAceitavel('04001-000')).toBe(false);
    expect(nomeAceitavel('Túnel de pedestres da Rua da Consolação, ligando os dois lados.')).toBe(false);
    expect(nomeAceitavel('Rua da Consolação, 2381')).toBe(true);
    expect(nomeAceitavel('Avenida Paulista')).toBe(true);
  });
});

describe('mensagemErroLocalizacao', () => {
  it('pede permissão quando o acesso foi negado', () => {
    expect(mensagemErroLocalizacao(1)).toMatch(/bloqueada/);
  });
  it('sugere ligar localização e Wi-Fi quando a posição é desconhecida ou demorou', () => {
    expect(mensagemErroLocalizacao(2)).toMatch(/Wi-Fi/);
    expect(mensagemErroLocalizacao(3)).toMatch(/Wi-Fi/);
  });
});
