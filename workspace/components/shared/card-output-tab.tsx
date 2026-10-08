'use client';

// The Output tab on a card: the current stage's output file in the wiki's CodeMirror editor,
// saved through PUT /api/cards/:id/output. Same draft and conflict handling as the wiki page
// editor: the draft lives in localStorage per card and path and is offered on return; a save
// first re-reads the server copy, and a file changed since it was opened (or a 409) shows a
// conflict card with Reload. A dropped .md or .txt file fills the editor, which is the intake
// step of the deliverable-review guide without the terminal.

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { AlertTriangle, FileOutput, FileUp, RotateCw, Save, Upload } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
import { Markdown } from '@/components/shared/markdown';
import { isConflict, isMissing, useCardOutput, useCards, useSaveCardOutput } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { Card as CardT, CardOutput } from '@/lib/types';

const CodeEditor = dynamic(() => import('@/components/shared/wiki/code-editor'), { ssr: false, loading: () => <Skeleton className="h-full min-h-[320px] w-full" /> });

const ACCEPT = ['.md', '.txt', '.markdown'];
const draftKey = (id: string, path: string) => `codeloop-output-draft:${id}:${path}`;
type Draft = { body: string; at: string };
const readDraft = (k: string): Draft | null => { try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as Draft) : null; } catch { return null; } };
const writeDraft = (k: string, d: Draft | null) => { try { if (d) localStorage.setItem(k, JSON.stringify(d)); else localStorage.removeItem(k); } catch { /* storage blocked */ } };

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsText(file);
  });
}

export function CardOutputTab({ card }: { card: CardT }) {
  const { payload } = useCards();
  const owner = Boolean(payload?.owner);
  const { data, error, refetch } = useCardOutput(card.id);
  const save = useSaveCardOutput();
  const [base, setBase] = useState<CardOutput | null>(null);
  const [body, setBody] = useState('');
  const [conflict, setConflict] = useState<{ message: string; server?: CardOutput } | null>(null);
  const [offerDraft, setOfferDraft] = useState<Draft | null>(null);
  const [over, setOver] = useState(false);
  const dirty = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const key = base ? draftKey(card.id, base.path) : '';

  // Seed from the server copy once; offer a stored draft when it differs.
  useEffect(() => {
    if (!data || base) return;
    setBase(data);
    setBody(data.text ?? '');
    const d = readDraft(draftKey(card.id, data.path));
    if (d && d.body !== (data.text ?? '')) setOfferDraft(d);
  }, [data, base, card.id]);

  useEffect(() => {
    if (!key || !dirty.current) return;
    const t = setTimeout(() => writeDraft(key, { body, at: new Date().toISOString() }), 400);
    return () => clearTimeout(t);
  }, [body, key]);

  const edit = useCallback((v: string) => { dirty.current = true; setBody(v); }, []);

  const doSave = useCallback(async () => {
    if (!base || save.isPending || !owner) return;
    try {
      // Someone (an agent, the CLI) may have written the file since it was opened.
      const fresh = await api.cardOutput(card.id);
      if ((fresh.text ?? '') !== (base.text ?? '') && fresh.text !== body) {
        setConflict({ message: 'The file changed on disk since you opened it.', server: fresh });
        return;
      }
      const saved = await save.mutateAsync({ id: card.id, text: body });
      writeDraft(key, null);
      dirty.current = false;
      setBase({ ...saved, text: saved.text ?? body });
      setConflict(null);
      toast.success(`Saved ${saved.path ?? base.path}`);
    } catch (e) {
      if (isConflict(e)) setConflict({ message: e instanceof Error ? e.message : 'Saved elsewhere first.' });
      else toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  }, [base, body, card.id, key, owner, save]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); void doSave(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [doSave]);

  const reloadServer = async () => {
    const fresh = await api.cardOutput(card.id);
    setConflict({ message: conflict?.message ?? '', server: fresh });
    setBase(fresh);
  };

  const takeFile = async (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPT.some((ext) => file.name.toLowerCase().endsWith(ext))) { toast.error(`${file.name}: only .md and .txt files fill the output`); return; }
    try { edit(await readFile(file)); toast.success(`Loaded ${file.name}; Save writes it to ${base?.path ?? 'the output file'}`); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not read the file'); }
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); void takeFile(e.dataTransfer.files?.[0]); };

  if (error) {
    return isMissing(error)
      ? <EmptyState compact icon={FileOutput} title="Output is not served yet" description={`GET /api/cards/:id/output is being added. Until then the stage writes${card.spec ? ` under ${card.spec}` : ' its output file'} and the wiki shows it.`} />
      : <InlineError title="Output failed to load" error={error} onRetry={() => refetch()} />;
  }
  if (!base) return <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-8 w-full" /><Skeleton className="h-72 w-full" /></div>;

  const changed = body !== (base.text ?? '');

  return (
    <div className="flex flex-col gap-3" data-testid="card-output">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-muted-foreground" data-testid="card-output-path">{base.path}</p>
          {base.text === null && !changed ? <p className="text-xs text-muted-foreground">Not written yet. Type here, drop a file, or run the stage.</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInput} type="file" accept={ACCEPT.join(',')} className="hidden" onChange={(e) => { void takeFile(e.target.files?.[0]); e.target.value = ''; }} data-testid="card-output-file" />
          <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={!owner}><FileUp />Load a file</Button>
          <Button size="sm" onClick={() => void doSave()} disabled={!owner || save.isPending || !changed} data-testid="card-output-save"><Save />{save.isPending ? 'Saving…' : 'Save'}<kbd className="ml-1 hidden rounded border bg-muted px-1 font-mono text-[10px] sm:inline">⌘S</kbd></Button>
        </div>
      </div>

      {offerDraft ? (
        <Alert data-testid="card-output-draft-offer">
          <RotateCw />
          <AlertTitle>You have an unsaved draft from {new Date(offerDraft.at).toLocaleString()}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>Restore it, or keep the file on disk and discard the draft.</span>
            <span className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { writeDraft(key, null); setOfferDraft(null); }}>Discard</Button>
              <Button size="sm" onClick={() => { edit(offerDraft.body); setOfferDraft(null); }}>Restore draft</Button>
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      {conflict ? (
        <Alert variant="destructive" data-testid="card-output-conflict">
          <AlertTriangle />
          <AlertTitle>Changed on disk since you opened it</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{conflict.message} Reload shows the disk copy under the editor; Save then writes your text over it.</span>
            <Button size="sm" variant="outline" onClick={() => void reloadServer()}><RotateCw />Reload</Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div
        className={cn('relative min-h-[360px] rounded-xl border bg-card', over && 'border-primary ring-2 ring-primary/30')}
        onDragOver={(e) => { if (owner) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={owner ? onDrop : undefined}
        data-testid="card-output-dropzone"
      >
        <div className="h-[360px] p-2"><CodeEditor value={body} onChange={edit} /></div>
        {over ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-background/80 text-sm font-medium">
            <Upload className="mr-2 size-4" />Drop the .md or .txt file to fill the editor
          </div>
        ) : null}
      </div>
      {!owner ? <p className="text-xs text-muted-foreground">Read only: the owner saves from their own board.</p> : <p className="text-xs text-muted-foreground">Drag a .md or .txt file onto the editor to replace its text; nothing is written until Save.</p>}

      {conflict?.server ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="mb-2 text-xs font-semibold tracking-wider text-destructive uppercase">Disk copy</p>
          <Markdown>{conflict.server.text ?? ''}</Markdown>
        </div>
      ) : null}
    </div>
  );
}
