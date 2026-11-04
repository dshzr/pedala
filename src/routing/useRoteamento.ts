import { useEffect, useRef, type Dispatch } from 'react';
import type { Acao } from '../route/historico';
import type { Rota } from '../route/model';
import { calcularTrecho } from './brouter';

/**
 * Pede ao roteador cada trecho automático que está "calculando" e grava a resposta.
 * Cancela o pedido de um trecho que deixou de existir (ponto movido, removido, desfeito).
 */
export function useRoteamento(rota: Rota, despachar: Dispatch<Acao>) {
  const emAndamento = useRef(new Map<string, AbortController>());

  useEffect(() => {
    const atuais = new Set(rota.trechos.map((t) => t.id));
    for (const [id, controle] of emAndamento.current) {
      if (!atuais.has(id)) {
        controle.abort();
        emAndamento.current.delete(id);
      }
    }

    rota.trechos.forEach((t, i) => {
      if (t.estado !== 'calculando' || emAndamento.current.has(t.id)) return;
      const controle = new AbortController();
      emAndamento.current.set(t.id, controle);
      calcularTrecho(rota.pontos[i].pos, rota.pontos[i + 1].pos, controle.signal)
        .then((resultado) => despachar({ tipo: 'resultado', id: t.id, resultado }))
        .catch((e: unknown) => {
          if (controle.signal.aborted) return;
          const mensagem = e instanceof Error ? e.message : String(e);
          despachar({
            tipo: 'erro',
            id: t.id,
            erro: /fetch|network/i.test(mensagem) ? 'Sem conexão com o roteador.' : mensagem,
          });
        })
        .finally(() => {
          if (emAndamento.current.get(t.id) === controle) emAndamento.current.delete(t.id);
        });
    });
  }, [rota, despachar]);

  useEffect(() => {
    const pedidos = emAndamento.current;
    return () => {
      for (const c of pedidos.values()) c.abort();
      pedidos.clear();
    };
  }, []);
}
