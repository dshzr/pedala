# Pedala

Mapa para montar rotas de bicicleta que preferem ciclovias. Só front-end: não tem login, banco nem chave de API.

## Rodar

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # testes da lógica (rota, resumo, leitura do roteador)
npm run build    # versão estática em dist/
```

## Como usar

- Digite a partida e o destino no painel. A rota sai assim que o destino é escolhido.
- Ou clique no mapa: o primeiro clique é a partida, o segundo o destino, os seguintes viram paradas.
- Botão direito no mapa: "Sair daqui", "Adicionar parada aqui", "Chegar aqui".
- Arraste um ponto para mudar o lugar. Clique num trecho para trocá-lo entre "pelas ciclovias" e "à mão" (linha reta).
- Ctrl/Cmd+Z desfaz.
- **Iniciar** abre o modo viagem (usa o GPS do celular; mantém a tela acesa). **Simular** mostra a viagem andando sozinha pela rota. Sem áudio.

## Instalar no celular (PWA)

O site é um app instalável. Precisa estar publicado com https (o GPS e a instalação não funcionam em http).

- **Android (Chrome):** menu ⋮ → "Instalar app".
- **iPhone (Safari):** Compartilhar → "Adicionar à Tela de Início".

Os pedaços de mapa já vistos ficam guardados no celular por 30 dias. Rotas e endereços sempre precisam de internet. Os ícones saem de `public/icone.svg`; para refazê-los: `npx pwa-assets-generator`.

## Serviços externos

| Para quê | Serviço |
|---|---|
| Mapa de fundo | OpenFreeMap (estilo positron) |
| Camada de ciclovias | CyclOSM lite |
| Cálculo da rota | BRouter público, com o perfil `src/routing/prefer-ciclovia.brf` |
| Endereços e sugestões | Photon (komoot) |

Para usar um BRouter próprio, defina `VITE_BROUTER_URL` num `.env.local`.

## Onde está cada coisa

- `src/route/` — modelo da rota (pontos, trechos, desfazer) e o resumo (km, % em ciclovia, tempo).
- `src/routing/` — perfil do BRouter, cliente HTTP e leitura da resposta em pedaços por tipo de via.
- `src/map/MapView.tsx` — mapa, camadas, marcadores, balões e menu do botão direito.
- `src/ui/` — painel de rotas, campo de endereço com sugestões e controles do mapa.
