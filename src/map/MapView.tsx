import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  Map as MapaLibre,
  Marker,
  Popup,
  ScaleControl,
  setWorkerUrl,
  type GeoJSONSource,
  type LngLatLike,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import urlDoWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { LngLat } from '../geo/distance';
import type { Rota } from '../route/model';
import { COR_TRECHO } from '../cores';

// O MapLibre 6 procura o worker ao lado do próprio módulo, o que quebra depois de empacotado.
// Com ?url o Vite copia o arquivo para a versão de produção e informa o endereço.
setWorkerUrl(urlDoWorker);

const ESTILO = 'https://tiles.openfreemap.org/styles/positron';
const INICIO: { center: LngLat; zoom: number } = { center: [-46.6555, -23.5614], zoom: 14 };
const VAZIO: FeatureCollection = { type: 'FeatureCollection', features: [] };
/**
 * Camada de ciclovias: imagens transparentes do CyclOSM "lite", só com a infraestrutura
 * de bicicleta (ciclovias, ciclofaixas, setas de mão única), desenhadas sobre o mapa.
 */
const TILES_CICLOVIAS = ['a', 'b', 'c'].map(
  (s) => `https://${s}.tile-cyclosm.openstreetmap.fr/cyclosm-lite/{z}/{x}/{y}.png`,
);
export const ZOOM_CICLOVIAS = 12;

export interface MapViewProps {
  rota: Rota;
  mostrarCiclovias: boolean;
  mapaRef: MutableRefObject<MapaLibre | null>;
  onClique: (pos: LngLat) => void;
  onMover: (i: number, pos: LngLat) => void;
  onRemover: (i: number) => void;
  onAlternar: (i: number) => void;
  onTentar: (i: number) => void;
  /** Avisa quando o mapa está afastado demais para mostrar as ciclovias. */
  onLonge: (longe: boolean) => void;
  /** Menu do botão direito: definir partida, destino ou parada naquele lugar. */
  onMenu: (acao: 'origem' | 'destino' | 'parada', pos: LngLat) => void;
  /** Posição do GPS, mostrada como um ponto azul. */
  minhaPosicao: LngLat | null;
  /** Durante a viagem o mapa não edita a rota (nada de cliques acidentais). */
  viajando: boolean;
}

const PINO =
  '<svg viewBox="0 0 24 34" aria-hidden="true"><path d="M12 1C5.9 1 1 5.8 1 11.9 1 20 12 33 12 33s11-13 11-21.1C23 5.8 18.1 1 12 1z"/><circle cx="12" cy="12" r="4.2" fill="#fff" stroke="none"/></svg>';

function km(metros: number) {
  return metros < 1000 ? `${Math.round(metros)} m` : `${(metros / 1000).toFixed(1).replace('.', ',')} km`;
}

function elemento<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classe: string,
  texto?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = classe;
  if (texto) el.textContent = texto;
  return el;
}

