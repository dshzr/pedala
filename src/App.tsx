import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Map as MapaLibre } from 'maplibre-gl';
import type { LngLat } from './geo/distance';
import { chaveDaPosicao, minhaLocalizacao, nomeDoPonto, type Lugar } from './geo/lugares';
import { MapView } from './map/MapView';
import { ESTADO_INICIAL, reduzir, type Acao } from './route/historico';
import type { Modo } from './route/model';
import { resumir } from './route/stats';
import { useRoteamento } from './routing/useRoteamento';
import { ModoViagem } from './nav/ModoViagem';
import { ControlesMapa } from './ui/ControlesMapa';
import { PainelRotas, type LinhaEndereco } from './ui/PainelRotas';

const NOME_GPS = 'Sua localização';

function ehCelular() {
  return window.matchMedia('(max-width: 720px)').matches;
}

/** Margens para enquadrar a rota sem ficar embaixo dos cartões flutuantes. */
function margens() {
  if (!ehCelular()) return 60;
  const topo = document.querySelector('.cartao-rotas')?.getBoundingClientRect().bottom ?? 160;
  const resumo = document.querySelector('.cartao-resumo')?.getBoundingClientRect();
  const baixo = resumo ? window.innerHeight - resumo.top : 200;
  return { top: topo + 20, bottom: baixo + 20, left: 30, right: 30 };
}

