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

/** Texto para o usuário conforme o código de erro da geolocalização (1 negado, 2 indisponível, 3 demorou). */
export function mensagemErroLocalizacao(codigo: number): string {
  if (codigo === 1) {
    return 'A localização está bloqueada. Permita o acesso à localização para este site nas configurações do navegador.';
  }
  return 'Não deu para achar sua localização agora. Confira se a localização e o Wi-Fi estão ligados e tente de novo.';
}

function pedirPosicao(opcoes: PositionOptions): Promise<LngLat> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve([p.coords.longitude, p.coords.latitude]),
      reject,
      opcoes,
    );
  });
}

/**
 * Posição atual pelo GPS do navegador. Se a primeira tentativa falhar sem ser por permissão
 * (no Mac, o CoreLocation às vezes ainda não sabe a posição), tenta de novo com precisão menor,
 * que usa Wi-Fi e aceita uma posição recente guardada.
 */
export async function minhaLocalizacao(): Promise<LngLat> {
  if (!navigator.geolocation) throw new Error('Este navegador não informa a localização.');
  try {
    return await pedirPosicao({ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  } catch (e) {
    const codigo = (e as GeolocationPositionError).code;
    if (codigo === 1) throw new Error(mensagemErroLocalizacao(1));
  }
  try {
    return await pedirPosicao({ enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
  } catch (e) {
    throw new Error(mensagemErroLocalizacao((e as GeolocationPositionError).code));
  }
}
