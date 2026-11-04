import { useState } from 'react';
import type { LngLat } from '../geo/distance';
import type { Lugar } from '../geo/lugares';
import type { CategoriaTrecho } from '../routing/classify';
import type { Modo } from '../route/model';
import type { Resumo } from '../route/stats';
import { COR_TRECHO, NOME_TRECHO } from '../cores';
import { CampoEndereco } from './CampoEndereco';

/** Uma linha de endereço do painel: o nome mostrado e o que fazer ao escolher. */
export interface LinhaEndereco {
  chave: string;
  papel: 'origem' | 'parada' | 'destino';
  valor: string;
  /** Índice do ponto na rota; ausente quando o ponto ainda não existe. */
  indice?: number;
}

interface Props {
  linhas: LinhaEndereco[];
  perto?: LngLat;
  resumo: Resumo;
  temRota: boolean;
  aviso: string | null;
  modo: Modo;
  onModo: (m: Modo) => void;
  onEscolher: (linha: LinhaEndereco, lugar: Lugar) => void;
  onLocalizacao: (linha: LinhaEndereco) => void;
  onRemover: (indice: number) => void;
  onParada: (lugar: Lugar) => void;
  onInverter: () => void;
  podeIniciar: boolean;
  onIniciar: (simular: boolean) => void;
  podeDesfazer: boolean;
  onDesfazer: () => void;
  onLimpar: () => void;
}

const CATEGORIAS: CategoriaTrecho[] = ['ciclovia', 'calma', 'trafego', 'manual'];

export function formatarTempo(segundos: number): string {
  const min = Math.max(1, Math.round(segundos / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}

export function formatarDistancia(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
}

function IconeBike() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5.5" cy="16.5" r="3.5" />
      <circle cx="18.5" cy="16.5" r="3.5" />
      <path d="M5.5 16.5l4-7h6l3 7M9.5 9.5L8 6H6M12 16.5l3.5-7" />
    </svg>
  );
}

