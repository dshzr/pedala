import type { LngLat } from './distance';

/** Endereço ou lugar sugerido para origem, parada ou destino. */
export interface Lugar {
  nome: string;
  detalhe: string;
  pos: LngLat;
}

/** Photon (komoot), geocodificador do OpenStreetMap feito para busca enquanto se digita. */
const PHOTON = 'https://photon.komoot.io';

interface PropriedadesPhoton {
  name?: string;
  street?: string;
  housenumber?: string;
  district?: string;
  locality?: string;
  city?: string;
  state?: string;
  type?: string;
}

interface RespostaPhoton {
  features: { properties: PropriedadesPhoton; geometry: { coordinates: number[] } }[];
}

export function chaveDaPosicao(pos: LngLat): string {
  return `${pos[0].toFixed(6)},${pos[1].toFixed(6)}`;
}

function nomeDe(p: PropriedadesPhoton): string {
  if (p.street && p.housenumber) return `${p.street}, ${p.housenumber}`;
  return p.name ?? p.street ?? p.district ?? p.city ?? 'Lugar sem nome';
}

function detalheDe(p: PropriedadesPhoton, nome: string): string {
  const partes = [p.name && p.street && p.street !== nome ? p.street : null, p.district ?? p.locality, p.city, p.state];
  return [...new Set(partes.filter((x): x is string => !!x && x !== nome))].join(', ');
}

export async function sugerirLugares(texto: string, perto?: LngLat, signal?: AbortSignal): Promise<Lugar[]> {
  const params = new URLSearchParams({ q: texto, limit: '8' });
  if (perto) {
    params.set('lon', perto[0].toFixed(4));
    params.set('lat', perto[1].toFixed(4));
  }
  const resposta = await fetch(`${PHOTON}/api/?${params}`, { signal });
  if (!resposta.ok) throw new Error(`Busca falhou (${resposta.status})`);
  const json = (await resposta.json()) as RespostaPhoton;
  const vistos = new Set<string>();
  const lugares: Lugar[] = [];
  for (const f of json.features) {
    const nome = nomeDe(f.properties);
    const detalhe = detalheDe(f.properties, nome);
    // A mesma rua vem em vários pedaços; fica um por bairro.
    const chave = `${nome}|${detalhe}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    lugares.push({ nome, detalhe, pos: [f.geometry.coordinates[0], f.geometry.coordinates[1]] });
  }
  return lugares.slice(0, 5);
}

const CEP = /^\d{5}-?\d{3}$/;

/** Nome curto e útil: nada de CEP nem descrições longas ("Túnel de pedestres ligando..."). */
export function nomeAceitavel(nome: string): boolean {
  return !CEP.test(nome) && nome.length <= 40 && !/[.;]/.test(nome);
}

/** Nome da rua mais próxima de um ponto (para pontos marcados no mapa). */
export async function nomeDoPonto(pos: LngLat, signal?: AbortSignal): Promise<string | null> {
  const resposta = await fetch(`${PHOTON}/reverse?lon=${pos[0]}&lat=${pos[1]}&limit=5`, { signal });
  if (!resposta.ok) return null;
  const json = (await resposta.json()) as RespostaPhoton;
  const candidatos = json.features.map((f) => ({
    nome: nomeDe(f.properties),
    rua: f.properties.type === 'street',
    reserva: f.properties.street ?? f.properties.district ?? null,
  }));
  const escolhido =
    candidatos.find((c) => c.rua && nomeAceitavel(c.nome)) ?? candidatos.find((c) => nomeAceitavel(c.nome));
  if (escolhido) return escolhido.nome;
  return candidatos.find((c) => c.reserva && nomeAceitavel(c.reserva))?.reserva ?? null;
}

/** Posição atual pelo GPS do navegador. */
export function minhaLocalizacao(): Promise<LngLat> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Este navegador não informa a localização.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve([p.coords.longitude, p.coords.latitude]),
      () => reject(new Error('Não foi possível pegar sua localização.')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}
