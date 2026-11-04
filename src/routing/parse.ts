import { distanciaDaLinha, type LngLat } from '../geo/distance';
import { classificar, type CategoriaTrecho } from './classify';

/** Pedaço contínuo de um trecho em que todas as vias têm a mesma categoria. */
export interface Pedaco {
  categoria: CategoriaTrecho;
  distancia: number;
  coords: LngLat[];
}

/** Conversão informada pelo roteador ("voicehint"), num ponto da geometria do trecho. */
export interface ManobraBruta {
  /** Índice em `coords` onde a conversão acontece. */
  indice: number;
  /** Código do BRouter: 8/9 manter-se, 10–12 retorno, 13/14 rotatória. */
  comando: number;
  /** Saída da rotatória (0 quando não é rotatória). */
  saida: number;
  /** Graus; positivo é para a direita. */
  angulo: number;
}

/** Resultado de um trecho (de um ponto ao seguinte), já pronto para desenhar e somar. */
export interface TrechoCalculado {
  coords: LngLat[];
  pedacos: Pedaco[];
  distancia: number;
  subida: number;
  /** Segundos estimados pedalando. */
  tempo: number;
  manobras: ManobraBruta[];
}

export interface RespostaBrouter {
  features?: {
    geometry: { coordinates: number[][] };
    properties: { messages?: string[][]; voicehints?: number[][]; [chave: string]: unknown };
  }[];
}

/** Tempo a 15 km/h, para trechos sem estimativa do roteador. */
export function tempoPedalando(metros: number): number {
  return metros / (15 / 3.6);
}

// As mensagens do BRouter trazem coordenadas em milionésimos de grau.
const TOLERANCIA = 2;

function juntar(lista: Pedaco[], novo: Pedaco) {
  const ultimo = lista.at(-1);
  if (ultimo && ultimo.categoria === novo.categoria) {
    ultimo.distancia += novo.distancia;
    ultimo.coords.push(...novo.coords.slice(1));
  } else {
    lista.push(novo);
  }
}

/**
 * Converte o GeoJSON do BRouter em pedaços por categoria de via.
 * Cada linha de "messages" descreve um trecho com as mesmas tags e termina num ponto da
 * geometria; a geometria é cortada nesses pontos.
 */
export function lerRespostaBrouter(resposta: RespostaBrouter): TrechoCalculado {
  const feature = resposta.features?.[0];
  const brutas = feature?.geometry?.coordinates;
  if (!feature || !brutas || brutas.length < 2) throw new Error('O BRouter não devolveu uma rota.');

  const coords: LngLat[] = brutas.map((c) => [c[0], c[1]]);
  const mensagens = feature.properties.messages ?? [];
  const cab = mensagens[0] ?? [];
  const iLon = cab.indexOf('Longitude');
  const iLat = cab.indexOf('Latitude');
  const iDist = cab.indexOf('Distance');
  const iTags = cab.indexOf('WayTags');

  const pedacos: Pedaco[] = [];
  let inicio = 0;
  for (const linha of mensagens.slice(1)) {
    if (inicio >= coords.length - 1) break;
    const lon = Number(linha[iLon]);
    const lat = Number(linha[iLat]);
    let fim = coords.length - 1;
    for (let j = inicio + 1; j < coords.length; j++) {
      if (
        Math.abs(Math.round(coords[j][0] * 1e6) - lon) <= TOLERANCIA &&
        Math.abs(Math.round(coords[j][1] * 1e6) - lat) <= TOLERANCIA
      ) {
        fim = j;
        break;
      }
    }
    juntar(pedacos, {
      categoria: classificar(linha[iTags] ?? ''),
      distancia: Number(linha[iDist]) || 0,
      coords: coords.slice(inicio, fim + 1),
    });
    inicio = fim;
  }
  if (inicio < coords.length - 1) {
    const resto = coords.slice(inicio);
    juntar(pedacos, {
      categoria: pedacos.at(-1)?.categoria ?? 'calma',
      distancia: distanciaDaLinha(resto),
      coords: resto,
    });
  }

  const somaPedacos = pedacos.reduce((s, p) => s + p.distancia, 0);
  const distancia = Number(feature.properties['track-length']) || somaPedacos;
  const subida = Math.max(0, Number(feature.properties['filtered ascend']) || 0);
  const tempo = Number(feature.properties['total-time']) || tempoPedalando(distancia);
  const manobras: ManobraBruta[] = (feature.properties.voicehints ?? [])
    .filter((v) => v[0] > 0 && v[0] < coords.length)
    .map((v) => ({ indice: v[0], comando: v[1], saida: v[2] ?? 0, angulo: v[4] ?? 0 }));
  return { coords, pedacos, distancia, subida, tempo, manobras };
}
