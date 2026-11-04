/** Tipo de via em que um pedaço da rota passa. */
export type Categoria = 'ciclovia' | 'calma' | 'trafego';
/** Inclui os trechos traçados à mão, que não passam por via conhecida. */
export type CategoriaTrecho = Categoria | 'manual';

const LADOS = ['cycleway', 'cycleway:left', 'cycleway:right', 'cycleway:both'];
const FAIXA_DEDICADA = /^(lane|track|opposite_lane|opposite_track)$/;
const FAIXA_COMPARTILHADA = /^(shared_lane|share_busway)$/;
const VIAS_CALMAS = new Set([
  'residential',
  'living_street',
  'service',
  'pedestrian',
  'footway',
  'path',
  'track',
  'steps',
  'road',
]);

/** Lê "highway=cycleway surface=asphalt" (formato do BRouter) num objeto. */
export function lerTags(texto: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const par of texto.split(' ')) {
    const i = par.indexOf('=');
    if (i > 0) tags[par.slice(0, i)] = par.slice(i + 1);
  }
  return tags;
}

/**
 * Classifica uma via pelas tags OSM. Precisa bater com o perfil prefer-ciclovia.brf:
 * o que o perfil trata como "dedicado" aqui vira "ciclovia".
 */
export function classificar(tagsTexto: string): Categoria {
  const t = lerTags(tagsTexto);
  const lado = (re: RegExp) => LADOS.some((k) => re.test(t[k] ?? ''));

  if (t.highway === 'cycleway' || t.bicycle === 'designated' || lado(FAIXA_DEDICADA)) {
    return 'ciclovia';
  }
  if (lado(FAIXA_COMPARTILHADA) || t.bicycle_road === 'yes' || t.cyclestreet === 'yes') {
    return 'calma';
  }
  if (VIAS_CALMAS.has(t.highway ?? '')) return 'calma';
  return 'trafego';
}
