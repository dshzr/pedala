import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Marker, type Map as MapaLibre } from 'maplibre-gl';
import type { LngLat } from '../geo/distance';
import { mensagemErroLocalizacao, nomeDoPonto } from '../geo/lugares';
import type { Rota } from '../route/model';
import { formatarTempo } from '../ui/PainelRotas';
import { IconeManobra } from './IconeManobra';
import {
  acompanhar,
  distanciaFalada,
  montarPercurso,
  pontoNaDistancia,
  type EstadoViagem,
} from './percurso';

interface Props {
  rota: Rota;
  mapaRef: MutableRefObject<MapaLibre | null>;
  /** Anda sozinho pela rota, para ver a navegação sem sair de casa. */
  simular: boolean;
  nomeDestino: string;
  onSair: () => void;
  onSimular: () => void;
  /** Saiu da rota: recalcular a partir da posição atual até o próximo ponto. */
  onRecomecar: (pos: LngLat, proximoPonto: number) => void;
}

/** Leituras seguidas fora da rota antes de recalcular (evita recalcular por um GPS ruim). */
const LEITURAS_PARA_RECALCULAR = 3;
const VELOCIDADE_SIMULADA = 6; // m/s ≈ 22 km/h
const PASSO_SIMULACAO_MS = 500;

