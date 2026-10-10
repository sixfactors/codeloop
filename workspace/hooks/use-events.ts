'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, API_BASE } from '@/lib/api';
import { QK, isMissing } from '@/hooks/use-api';
import { invalidateCardLists, invalidatePageLists, patchCard, patchPage, removeCard, removePage } from '@/lib/live-cache';
import type { LiveEvent } from '@/lib/types';

// One SSE connection per tab. Each message names one entity; the cache is patched by id, so a card
// moving costs one GET /api/cards/:id and no list refetch. The older stream (`cards` events with
// the whole payload) still works: it invalidates the card lists.
export function useEvents() {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const versions = useRef<Record<string, number | string> | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onCard = async (id: string, kind: 'put' | 'remove') => {
      if (kind === 'remove') { removeCard(qc, id); void qc.invalidateQueries({ queryKey: QK.stats }); return; }
      try {
        const card = await api.card(id);
        qc.setQueryData(QK.card(id), card);
        if (!patchCard(qc, card)) void invalidateCardLists(qc);
      } catch (e) {
        if (isMissing(e)) void invalidateCardLists(qc);
      }
      void qc.invalidateQueries({ queryKey: QK.questions(id) });
      void qc.invalidateQueries({ queryKey: QK.full(id) });
      void qc.invalidateQueries({ queryKey: QK.stats });
    };

    const onPage = async (id: string, kind: 'put' | 'remove') => {
      if (kind === 'remove') { removePage(qc, id); return; }
      try {
        const page = await api.page(id);
        qc.setQueryData(QK.page(id), page);
        if (!patchPage(qc, page)) void invalidatePageLists(qc);
      } catch (e) {
        if (isMissing(e)) void invalidatePageLists(qc);
      }
    };

    const handle = (msg: LiveEvent) => {
      if ('type' in msg && msg.type === 'hello') {
        // After a reconnect the versions may have moved while the tab was away; refetch lists for the repos that did.
        const prev = versions.current;
        versions.current = msg.versions ?? {};
        if (prev) {
          for (const [repo, v] of Object.entries(versions.current)) {
            if (prev[repo] === v) continue;
            if (repo === 'cards') void invalidateCardLists(qc);
            else if (repo === 'pages') void invalidatePageLists(qc);
            else void qc.invalidateQueries({ queryKey: [repo] });
          }
        }
        return;
      }
      if (!('repo' in msg) || !msg.id) return;
      if (msg.repo === 'cards') void onCard(msg.id, msg.kind);
      else if (msg.repo === 'pages') void onPage(msg.id, msg.kind);
      else if (msg.repo === 'lanes') void qc.invalidateQueries({ queryKey: QK.lanes });
      else void qc.invalidateQueries({ queryKey: [msg.repo] });
    };

    const parse = (e: MessageEvent) => {
      setConnected(true);
      try { handle(JSON.parse(e.data) as LiveEvent); } catch { /* not JSON */ }
    };

    const connect = () => {
      es?.close();
      es = new EventSource(`${API_BASE}/api/events`);
      es.onmessage = parse;
      es.addEventListener('change', parse);
      es.addEventListener('hello', parse);
      // Older servers: one `cards` event carrying the whole payload on every change.
      es.addEventListener('cards', () => { setConnected(true); void invalidateCardLists(qc); void qc.invalidateQueries({ queryKey: QK.stats }); });
      es.addEventListener('board', () => setConnected(true));
      es.onerror = () => {
        setConnected(false);
        es?.close();
        timer = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      es?.close();
      if (timer) clearTimeout(timer);
    };
  }, [qc]);

  return connected;
}
