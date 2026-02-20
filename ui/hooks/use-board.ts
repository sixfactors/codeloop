'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Board, Task, TaskStatus } from '@/lib/types';

const API_BASE = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.host}`
  : '';

export function useBoard() {
  const [board, setBoard] = useState<Board | null>(null);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`${API_BASE}/api/events`);
    eventSourceRef.current = es;

    es.addEventListener('board', (e) => {
      try {
        const data = JSON.parse(e.data) as Board;
        setBoard(data);
        setConnected(true);
      } catch {
        // Invalid JSON — ignore
      }
    });

    es.onerror = () => {
      setConnected(false);
      es.close();
      eventSourceRef.current = null;

      // Reconnect after 2 seconds
      reconnectTimerRef.current = setTimeout(connect, 2000);
    };
  }, []);

  useEffect(() => {
    // Initial fetch (in case SSE isn't available during static export)
    fetch(`${API_BASE}/api/board`)
      .then(r => r.json())
      .then(data => setBoard(data))
      .catch(() => {});

    // Connect SSE
    connect();

    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [connect]);

  const moveTask = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      const task = await res.json() as Task;
      setBoard(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map(t => t.id === task.id ? task : t),
        };
      });
    }
  }, []);

  return { board, connected, moveTask };
}