function prepararCamadas(m: MapaLibre) {
  const camadas = m.getStyle().layers ?? [];
  // Pontos de interesse (lojas, restaurantes...) só atrapalham aqui.
  for (const l of camadas) {
    if (l.id.includes('poi')) m.setLayoutProperty(l.id, 'visibility', 'none');
  }
  const primeiroRotulo = camadas.find((l) => l.type === 'symbol')?.id;
  const largura = (z12: number, z16: number) =>
    ['interpolate', ['linear'], ['zoom'], 12, z12, 16, z16] as unknown as number;
  const arredondado = { 'line-cap': 'round', 'line-join': 'round' } as const;

  m.addSource('ciclovias', {
    type: 'raster',
    tiles: TILES_CICLOVIAS,
    tileSize: 256,
    minzoom: ZOOM_CICLOVIAS,
    maxzoom: 19,
    attribution: '<a href="https://www.cyclosm.org" target="_blank" rel="noreferrer">CyclOSM</a>',
  });
  m.addLayer({ id: 'ciclovias', type: 'raster', source: 'ciclovias', paint: { 'raster-opacity': 0.85 } }, primeiroRotulo);

  m.addSource('rota', { type: 'geojson', data: VAZIO });
  const pronto = ['==', ['get', 'estado'], 'pronto'];
  const naoManual = ['!=', ['get', 'categoria'], 'manual'];
  m.addLayer({
    id: 'rota-calculando',
    type: 'line',
    source: 'rota',
    filter: ['==', ['get', 'estado'], 'calculando'],
    layout: arredondado,
    paint: { 'line-color': '#334155', 'line-width': 3, 'line-dasharray': [0.5, 2], 'line-opacity': 0.7 },
  });
  m.addLayer({
    id: 'rota-erro',
    type: 'line',
    source: 'rota',
    filter: ['==', ['get', 'estado'], 'erro'],
    paint: { 'line-color': COR_TRECHO.trafego, 'line-width': 3, 'line-dasharray': [2, 1.5] },
  });
  m.addLayer({
    id: 'rota-contorno',
    type: 'line',
    source: 'rota',
    filter: ['all', pronto, naoManual] as never,
    layout: arredondado,
    paint: { 'line-color': '#0d1b2a', 'line-width': largura(6, 12) },
  });
  m.addLayer({
    id: 'rota-linha',
    type: 'line',
    source: 'rota',
    filter: ['all', pronto, naoManual] as never,
    layout: arredondado,
    paint: {
      'line-color': [
        'match',
        ['get', 'categoria'],
        'ciclovia',
        COR_TRECHO.ciclovia,
        'calma',
        COR_TRECHO.calma,
        COR_TRECHO.trafego,
      ],
      'line-width': largura(3.5, 7.5),
    },
  });
  m.addLayer({
    id: 'rota-manual-contorno',
    type: 'line',
    source: 'rota',
    filter: ['all', pronto, ['==', ['get', 'categoria'], 'manual']] as never,
    layout: arredondado,
    paint: { 'line-color': '#ffffff', 'line-width': largura(6, 10) },
  });
  m.addLayer({
    id: 'rota-manual',
    type: 'line',
    source: 'rota',
    filter: ['all', pronto, ['==', ['get', 'categoria'], 'manual']] as never,
    paint: { 'line-color': COR_TRECHO.manual, 'line-width': largura(3, 5), 'line-dasharray': [1.6, 1] },
  });
  // Faixa invisível e larga para facilitar o clique num trecho.
  m.addLayer({
    id: 'rota-alvo',
    type: 'line',
    source: 'rota',
    paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 20 },
  });
}

