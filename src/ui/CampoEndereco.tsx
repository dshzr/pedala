import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { LngLat } from '../geo/distance';
import { sugerirLugares, type Lugar } from '../geo/lugares';

export type IconeCampo = 'origem' | 'parada' | 'destino';

interface Props {
  rotulo: string;
  valor: string;
  placeholder: string;
  icone: IconeCampo;
  numero?: number;
  perto?: LngLat;
  oferecerLocalizacao?: boolean;
  autoFocus?: boolean;
  onEscolher: (l: Lugar) => void;
  onLocalizacao?: () => void;
  onRemover?: () => void;
  onDesistir?: () => void;
}

export function IconeDoCampo({ icone, numero }: { icone: IconeCampo; numero?: number }) {
  if (icone === 'destino') {
    return (
      <svg className="icone-campo pino" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7z" />
        <circle cx="12" cy="9" r="2.6" fill="#fff" />
      </svg>
    );
  }
  if (icone === 'parada') return <span className="icone-campo parada">{numero}</span>;
  return <span className="icone-campo origem" aria-hidden="true" />;
}

/** Campo de endereço com sugestões enquanto se digita, navegável pelo teclado. */
export function CampoEndereco(p: Props) {
  const [texto, setTexto] = useState(p.valor);
  const [aberto, setAberto] = useState(false);
  const [sugestoes, setSugestoes] = useState<Lugar[]>([]);
  const [ativo, setAtivo] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const pedido = useRef<AbortController | null>(null);
  const espera = useRef<number | undefined>(undefined);
  const idLista = useId();

  useEffect(() => setTexto(p.valor), [p.valor]);
  useEffect(() => () => pedido.current?.abort(), []);

  const opcoes: ({ tipo: 'gps' } | { tipo: 'lugar'; lugar: Lugar })[] = [
    ...(p.oferecerLocalizacao ? [{ tipo: 'gps' as const }] : []),
    ...sugestoes.map((lugar) => ({ tipo: 'lugar' as const, lugar })),
  ];

  async function buscar(q: string): Promise<Lugar[]> {
    pedido.current?.abort();
    if (q.trim().length < 3) {
      setSugestoes([]);
      return [];
    }
    const controle = new AbortController();
    pedido.current = controle;
    setBuscando(true);
    try {
      const lista = await sugerirLugares(q, p.perto, controle.signal);
      if (!controle.signal.aborted) {
        setSugestoes(lista);
        setAtivo(0);
      }
      return lista;
    } catch {
      return [];
    } finally {
      if (pedido.current === controle) setBuscando(false);
    }
  }

  function aoDigitar(v: string) {
    setTexto(v);
    setAberto(true);
    window.clearTimeout(espera.current);
    espera.current = window.setTimeout(() => void buscar(v), 280);
  }

  function escolher(i: number) {
    const opcao = opcoes[i];
    if (!opcao) return;
    setAberto(false);
    if (opcao.tipo === 'gps') p.onLocalizacao?.();
    else {
      setTexto(opcao.lugar.nome);
      p.onEscolher(opcao.lugar);
    }
  }

  async function aoTeclar(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAberto(true);
      setAtivo((a) => Math.min(a + 1, opcoes.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAtivo((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (aberto && opcoes.length && (ativo > 0 || sugestoes.length || !texto.trim())) {
        escolher(ativo);
      } else if (texto.trim()) {
        // Enter antes das sugestões chegarem: busca já e fica com a primeira.
        window.clearTimeout(espera.current);
        const lista = await buscar(texto);
        if (lista[0]) {
          setAberto(false);
          setTexto(lista[0].nome);
          p.onEscolher(lista[0]);
        }
      }
    } else if (e.key === 'Escape') {
      setAberto(false);
      setTexto(p.valor);
      p.onDesistir?.();
    }
  }

  const mostrarLista = aberto && opcoes.length > 0;

  return (
    <div className="campo">
      <IconeDoCampo icone={p.icone} numero={p.numero} />
      <div className="campo-entrada">
        <input
          type="text"
          value={texto}
          placeholder={p.placeholder}
          aria-label={p.rotulo}
          autoFocus={p.autoFocus}
          role="combobox"
          aria-expanded={mostrarLista}
          aria-controls={idLista}
          aria-autocomplete="list"
          onChange={(e) => aoDigitar(e.target.value)}
          onFocus={(e) => {
            e.target.select();
            setAberto(true);
          }}
          onBlur={() => {
            setAberto(false);
            if (!texto.trim()) setTexto(p.valor);
            if (!p.valor && !texto.trim()) p.onDesistir?.();
          }}
          onKeyDown={aoTeclar}
        />
        {buscando && <span className="campo-girando" aria-hidden="true" />}
        {mostrarLista && (
          <ul className="sugestoes" id={idLista} role="listbox">
            {opcoes.map((o, i) => (
              <li
                key={o.tipo === 'gps' ? 'gps' : `${o.lugar.pos[0]},${o.lugar.pos[1]}`}
                role="option"
                aria-selected={i === ativo}
                className={i === ativo ? 'ativa' : ''}
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher(i);
                }}
                onMouseEnter={() => setAtivo(i)}
              >
                {o.tipo === 'gps' ? (
                  <>
                    <svg className="sugestao-icone gps" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                      <circle cx="12" cy="12" r="7.5" fill="none" />
                    </svg>
                    <span className="sugestao-texto">
                      <strong>Sua localização</strong>
                    </span>
                  </>
                ) : (
                  <>
                    <svg className="sugestao-icone" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7z" />
                      <circle cx="12" cy="9" r="2.4" fill="#fff" />
                    </svg>
                    <span className="sugestao-texto">
                      <strong>{o.lugar.nome}</strong>
                      {o.lugar.detalhe && <span>{o.lugar.detalhe}</span>}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {p.onRemover && (
        <button type="button" className="campo-remover" onClick={p.onRemover} aria-label={`Remover ${p.rotulo}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}
