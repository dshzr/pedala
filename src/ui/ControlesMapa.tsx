interface Props {
  mostrarCiclovias: boolean;
  onCiclovias: (v: boolean) => void;
  longe: boolean;
  onZoom: (delta: number) => void;
  onMinhaLocalizacao: () => void;
  localizando: boolean;
}

/** Botões flutuantes sobre o mapa: camada de ciclovias (esquerda), localização e zoom (direita). */
export function ControlesMapa(p: Props) {
  return (
    <>
      <div className="controle-camadas">
        <button
          type="button"
          className={`camada-botao${p.mostrarCiclovias ? ' ativa' : ''}`}
          aria-pressed={p.mostrarCiclovias}
          onClick={() => p.onCiclovias(!p.mostrarCiclovias)}
          title={p.mostrarCiclovias ? 'Esconder ciclovias' : 'Mostrar ciclovias'}
        >
          <span className="camada-miniatura" aria-hidden="true">
            <svg viewBox="0 0 48 48">
              <path d="M-2 34L22 18 50 26" />
              <path d="M10 50L26 -2" className="faixa" />
            </svg>
          </span>
          <span className="camada-nome">Ciclovias</span>
        </button>
        {p.mostrarCiclovias && (
          <div className="camada-legenda">
            {p.longe ? (
              <span>Aproxime o mapa para ver as ciclovias</span>
            ) : (
              <>
                <span>
                  <i data-tipo="cyclosm-ciclovia" /> Ciclovia
                </span>
                <span>
                  <i data-tipo="cyclosm-ciclofaixa" /> Ciclofaixa
                </span>
                <span>
                  <i data-tipo="cyclosm-seta" /> Mão única
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="controles-direita">
        <button
          type="button"
          className={`botao-redondo${p.localizando ? ' localizando' : ''}`}
          onClick={p.onMinhaLocalizacao}
          aria-label="Mostrar sua localização"
          title="Mostrar sua localização"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" className="cheio" />
            <circle cx="12" cy="12" r="7.5" />
            <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
          </svg>
        </button>
        <div className="zoom">
          <button type="button" onClick={() => p.onZoom(1)} aria-label="Aproximar" title="Aproximar">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button type="button" onClick={() => p.onZoom(-1)} aria-label="Afastar" title="Afastar">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h14" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