export function MapView(props: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLibre | null>(null);
  const marcadores = useRef(new Map<string, Marker>());
  const popup = useRef<Popup | null>(null);
  const [carregado, setCarregado] = useState(false);

  // Os ouvintes do mapa são criados uma vez; lêem sempre as props mais recentes por aqui.
  const atual = useRef(props);
  atual.current = props;

  function fecharPopup() {
    popup.current?.remove();
    popup.current = null;
  }

  function abrirPopup(onde: LngLatLike, conteudo: HTMLElement) {
    const m = mapa.current;
    if (!m) return;
    fecharPopup();
    popup.current = new Popup({ closeOnClick: false, maxWidth: '260px', className: 'popup-pedala', offset: 14 })
      .setLngLat(onde)
      .setDOMContent(conteudo)
      .addTo(m);
  }

  function botao(texto: string, acao: () => void, secundario = false) {
    const b = elemento('button', secundario ? 'popup-botao secundario' : 'popup-botao', texto);
    b.type = 'button';
    b.addEventListener('click', () => {
      fecharPopup();
      acao();
    });
    return b;
  }

  function conteudoTrecho(i: number): HTMLElement {
    const t = atual.current.rota.trechos[i];
    const caixa = elemento('div', 'popup');
    caixa.append(elemento('strong', 'popup-titulo', `Trecho ${i + 1}`));
    const descricao = t.modo === 'auto' ? 'Calculado pelas ciclovias' : 'Traçado à mão, em linha reta';
    const distancia = t.estado === 'pronto' && t.resultado ? ` · ${km(t.resultado.distancia)}` : '';
    caixa.append(elemento('span', 'popup-meta', descricao + distancia));
    if (t.estado === 'erro' && t.erro) caixa.append(elemento('p', 'popup-erro', t.erro));
    if (t.estado === 'erro') caixa.append(botao('Tentar de novo', () => atual.current.onTentar(i)));
    caixa.append(
      botao(
        t.modo === 'auto' ? 'Traçar à mão' : 'Calcular pelas ciclovias',
        () => atual.current.onAlternar(i),
        t.estado === 'erro',
      ),
    );
    return caixa;
  }

  function conteudoPonto(i: number): HTMLElement {
    const total = atual.current.rota.pontos.length;
    const nome = i === 0 ? 'Partida' : i === total - 1 ? 'Destino' : `Parada ${i}`;
    const caixa = elemento('div', 'popup');
    caixa.append(elemento('strong', 'popup-titulo', nome));
    caixa.append(elemento('span', 'popup-meta', 'Arraste o ponto para mudar o lugar.'));
    caixa.append(botao('Remover ponto', () => atual.current.onRemover(i), true));
    return caixa;
  }

  function criarMarcador(id: string, pos: LngLat): Marker {
    const m = mapa.current!;
    const el = elemento('div', 'marcador');
    el.append(elemento('span', 'marcador-disco'));
    const pino = elemento('span', 'marcador-pino');
    pino.innerHTML = PINO;
    el.append(pino);
    const marcador = new Marker({ element: el, draggable: true }).setLngLat(pos).addTo(m);
    let arrastouEm = 0;
    const indice = () => atual.current.rota.pontos.findIndex((p) => p.id === id);
    marcador.on('dragstart', () => {
      fecharPopup();
      el.classList.add('arrastando');
    });
    marcador.on('dragend', () => {
      arrastouEm = Date.now();
      el.classList.remove('arrastando');
      const i = indice();
      const ll = marcador.getLngLat();
      if (i >= 0) atual.current.onMover(i, [ll.lng, ll.lat]);
    });
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (atual.current.viajando || Date.now() - arrastouEm < 400) return;
      const i = indice();
      if (i >= 0) abrirPopup(marcador.getLngLat(), conteudoPonto(i));
    });
    return marcador;
  }

  // Cria o mapa uma vez.
  useEffect(() => {
    const m = new MapaLibre({
      container: container.current!,
      style: ESTILO,
      center: INICIO.center,
      zoom: INICIO.zoom,
      attributionControl: { compact: true },
    });
    mapa.current = m;
    atual.current.mapaRef.current = m;
    m.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right');

    const avisarZoom = () => atual.current.onLonge(m.getZoom() < ZOOM_CICLOVIAS);
    m.on('load', () => {
      prepararCamadas(m);
      setCarregado(true);
      avisarZoom();
    });
    m.on('zoomend', avisarZoom);

    m.on('click', (e) => {
      if (atual.current.viajando) return;
      const alvo = e.originalEvent.target as HTMLElement | null;
      if (alvo?.closest?.('.marcador, .maplibregl-popup')) return;
      // Com um balão aberto, o clique só fecha o balão.
      if (popup.current) {
        fecharPopup();
        return;
      }
      const tocados = m.getLayer('rota-alvo')
        ? m.queryRenderedFeatures(e.point, { layers: ['rota-alvo'] })
        : [];
      if (tocados.length) {
        const i = Number(tocados[0].properties?.trecho);
        if (Number.isInteger(i) && i < atual.current.rota.trechos.length) {
          abrirPopup(e.lngLat, conteudoTrecho(i));
          return;
        }
      }
      atual.current.onClique([e.lngLat.lng, e.lngLat.lat]);
    });
    // Menu do botão direito (ou toque longo), como nos apps de mapa.
    m.on('contextmenu', (e) => {
      e.preventDefault();
      if (atual.current.viajando) return;
      const pos: LngLat = [e.lngLat.lng, e.lngLat.lat];
      const n = atual.current.rota.pontos.length;
      const caixa = elemento('div', 'popup menu');
      const item = (texto: string, acao: 'origem' | 'destino' | 'parada') => {
        const b = elemento('button', 'menu-item', texto);
        b.type = 'button';
        b.addEventListener('click', () => {
          fecharPopup();
          atual.current.onMenu(acao, pos);
        });
        caixa.append(b);
      };
      item('Sair daqui', 'origem');
      if (n >= 2) item('Adicionar parada aqui', 'parada');
      item('Chegar aqui', 'destino');
      caixa.append(elemento('span', 'menu-coordenadas', `${pos[1].toFixed(5)}, ${pos[0].toFixed(5)}`));
      fecharPopup();
      popup.current = new Popup({ closeOnClick: false, closeButton: false, className: 'popup-pedala popup-menu', anchor: 'top-left', offset: 4 })
        .setLngLat(e.lngLat)
        .setDOMContent(caixa)
        .addTo(m);
    });
    m.on('movestart', () => {
      if (popup.current?.getElement()?.classList.contains('popup-menu')) fecharPopup();
    });

    m.on('mouseenter', 'rota-alvo', () => (m.getCanvas().style.cursor = 'pointer'));
    m.on('mouseleave', 'rota-alvo', () => (m.getCanvas().style.cursor = ''));

    const lista = marcadores.current;
    return () => {
      for (const mk of lista.values()) mk.remove();
      lista.clear();
      m.remove();
      mapa.current = null;
      atual.current.mapaRef.current = null;
      setCarregado(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Liga e desliga a camada de ciclovias.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !carregado) return;
    m.setLayoutProperty('ciclovias', 'visibility', props.mostrarCiclovias ? 'visible' : 'none');
  }, [props.mostrarCiclovias, carregado]);

  // Desenha a rota e sincroniza os marcadores.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !carregado) return;
    const { rota } = props;

    const features: Feature<LineString>[] = [];
    rota.trechos.forEach((t, i) => {
      if (t.estado === 'pronto' && t.resultado) {
        for (const p of t.resultado.pedacos) {
          features.push({
            type: 'Feature',
            properties: { categoria: p.categoria, trecho: i, estado: 'pronto' },
            geometry: { type: 'LineString', coordinates: p.coords },
          });
        }
      } else {
        features.push({
          type: 'Feature',
          properties: { categoria: 'pendente', trecho: i, estado: t.estado },
          geometry: { type: 'LineString', coordinates: [rota.pontos[i].pos, rota.pontos[i + 1].pos] },
        });
      }
    });
    (m.getSource('rota') as GeoJSONSource).setData({ type: 'FeatureCollection', features });

    const vivos = new Set(rota.pontos.map((p) => p.id));
    for (const [id, mk] of marcadores.current) {
      if (!vivos.has(id)) {
        mk.remove();
        marcadores.current.delete(id);
      }
    }
    rota.pontos.forEach((p, i) => {
      let mk = marcadores.current.get(p.id);
      if (!mk) {
        mk = criarMarcador(p.id, p.pos);
        marcadores.current.set(p.id, mk);
      }
      mk.setLngLat(p.pos);
      const el = mk.getElement();
      const papel = i === 0 ? 'inicio' : i === rota.pontos.length - 1 ? 'fim' : 'meio';
      el.dataset.papel = papel;
      el.title = papel === 'inicio' ? 'Partida' : papel === 'fim' ? 'Destino' : `Parada ${i}`;
      el.querySelector('.marcador-disco')!.textContent = papel === 'meio' ? String(i) : '';
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.rota, carregado]);

  // Na viagem os pontos não podem ser arrastados e o mapa se ajusta ao novo tamanho.
  useEffect(() => {
    for (const mk of marcadores.current.values()) mk.setDraggable(!props.viajando);
    if (props.viajando) fecharPopup();
    const m = mapa.current;
    if (m) requestAnimationFrame(() => m.resize());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.viajando, props.rota]);

  // Ponto azul da localização do usuário.
  const meuPonto = useRef<Marker | null>(null);
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    if (!props.minhaPosicao) {
      meuPonto.current?.remove();
      meuPonto.current = null;
      return;
    }
    if (!meuPonto.current) {
      meuPonto.current = new Marker({ element: elemento('div', 'meu-ponto') }).setLngLat(props.minhaPosicao).addTo(m);
    } else meuPonto.current.setLngLat(props.minhaPosicao);
  }, [props.minhaPosicao, carregado]);

  return <div ref={container} className="mapa" />;
}
