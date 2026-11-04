import type { TipoManobra } from './percurso';

const CAMINHOS: Record<string, string> = {
  direita: 'M7 21v-8a4 4 0 0 1 4-4h8M15 5l4 4-4 4',
  'leve-direita': 'M8 21v-7l8.5-8.5M11 5h6v6',
  'forte-direita': 'M7 3v8a4 4 0 0 0 4 4h6M13 11l4 4-4 4',
  'manter-direita': 'M9 21v-6l6-6V3M11 7l4-4 4 4',
  retorno: 'M15 21V9a5 5 0 0 0-10 0v6M2 12l3 3 3-3',
  rotatoria: 'M12 21v-6M12 15a4 4 0 1 1 4-4M16 11V6M13 8l3-3 3 3',
  reto: 'M12 21V4M7 9l5-5 5 5',
};

/** Seta da manobra; as de esquerda são as de direita espelhadas. */
export function IconeManobra({ tipo, className }: { tipo: TipoManobra | 'reto'; className?: string }) {
  if (tipo === 'chegada' || tipo === 'parada') {
    return (
      <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 21V4M6 4h11l-2 4 2 4H6" />
      </svg>
    );
  }
  const espelhar = tipo.endsWith('esquerda');
  const base = tipo.replace('esquerda', 'direita');
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d={CAMINHOS[base] ?? CAMINHOS.reto} transform={espelhar ? 'translate(24 0) scale(-1 1)' : undefined} />
    </svg>
  );
}