export function PainelRotas(p: Props) {
  const [novaParada, setNovaParada] = useState(false);
  // No celular a folha de resumo começa recolhida, para o mapa ficar visível.
  const [recolhido, setRecolhido] = useState(() => window.matchMedia('(max-width: 720px)').matches);
  const { resumo } = p;
  const pronto = p.temRota && resumo.distancia > 0;
  const linhas = [...p.linhas];
  if (novaParada) {
    linhas.splice(linhas.length - 1, 0, { chave: 'nova-parada', papel: 'parada', valor: '' });
  }
  let numeroParada = 0;

  return (
    <div className="lateral">
      <section className="cartao-rotas" aria-label="Rota">
        <div className="rotas-topo">
          <span className="marca-nome">Pedala</span>
          <div className="modos" role="tablist" aria-label="Meio de transporte">
            <button type="button" role="tab" aria-selected="true" className="modo">
              <IconeBike />
              <span>{pronto ? formatarTempo(resumo.tempo) : 'Bicicleta'}</span>
            </button>
          </div>
        </div>

        <div className="campos">
          <div className="campos-lista">
            {linhas.map((l) => {
              const numero = l.papel === 'parada' ? ++numeroParada : undefined;
              const nova = l.chave === 'nova-parada';
              return (
                <CampoEndereco
                  key={l.chave}
                  rotulo={l.papel === 'origem' ? 'Ponto de partida' : l.papel === 'destino' ? 'Destino' : `Parada ${numero}`}
                  valor={l.valor}
                  icone={l.papel}
                  numero={numero}
                  perto={p.perto}
                  autoFocus={nova}
                  placeholder={
                    l.papel === 'origem'
                      ? 'Escolha o ponto de partida'
                      : l.papel === 'destino'
                        ? 'Escolha o destino'
                        : 'Adicionar parada'
                  }
                  oferecerLocalizacao={l.papel === 'origem'}
                  onEscolher={(lugar) => {
                    if (nova) {
                      setNovaParada(false);
                      p.onParada(lugar);
                    } else p.onEscolher(l, lugar);
                  }}
                  onLocalizacao={() => p.onLocalizacao(l)}
                  onRemover={
                    nova
                      ? () => setNovaParada(false)
                      : l.papel === 'parada' && l.indice !== undefined
                        ? () => p.onRemover(l.indice!)
                        : undefined
                  }
                  onDesistir={nova ? () => setNovaParada(false) : undefined}
                />
              );
            })}
          </div>
          <button
            type="button"
            className="inverter"
            onClick={p.onInverter}
            disabled={!p.temRota}
            aria-label="Inverter partida e destino"
            title="Inverter partida e destino"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 4v15M8 4L4.5 7.5M8 4l3.5 3.5M16 20V5M16 20l-3.5-3.5M16 20l3.5-3.5" />
            </svg>
          </button>
        </div>

        {p.temRota && !novaParada && (
          <button type="button" className="adicionar-parada" onClick={() => setNovaParada(true)}>
            <span aria-hidden="true">+</span> Adicionar parada
          </button>
        )}
        {p.aviso && <p className="aviso-rota">{p.aviso}</p>}
      </section>

      <section className={`cartao-resumo${recolhido ? ' recolhido' : ''}`} aria-label="Resumo da rota" aria-live="polite">
        <button
          type="button"
          className="alca"
          onClick={() => setRecolhido(!recolhido)}
          aria-label={recolhido ? 'Mostrar detalhes' : 'Esconder detalhes'}
        />
        {!p.temRota ? (
          <div className="vazio">
            <p className="vazio-titulo">Para onde vamos?</p>
            <p>Digite o destino acima ou clique no mapa: o primeiro clique marca a partida, o segundo o destino.</p>
            <p>Clique com o botão direito no mapa para mais opções.</p>
          </div>
        ) : (
          <>
            <div className="opcao-rota" onClick={() => setRecolhido(!recolhido)}>
              <div className="opcao-icone">
                <IconeBike />
              </div>
              <div className="opcao-texto">
                {pronto ? (
                  <>
                    <p className="opcao-tempo">
                      <strong>{formatarTempo(resumo.tempo)}</strong>
                      <span>{formatarDistancia(resumo.distancia)}</span>
                    </p>
                    <p className="opcao-sub">
                      <b>{Math.round(resumo.pctCiclovia)}% em ciclovia</b> · {Math.round(resumo.subida)} m de subida
                    </p>
                  </>
                ) : (
                  <p className="opcao-tempo">
                    <strong>Calculando rota…</strong>
                  </p>
                )}
              </div>
            </div>

            {pronto && (
              <div className="iniciar-linha">
                <button type="button" className="iniciar" disabled={!p.podeIniciar} onClick={() => p.onIniciar(false)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3l7 17-7-4-7 4z" />
                  </svg>
                  Iniciar
                </button>
                <button type="button" className="simular" disabled={!p.podeIniciar} onClick={() => p.onIniciar(true)}>
                  Simular
                </button>
              </div>
            )}

            {pronto && (
              <div className="detalhe">
                <div className="barra" role="img" aria-label={`${Math.round(resumo.pctCiclovia)}% em ciclovia`}>
                  {CATEGORIAS.map((c) =>
                    resumo.porCategoria[c] > 0 ? (
                      <span
                        key={c}
                        style={{ width: `${(resumo.porCategoria[c] / resumo.distancia) * 100}%`, background: COR_TRECHO[c] }}
                      />
                    ) : null,
                  )}
                </div>
                <ul className="legenda">
                  {CATEGORIAS.filter((c) => resumo.porCategoria[c] > 0).map((c) => (
                    <li key={c}>
                      <i style={{ background: COR_TRECHO[c] }} data-tipo={c} />
                      <span>{NOME_TRECHO[c]}</span>
                      <b>{formatarDistancia(resumo.porCategoria[c])}</b>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {pronto && resumo.calculando > 0 && (
              <p className="aviso-rota neutro">
                Calculando {resumo.calculando} {resumo.calculando === 1 ? 'trecho' : 'trechos'}…
              </p>
            )}
            {resumo.erros > 0 && (
              <p className="aviso-rota">
                {resumo.erros === 1 ? 'Um trecho não saiu' : `${resumo.erros} trechos não saíram`}. Clique na linha
                vermelha tracejada no mapa para ver o motivo.
              </p>
            )}
          </>
        )}

        <div className="opcoes">
          <label className="chave">
            <input
              type="checkbox"
              role="switch"
              checked={p.modo === 'manual'}
              onChange={(e) => p.onModo(e.target.checked ? 'manual' : 'auto')}
            />
            <span className="chave-trilho" aria-hidden="true" />
            <span className="chave-texto">
              Traçar à mão
              <small>Os próximos trechos saem em linha reta, sem seguir as ruas.</small>
            </span>
          </label>
          <div className="acoes-texto">
            <button type="button" onClick={p.onDesfazer} disabled={!p.podeDesfazer}>
              Desfazer
            </button>
            <button type="button" onClick={p.onLimpar} disabled={!p.temRota && p.linhas.every((l) => !l.valor)}>
              Limpar rota
            </button>
          </div>
        </div>

        <p className="creditos">
          Dados ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap
          </a>{' '}
          · Ciclovias{' '}
          <a href="https://www.cyclosm.org" target="_blank" rel="noreferrer">
            CyclOSM
          </a>{' '}
          · Rotas{' '}
          <a href="https://brouter.de" target="_blank" rel="noreferrer">
            BRouter
          </a>{' '}
          · Endereços{' '}
          <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">
            Photon
          </a>
        </p>
      </section>
    </div>
  );
}
