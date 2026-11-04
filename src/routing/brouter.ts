import type { LngLat } from '../geo/distance';
import { lerRespostaBrouter, type TrechoCalculado } from './parse';
import perfil from './prefer-ciclovia.brf?raw';

/** Servidor público do BRouter. Para usar um BRouter local, defina VITE_BROUTER_URL. */
const BASE = (import.meta.env.VITE_BROUTER_URL as string | undefined) ?? 'https://brouter.de';

let perfilId: Promise<string> | null = null;

/** Envia o perfil uma vez por sessão; o servidor devolve um id temporário para ele. */
function obterPerfil(): Promise<string> {
  perfilId ??= (async () => {
    const resposta = await fetch(`${BASE}/brouter/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: perfil,
    });
    const json = (await resposta.json()) as { profileid?: string; error?: string };
    if (json.error || !json.profileid) throw new Error(`Perfil recusado: ${json.error ?? 'sem id'}`);
    return json.profileid;
  })().catch((e) => {
    perfilId = null;
    throw e;
  });
  return perfilId;
}

function traduzirErro(texto: string): string {
  if (/not mapped|no track found|position not/i.test(texto)) {
    return 'Ponto longe de qualquer via. Coloque-o mais perto de uma rua ou ciclovia.';
  }
  if (/timeout|watchdog|killed/i.test(texto)) return 'O roteador demorou demais. Tente de novo.';
  return `O roteador recusou o trecho: ${texto.slice(0, 120)}`;
}

const formatar = (p: LngLat) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;

export async function calcularTrecho(
  a: LngLat,
  b: LngLat,
  signal?: AbortSignal,
): Promise<TrechoCalculado> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const id = await obterPerfil();
    const url =
      `${BASE}/brouter?lonlats=${formatar(a)}|${formatar(b)}` +
      `&profile=${id}&alternativeidx=0&format=geojson&timode=2`;
    const resposta = await fetch(url, { signal });
    const texto = await resposta.text();
    if (resposta.ok) return lerRespostaBrouter(JSON.parse(texto));
    // Perfis enviados expiram no servidor; nesse caso envia de novo e repete uma vez.
    if (tentativa === 0 && /profile/i.test(texto)) {
      perfilId = null;
      continue;
    }
    throw new Error(traduzirErro(texto));
  }
  throw new Error('O roteador não aceitou o perfil.');
}
