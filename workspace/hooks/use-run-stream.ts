'use client';

// The live lines of one agent run: `GET /api/runs/:runId/stream` over EventSource, one message
// per line. The browser's EventSource reconnects on its own, the same exemption as use-events.ts.
// The hook stops listening once the run is no longer running; the full log then comes from
// GET /api/runs/:runId, so a reload shows the same text.

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

export function useRunStream(runId: string | null, live: boolean, onEnd?: () => void) {
  const [lines, setLines] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const seen = useRef<string | null>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => {
    if (!runId) { setLines([]); seen.current = null; return; }
    if (seen.current !== runId) { setLines([]); seen.current = runId; }
    if (!live) return;
    const es = new EventSource(api.runStreamUrl(runId));
    const onLine = (e: MessageEvent) => {
      setOpen(true);
      let text = String(e.data);
      // A server may frame each line as JSON ({line}) or as the raw text; both read the same here.
      try { const parsed = JSON.parse(text) as { line?: string; text?: string; log?: string } | string; text = typeof parsed === 'string' ? parsed : parsed.line ?? parsed.text ?? parsed.log ?? text; } catch { /* raw text */ }
      setLines((prev) => (prev.length > 5000 ? [...prev.slice(-4000), text] : [...prev, text]));
    };
    es.onmessage = onLine;
    es.addEventListener('line', onLine);
    es.addEventListener('log', onLine);
    // The server closes with an `end` event carrying the final record; the run query re-reads it.
    es.addEventListener('end', () => { es.close(); setOpen(false); onEndRef.current?.(); });
    es.onerror = () => setOpen(false);
    return () => es.close();
  }, [runId, live]);

  return { lines, open };
}