function horaDeChegada(segundos: number) {
  return new Date(Date.now() + segundos * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function distanciaRestante(m: number) {
  const d = distanciaFalada(m);
  return `${d.numero} ${d.unidade}`;
}

/** Diferença entre ângulos, para suavizar o giro do mapa. */
function suavizarRumo(atual: number, alvo: number, fator = 0.5) {
  const delta = ((alvo - atual + 540) % 360) - 180;
  return (atual + delta * fator + 360) % 360;
}

export function ModoViagem(p: Props) {
  const percurso = useMemo(() => montarPercurso(p.rota), [p.rota]);
  const [estado, setEstado] = useState<EstadoViagem | null>(null);
  const [seguindo, setSeguindo] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [semGps, setSemGps] = useState<string | null>(null);
  const [velocidade, setVelocidade] = useState<number | null>(null);
  const [nomesRua, setNomesRua] = useState<Record<number, string>>({});

  const progresso = useRef(0);
  const leiturasFora = useRef(0);
  const recalculando = useRef(false);
  const rumoCamera = useRef(0);
  const seta = useRef<Marker | null>(null);
  const ultimaPos = useRef<LngLat | null>(null);
  const atual = useRef({ percurso, seguindo, p });
  atual.current = { percurso, seguindo, p };

  // Nova rota (recalculada): recomeça o acompanhamento do zero.
  useEffect(() => {
    if (!percurso) return;
    progresso.current = 0;
    leiturasFora.current = 0;
    if (recalculando.current) {
      recalculando.current = false;
      setAviso(null);
    }
    if (ultimaPos.current) aoMover(ultimaPos.current, null, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [percurso]);

  /** Recebe cada posição (GPS ou simulação) e atualiza tudo. */
  function aoMover(pos: LngLat, rumoGps: number | null, vel: number | null) {
    const { percurso: perc, seguindo: seguir } = atual.current;
    const m = p.mapaRef.current;
    const anterior = ultimaPos.current;
    ultimaPos.current = pos;
    setVelocidade(vel);
    if (!m) return;

    let posMostrada = pos;
    let rumo = rumoGps ?? rumoCamera.current;
    if (perc && !recalculando.current) {
      const e = acompanhar(perc, pos, progresso.current);
      if (e.foraDaRota) {
        leiturasFora.current++;
        if (leiturasFora.current >= LEITURAS_PARA_RECALCULAR) {
          recalculando.current = true;
          leiturasFora.current = 0;
          setAviso('Recalculando rota…');
          atual.current.p.onRecomecar(pos, e.proximoPonto);
        }
        if (rumoGps === null && anterior) {
          const dx = pos[0] - anterior[0];
          const dy = pos[1] - anterior[1];
          if (Math.abs(dx) + Math.abs(dy) > 1e-6) rumo = (Math.atan2(dx, dy) * 180) / Math.PI;
        }
      } else {
        leiturasFora.current = 0;
        progresso.current = e.progresso;
        posMostrada = e.pontoNaRota;
        rumo = e.rumo;
      }
      setEstado(e);
    }

    rumoCamera.current = suavizarRumo(rumoCamera.current, rumo, 0.6);
    if (!seta.current) {
      const el = document.createElement('div');
      el.className = 'seta-viagem';
      el.innerHTML =
        '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18"/><path d="M20 8l9 22-9-5-9 5z"/></svg>';
      seta.current = new Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' })
        .setLngLat(posMostrada)
        .addTo(m);
    }
    seta.current.setLngLat(posMostrada).setRotation(rumo);

    if (seguir) {
      const altura = m.getContainer().clientHeight;
      m.easeTo({
        center: posMostrada,
        bearing: rumoCamera.current,
        pitch: 55,
        zoom: 17.3,
        padding: { top: altura * 0.42, bottom: 90, left: 0, right: 0 },
        duration: 900,
        easing: (t) => t,
      });
    }
  }

  // Fonte de posições: GPS de verdade ou simulação.
  useEffect(() => {
    if (p.simular) {
      setSemGps(null);
      let distancia = 0;
      const id = window.setInterval(() => {
        const perc = atual.current.percurso;
        if (!perc) return;
        distancia = Math.min(distancia + (VELOCIDADE_SIMULADA * PASSO_SIMULACAO_MS) / 1000, perc.total);
        const { pos } = pontoNaDistancia(perc, distancia);
        aoMover(pos, null, VELOCIDADE_SIMULADA * 3.6);
      }, PASSO_SIMULACAO_MS);
      return () => window.clearInterval(id);
    }
    if (!navigator.geolocation) {
      setSemGps('Este navegador não informa a localização.');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (g) => {
        setSemGps(null);
        const vel = g.coords.speed !== null && g.coords.speed >= 0 ? g.coords.speed * 3.6 : null;
        // O rumo do GPS só vale com a bicicleta andando.
        const rumo = g.coords.heading !== null && (g.coords.speed ?? 0) > 1 ? g.coords.heading : null;
        aoMover([g.coords.longitude, g.coords.latitude], rumo, vel);
      },
      // Falha passageira no meio da viagem não acende o alerta; permissão negada sim.
      (erro) => {
        if (erro.code === 1 || !ultimaPos.current) setSemGps(mensagemErroLocalizacao(erro.code));
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.simular]);

  // Começo: câmera na partida. Fim: devolve o mapa ao normal.
  useEffect(() => {
    const m = p.mapaRef.current;
    const perc = atual.current.percurso;
    if (perc) {
      if (m && !ultimaPos.current) {
        m.easeTo({ center: perc.coords[0], zoom: 17, pitch: 55, bearing: pontoNaDistancia(perc, 5).rumo, duration: 800 });
      }
    }
    const pararSeguir = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) setSeguindo(false);
    };
    m?.on('movestart', pararSeguir);
    return () => {
      m?.off('movestart', pararSeguir);
      seta.current?.remove();
      seta.current = null;
      m?.easeTo({ pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 600 });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mantém a tela acesa durante a viagem.
  useEffect(() => {
    let trava: WakeLockSentinel | null = null;
    const pedir = async () => {
      try {
        trava = (await navigator.wakeLock?.request('screen')) ?? null;
      } catch {
        trava = null;
      }
    };
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void pedir();
    };
    void pedir();
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar);
      void trava?.release();
    };
  }, []);

  // Nome da rua da próxima manobra (busca uma vez por manobra).
  const proxima = estado?.proxima ?? percurso?.manobras[0] ?? null;
  useEffect(() => {
    if (!proxima || !percurso || proxima.tipo === 'chegada' || proxima.tipo === 'parada') return;
    const chave = Math.round(proxima.dist);
    if (nomesRua[chave] !== undefined) return;
    setNomesRua((n) => ({ ...n, [chave]: '' }));
    const depoisDaCurva = pontoNaDistancia(percurso, proxima.dist + 25).pos;
    nomeDoPonto(depoisDaCurva)
      .then((nome) => setNomesRua((n) => ({ ...n, [chave]: nome ?? '' })))
      .catch(() => undefined);
  }, [proxima, percurso, nomesRua]);

  const distProxima = estado ? estado.distProxima : proxima?.dist ?? 0;
  const restante = estado?.restante ?? percurso?.total ?? 0;
  const tempoRestante = estado?.tempoRestante ?? percurso?.tempoTotal ?? 0;
  const d = distanciaFalada(distProxima);
  const rua =
    proxima?.tipo === 'chegada' ? p.nomeDestino : proxima ? nomesRua[Math.round(proxima.dist)] : '';
  const instrucao =
    proxima?.tipo === 'chegada' ? 'Destino' : proxima?.tipo === 'parada' ? proxima.texto : proxima?.texto ?? 'Siga a rota';

  return (
    <div className="viagem">
      <div className="viagem-topo">
        <div className={`viagem-banner${aviso ? ' recalculando' : ''}`}>
          {aviso ? (
            <p className="viagem-recalculando">{aviso}</p>
          ) : (
            <>
              <IconeManobra tipo={proxima?.tipo ?? 'reto'} className="viagem-seta" />
              <div className="viagem-instrucao">
                <p className="viagem-dist">
                  {d.numero}
                  <small>{d.unidade}</small>
                </p>
                <p className="viagem-texto">
                  {instrucao}
                  {rua && proxima?.tipo !== 'chegada' ? <span> · {rua}</span> : null}
                </p>
                {proxima?.tipo === 'chegada' && rua && <p className="viagem-rua">{rua}</p>}
              </div>
            </>
          )}
        </div>
        {!aviso && estado?.depois && (
          <div className="viagem-depois">
            Depois
            <IconeManobra tipo={estado.depois.tipo} className="viagem-depois-seta" />
          </div>
        )}
      </div>

      {semGps && !p.simular && (
        <div className="viagem-alerta">
          <p>{semGps} Ou veja uma simulação.</p>
          <button type="button" onClick={p.onSimular}>
            Simular trajeto
          </button>
        </div>
      )}

      {velocidade !== null && (
        <div className="viagem-velocidade" aria-label={`${Math.round(velocidade)} quilômetros por hora`}>
          <strong>{Math.round(velocidade)}</strong>
          <span>km/h</span>
        </div>
      )}

      {!seguindo && (
        <button type="button" className="viagem-centralizar" onClick={() => setSeguindo(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3l7 17-7-4-7 4z" />
          </svg>
          Centralizar
        </button>
      )}

      {estado?.chegou ? (
        <div className="viagem-chegada">
          <IconeManobra tipo="chegada" className="viagem-chegada-icone" />
          <p className="viagem-chegada-titulo">Você chegou</p>
          {p.nomeDestino && <p className="viagem-chegada-lugar">{p.nomeDestino}</p>}
          <button type="button" onClick={p.onSair}>
            Encerrar
          </button>
        </div>
      ) : (
        <div className="viagem-rodape">
          <button type="button" className="viagem-botao sair" onClick={p.onSair} aria-label="Encerrar viagem">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <div className="viagem-tempos">
            <strong>{formatarTempo(tempoRestante)}</strong>
            <span>
              {distanciaRestante(restante)} · {horaDeChegada(tempoRestante)}
              {p.simular ? ' · simulação' : ''}
            </span>
          </div>
          {/* Espaço do mesmo tamanho do botão de sair, para o tempo ficar centralizado. */}
          <span className="viagem-botao vazio" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
