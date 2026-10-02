'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { CardsPayload } from '@/lib/types';
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
    fetch(`${API_BASE}/api/cards`)
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

  return { data, connected, decide };
}