export function App() {
  const [estado, despacharBruto] = useReducer(reduzir, ESTADO_INICIAL);
  const [modo, setModo] = useState<Modo>('auto');
  const [mostrarCiclovias, setMostrarCiclovias] = useState(true);
  const [longe, setLonge] = useState(false);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [destinoEspera, setDestinoEspera] = useState<Lugar | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [minhaPosicao, setMinhaPosicao] = useState<LngLat | null>(null);
  const [localizando, setLocalizando] = useState(false);
  const [viagem, setViagem] = useState<{ simular: boolean } | null>(null);
  const mapaRef = useRef<MapaLibre | null>(null);
  const enquadrar = useRef(false);

  // Funções assíncronas (GPS) precisam do estado mais recente, não do da hora do clique.
  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const despachar = useCallback((a: Acao) => despacharBruto(a), []);

  useRoteamento(estado.rota, despachar);
  const resumo = useMemo(() => resumir(estado.rota), [estado.rota]);
  const { rota } = estado;
  const n = rota.pontos.length;

  const registrarNome = useCallback((pos: LngLat, nome: string) => {
    setNomes((atual) => ({ ...atual, [chaveDaPosicao(pos)]: nome }));
  }, []);

  // Pontos marcados no mapa ou arrastados ganham o nome da rua mais próxima.
  const buscandoNome = useRef(new Set<string>());
  useEffect(() => {
    for (const p of rota.pontos) {
      const chave = chaveDaPosicao(p.pos);
      if (nomes[chave] || buscandoNome.current.has(chave)) continue;
      buscandoNome.current.add(chave);
      nomeDoPonto(p.pos)
        .then((nome) => registrarNome(p.pos, nome ?? 'Ponto no mapa'))
        .catch(() => registrarNome(p.pos, 'Ponto no mapa'))
        .finally(() => buscandoNome.current.delete(chave));
    }
  }, [rota.pontos, nomes, registrarNome]);

  // Depois de escolher partida/destino pela busca, enquadra a rota quando ela chega.
  useEffect(() => {
    const m = mapaRef.current;
    if (!enquadrar.current || !m || resumo.calculando > 0 || n < 2) return;
    enquadrar.current = false;
    const coords = rota.trechos.flatMap((t) => t.resultado?.coords ?? []);
    const todos = coords.length ? coords : rota.pontos.map((p) => p.pos);
    let [o, s, l, no] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of todos) {
      o = Math.min(o, x);
      s = Math.min(s, y);
      l = Math.max(l, x);
      no = Math.max(no, y);
    }
    m.fitBounds([o, s, l, no], { padding: margens(), maxZoom: 16, duration: 800 });
  }, [resumo.calculando, rota, n]);

  useEffect(() => {
    if (n >= 2) setAviso(null);
  }, [n]);

  // Ctrl+Z / Cmd+Z desfaz, fora de campos de texto.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const emCampo = (e.target as HTMLElement).closest('input, textarea');
      if (!emCampo && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        despachar({ tipo: 'desfazer' });
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [despachar]);

  function irPara(pos: LngLat, zoom = 15) {
    mapaRef.current?.flyTo({ center: pos, zoom: Math.max(zoom, mapaRef.current.getZoom()) });
  }

  async function pegarLocalizacao(): Promise<LngLat> {
    setLocalizando(true);
    try {
      const pos = await minhaLocalizacao();
      setMinhaPosicao(pos);
      registrarNome(pos, NOME_GPS);
      return pos;
    } finally {
      setLocalizando(false);
    }
  }

  function definirPartida(pos: LngLat) {
    const antes = estadoRef.current.rota.pontos.length;
    despachar({ tipo: 'origem', pos, modo });
    if (antes === 0 && destinoEspera) {
      despachar({ tipo: 'destino', pos: destinoEspera.pos, modo });
      setDestinoEspera(null);
      enquadrar.current = true;
    } else if (antes >= 2) {
      enquadrar.current = true;
    } else irPara(pos);
  }

  /** Destino escolhido: a rota sai na hora. Sem partida, tenta sair da localização atual. */
  async function definirDestino(lugar: Lugar) {
    registrarNome(lugar.pos, lugar.nome);
    if (estadoRef.current.rota.pontos.length > 0) {
      despachar({ tipo: 'destino', pos: lugar.pos, modo });
      enquadrar.current = true;
      return;
    }
    setDestinoEspera(lugar);
    setAviso('Procurando sua localização para usar como partida…');
    try {
      const origem = await pegarLocalizacao();
      if (estadoRef.current.rota.pontos.length > 0) return;
      despachar({ tipo: 'origem', pos: origem, modo });
      despachar({ tipo: 'destino', pos: lugar.pos, modo });
      setDestinoEspera(null);
      enquadrar.current = true;
    } catch {
      setAviso('Escolha de onde você vai sair: digite a partida ou clique no mapa.');
      irPara(lugar.pos);
    }
  }

  function aoEscolher(linha: LinhaEndereco, lugar: Lugar) {
    registrarNome(lugar.pos, lugar.nome);
    if (linha.papel === 'origem') definirPartida(lugar.pos);
    else if (linha.papel === 'destino') void definirDestino(lugar);
    else if (linha.indice !== undefined) {
      despachar({ tipo: 'mover', i: linha.indice, pos: lugar.pos });
      enquadrar.current = true;
    }
  }

  async function aoLocalizacao(linha: LinhaEndereco) {
    try {
      const pos = await pegarLocalizacao();
      aoEscolher(linha, { nome: NOME_GPS, detalhe: '', pos });
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Não foi possível pegar sua localização.');
    }
  }

  function aoClicarMapa(pos: LngLat) {
    if (n === 0 && destinoEspera) definirPartida(pos);
    else despachar({ tipo: 'adicionar', pos, modo });
  }

  function aoMenu(acao: 'origem' | 'destino' | 'parada', pos: LngLat) {
    if (acao === 'origem') definirPartida(pos);
    else if (acao === 'parada') despachar({ tipo: 'parada', pos, modo });
    else {
      const nome = nomes[chaveDaPosicao(pos)] ?? 'Ponto no mapa';
      void definirDestino({ nome, detalhe: '', pos });
    }
  }

  const nomeDe = (pos: LngLat) => nomes[chaveDaPosicao(pos)] ?? 'Ponto no mapa';
  const linhas: LinhaEndereco[] = [
    { chave: 'origem', papel: 'origem', valor: n ? nomeDe(rota.pontos[0].pos) : '', indice: n ? 0 : undefined },
    ...rota.pontos.slice(1, -1).map<LinhaEndereco>((p, k) => ({
      chave: p.id,
      papel: 'parada',
      valor: nomeDe(p.pos),
      indice: k + 1,
    })),
    n >= 2
      ? { chave: 'destino', papel: 'destino', valor: nomeDe(rota.pontos[n - 1].pos), indice: n - 1 }
      : { chave: 'destino', papel: 'destino', valor: destinoEspera?.nome ?? '' },
  ];

  const centro = mapaRef.current?.getCenter();

  const nomeDestino = n >= 2 ? nomeDe(rota.pontos[n - 1].pos) : '';
  const podeIniciar = n >= 2 && resumo.calculando === 0 && resumo.erros === 0;

  return (
    <div className={`app${viagem ? ' viajando' : ''}`}>
      {!viagem && (
      <PainelRotas
        linhas={linhas}
        perto={centro ? [centro.lng, centro.lat] : undefined}
        resumo={resumo}
        temRota={n >= 2}
        aviso={aviso}
        modo={modo}
        onModo={setModo}
        onEscolher={aoEscolher}
        onLocalizacao={(l) => void aoLocalizacao(l)}
        onRemover={(i) => despachar({ tipo: 'remover', i })}
        onParada={(lugar) => {
          registrarNome(lugar.pos, lugar.nome);
          despachar({ tipo: 'parada', pos: lugar.pos, modo });
          enquadrar.current = true;
        }}
        onInverter={() => despachar({ tipo: 'inverter' })}
        podeIniciar={podeIniciar}
        onIniciar={(simular) => setViagem({ simular })}
        podeDesfazer={estado.passado.length > 0}
        onDesfazer={() => despachar({ tipo: 'desfazer' })}
        onLimpar={() => {
          despachar({ tipo: 'limpar' });
          setDestinoEspera(null);
          setAviso(null);
        }}
      />
      )}
      <main className="area-mapa">
        <MapView
          rota={rota}
          mostrarCiclovias={mostrarCiclovias}
          mapaRef={mapaRef}
          minhaPosicao={minhaPosicao}
          onClique={aoClicarMapa}
          onMover={(i, pos) => despachar({ tipo: 'mover', i, pos })}
          onRemover={(i) => despachar({ tipo: 'remover', i })}
          onAlternar={(i) => despachar({ tipo: 'alternar', i })}
          onTentar={(i) => despachar({ tipo: 'tentar', i })}
          onLonge={setLonge}
          onMenu={aoMenu}
          viajando={!!viagem}
        />
        {viagem && (
          <ModoViagem
            rota={rota}
            mapaRef={mapaRef}
            simular={viagem.simular}
            nomeDestino={nomeDestino}
            onSair={() => setViagem(null)}
            onSimular={() => setViagem({ simular: true })}
            onRecomecar={(pos, proximo) => {
              registrarNome(pos, NOME_GPS);
              despachar({ tipo: 'recomecar', pos, proximo });
            }}
          />
        )}
        {!viagem && (
        <ControlesMapa
          mostrarCiclovias={mostrarCiclovias}
          onCiclovias={setMostrarCiclovias}
          longe={longe}
          localizando={localizando}
          onZoom={(d) => mapaRef.current?.easeTo({ zoom: mapaRef.current.getZoom() + d, duration: 250 })}
          onMinhaLocalizacao={async () => {
            try {
              irPara(await pegarLocalizacao(), 16);
            } catch (e) {
              setAviso(e instanceof Error ? e.message : 'Não foi possível pegar sua localização.');
            }
          }}
        />
        )}
      </main>
    </div>
  );
}
