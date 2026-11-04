import type { CategoriaTrecho } from './routing/classify';

/** Cores da rota, por tipo de via por onde ela passa. */
export const COR_TRECHO: Record<CategoriaTrecho, string> = {
  ciclovia: '#1fbf63',
  calma: '#f2a516',
  trafego: '#e5484d',
  manual: '#6b7785',
};

export const NOME_TRECHO: Record<CategoriaTrecho, string> = {
  ciclovia: 'Ciclovia ou ciclofaixa',
  calma: 'Rua calma',
  trafego: 'Via com trânsito',
  manual: 'Traçado à mão',
};
