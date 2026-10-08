'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { CardsPayload, CardQuestion } from '@/lib/types';
import { API_BASE, writeHeaders } from '@/lib/api';


export function useCards() {
  const [data, setData] = useState<CardsPayload | null>(null);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    eventSourceRef.current?.close();
    const es = new EventSource(`${API_BASE}/api/events`);
    eventSourceRef.current = es;

    es.addEventListener('cards', (e) => {
      try {
        setData(JSON.parse(e.data) as CardsPayload);
        setConnected(true);
      } catch {
        // Invalid JSON — ignore
      }
    });

    es.onerror = () => {
      setConnected(false);
      es.close();
      eventSourceRef.current = null;
      reconnectTimerRef.current = setTimeout(connect, 2000);
    };
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/cards?include=inbox`)
      .then(r => r.json())
      .then(payload => setData(payload))
      .catch(() => {});
    connect();

    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [connect]);

  // Returns an error message, or null when the engine accepted the decision.
  const decide = useCallback(async (id: string, action: 'approve' | 'reject', note?: string): Promise<string | null> => {
    const res = await fetch(`${API_BASE}/api/cards/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ note }),
    });
    const body = await res.json();
    if (!res.ok) return body.error ?? `Request failed (${res.status})`;
    setData(body as CardsPayload);
    return null;
  }, []);

  // Empty when the server has no questions route yet, so the drawer shows nothing instead of an error.
  const questions = useCallback(async (id: string): Promise<CardQuestion[]> => {
    try {
      const res = await fetch(`${API_BASE}/api/cards/${encodeURIComponent(id)}/questions`);
      // A missing route falls through to the SPA's index.html with a 200, so the type has to be checked too.
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return [];
      const body = await res.json();
      return Array.isArray(body) ? body : Array.isArray(body?.questions) ? body.questions : [];
    } catch {
      return [];
    }
  }, []);

  // Returns an error message, or null when the answer was recorded.
  const answer = useCallback(async (id: string, n: number, body: { text: string } | { accept: true }): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/cards/${encodeURIComponent(id)}/questions/${n}/answer`, {
        method: 'POST',
        headers: writeHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return err.error ?? `Request failed (${res.status})`;
      }
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Request failed';
    }
  }, []);

  return { data, connected, decide, questions, answer };
}
