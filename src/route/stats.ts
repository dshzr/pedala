import type { CategoriaTrecho } from '../routing/classify';
import type { Rota } from './model';

export interface Resumo {
  /** Metros somados dos trechos já calculados. */
  distancia: number;
  porCategoria: Record<CategoriaTrecho, number>;
  /** De 0 a 100. */
  pctCiclovia: number;
  subida: number;
  /** Segundos estimados. */
  tempo: number;
  calculando: number;
  erros: number;
}

export function resumir(rota: Rota): Resumo {
  const porCategoria: Record<CategoriaTrecho, number> = {
    ciclovia: 0,
    calma: 0,
    trafego: 0,
    manual: 0,
  };
  let subida = 0;
  let tempo = 0;
  let calculando = 0;
  let erros = 0;

  for (const t of rota.trechos) {
    if (t.estado === 'calculando') calculando++;
    if (t.estado === 'erro') erros++;
    if (t.estado !== 'pronto' || !t.resultado) continue;
    subida += t.resultado.subida;
    tempo += t.resultado.tempo;
    for (const p of t.resultado.pedacos) porCategoria[p.categoria] += p.distancia;
  }

  const distancia = Object.values(porCategoria).reduce((s, v) => s + v, 0);
  const pctCiclovia = distancia > 0 ? (porCategoria.ciclovia / distancia) * 100 : 0;
  return { distancia, porCategoria, pctCiclovia, subida, tempo, calculando, erros };
}
