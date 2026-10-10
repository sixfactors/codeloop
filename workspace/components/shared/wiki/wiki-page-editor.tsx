'use client';

// Edit mode for one wiki page: frontmatter as key/value rows, a split markdown editor with live
// preview, ⌘S / Save sends PUT with expectVersion. A 409 shows a conflict card: Reload refetches the
// server copy and keeps the draft in a second pane. The draft is kept in localStorage per page and
// offered on return. Delete sits behind an AlertDialog.

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Plus, RotateCw, Save, Trash2, X } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { InlineError } from '@/components/shared/inline-error';
import { WikiMarkdown } from './wiki-markdown-lazy';
import { useIsMobile } from '@/hooks/use-mobile';
import { isConflict, useDeletePage, usePage, useSavePage } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { routes } from '@/lib/routes';
import type { Page } from '@/lib/types';

const CodeEditor = dynamic(() => import('./code-editor'), { ssr: false, loading: () => <Skeleton className="h-full min-h-[320px] w-full" /> });

type Row = { key: string; value: string };
const toRows = (fm?: Record<string, unknown>): Row[] =>
  Object.entries(fm ?? {}).filter(([k]) => k !== 'title').map(([key, value]) => ({ key, value: Array.isArray(value) ? value.join(', ') : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '') }));
const fromRows = (rows: Row[], original?: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (original?.title !== undefined) out.title = original.title;
  for (const { key, value } of rows) {
    const k = key.trim();
    if (!k) continue;
    const orig = original?.[k];
    if (Array.isArray(orig)) out[k] = value.split(',').map((s) => s.trim()).filter(Boolean);
    else if (typeof orig === 'number' && value.trim() !== '' && !Number.isNaN(Number(value))) out[k] = Number(value);
    else if (typeof orig === 'boolean' && (value === 'true' || value === 'false')) out[k] = value === 'true';
    else out[k] = value;
  }
  return out;
};

const draftKey = (path: string) => `codeloop-wiki-draft:${path}`;
type Draft = { rows: Row[]; body: string; at: string };
const readDraft = (path: string): Draft | null => { try { const s = localStorage.getItem(draftKey(path)); return s ? (JSON.parse(s) as Draft) : null; } catch { return null; } };
const writeDraft = (path: string, d: Draft | null) => { try { if (d) localStorage.setItem(draftKey(path), JSON.stringify(d)); else localStorage.removeItem(draftKey(path)); } catch { /* storage blocked */ } };

function FrontmatterRows({ rows, onChange }: { rows: Row[]; onChange: (rows: Row[]) => void }) {
  const set = (i: number, patch: Partial<Row>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4" data-testid="wiki-frontmatter">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Properties</span>
        <Button size="sm" variant="ghost" onClick={() => onChange([...rows, { key: '', value: '' }])} data-testid="wiki-fm-add"><Plus />Add</Button>
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No properties. Add one for status, metric, goal, persona, card or updated.</p> : null}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={r.key} onChange={(e) => set(i, { key: e.target.value })} placeholder="key" aria-label="Property name" className="h-8 w-36 font-mono text-xs" />
          <Input value={r.value} onChange={(e) => set(i, { value: e.target.value })} placeholder="value" aria-label="Property value" className="h-8 flex-1 text-sm" />
          <Button size="icon-sm" variant="ghost" aria-label="Remove property" onClick={() => onChange(rows.filter((_, j) => j !== i))}><X /></Button>
        </div>
      ))}
    </div>
  );
}

export function WikiPageEditor({ path, onDone }: { path: string; onDone: () => void }) {
  const router = useRouter();
  // The page query is switched off before the DELETE so the SSE-driven invalidation that follows
  // does not refetch a page that no longer exists.
  const [deleted, setDeleted] = useState(false);
  const { data, isLoading, error, refetch } = usePage(deleted ? '' : path);
  const save = useSavePage();
  const remove = useDeletePage();
  const [rows, setRows] = useState<Row[]>([]);
  const [body, setBody] = useState('');
  const [base, setBase] = useState<Page | null>(null);
  const [conflict, setConflict] = useState<{ message: string; server?: Page } | null>(null);
  const [offerDraft, setOfferDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = useRef(false);
  const phone = useIsMobile();

  // Seed the form from the server copy once, and offer a stored draft if one is newer.
  useEffect(() => {
    if (!data || base) return;
    setBase(data);
    setRows(toRows(data.frontmatter));
    setBody(data.body);
    const d = readDraft(path);
    if (d && (d.body !== data.body || JSON.stringify(d.rows) !== JSON.stringify(toRows(data.frontmatter)))) setOfferDraft(d);
  }, [data, base, path]);

  // Keep the draft while typing; drop it on save or cancel.
  useEffect(() => {
    if (!base || !dirty.current) return;
    const t = setTimeout(() => writeDraft(path, { rows, body, at: new Date().toISOString() }), 400);
    return () => clearTimeout(t);
  }, [rows, body, base, path]);

  const edit = useCallback(<T,>(setter: (v: T) => void) => (v: T) => { dirty.current = true; setter(v); }, []);

  const doSave = useCallback(async () => {
    if (!base || save.isPending) return;
    try {
      const page = await save.mutateAsync({ path, write: { frontmatter: fromRows(rows, base.frontmatter), body, expectVersion: base.version } });
      writeDraft(path, null);
      dirty.current = false;
      setBase(page);
      setConflict(null);
      toast.success('Saved');
      onDone();
    } catch (e) {
      if (isConflict(e)) {
        setConflict({ message: e instanceof Error ? e.message : 'Someone else saved this page first.' });
      } else {
        toast.error(e instanceof Error ? e.message : 'Save failed');
      }
    }
  }, [base, body, onDone, path, rows, save]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); void doSave(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [doSave]);

  const reloadServer = async () => {
    const fresh = await api.page(path);
    setConflict({ message: conflict?.message ?? '', server: fresh });
    setBase(fresh);
  };

  const cancel = () => { writeDraft(path, null); dirty.current = false; onDone(); };
  const doDelete = async () => {
    setDeleted(true);
    try {
      await remove.mutateAsync({ path });
      writeDraft(path, null);
      toast.success('Page deleted');
      router.push(routes.wiki());
    } catch (e) {
      setDeleted(false);
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const preview = useMemo(() => body, [body]);

  if (isLoading || (!base && !error)) return <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-24 w-full" /><Skeleton className="h-80 w-full" /></div>;
  if (error) return <InlineError title="Page failed to load" error={error} onRetry={() => refetch()} />;

  return (
    <div className="flex flex-col gap-4" data-testid="wiki-editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">Editing {base?.title}</h2>
          <p className="truncate font-mono text-xs text-muted-foreground">{path}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} className="text-destructive" data-testid="wiki-delete"><Trash2 />Delete</Button>
          <Button size="sm" variant="outline" onClick={cancel} data-testid="wiki-cancel">Cancel</Button>
          <Button size="sm" onClick={() => void doSave()} disabled={save.isPending} data-testid="wiki-save"><Save />{save.isPending ? 'Saving…' : 'Save'}<kbd className="ml-1 hidden rounded border bg-muted px-1 font-mono text-[10px] sm:inline">⌘S</kbd></Button>
        </div>
      </div>

      {offerDraft ? (
        <Alert data-testid="wiki-draft-offer">
          <RotateCw />
          <AlertTitle>You have an unsaved draft from {new Date(offerDraft.at).toLocaleString()}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>Restore it, or keep the saved page and discard the draft.</span>
            <span className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { writeDraft(path, null); setOfferDraft(null); }}>Discard</Button>
              <Button size="sm" onClick={() => { setRows(offerDraft.rows); setBody(offerDraft.body); dirty.current = true; setOfferDraft(null); }}>Restore draft</Button>
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      {conflict ? (
        <Alert variant="destructive" data-testid="wiki-conflict">
          <AlertTriangle />
          <AlertTitle>Saved elsewhere since you opened it</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{conflict.message} Reload shows the server copy next to your draft; Save then writes your draft over it.</span>
            <Button size="sm" variant="outline" onClick={() => void reloadServer()}><RotateCw />Reload</Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <FrontmatterRows rows={rows} onChange={edit(setRows)} />

      <ResizablePanelGroup orientation={phone ? 'vertical' : 'horizontal'} className="min-h-[480px] rounded-xl border">
        <ResizablePanel defaultSize={50} minSize={25}>
          <div className="h-full p-2"><CodeEditor value={body} onChange={edit(setBody)} /></div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={50} minSize={25}>
          <div className="h-full overflow-auto p-4" data-testid="wiki-preview">
            {conflict?.server ? (
              <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
                <p className="mb-2 text-xs font-semibold tracking-wider text-destructive uppercase">Server copy</p>
                <WikiMarkdown>{conflict.server.body}</WikiMarkdown>
              </div>
            ) : null}
            <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Preview</p>
            <WikiMarkdown>{preview}</WikiMarkdown>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this page?</AlertDialogTitle>
            <AlertDialogDescription>{path} is removed from the repo. Git history keeps it; the wiki does not.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doDelete()} data-testid="wiki-delete-confirm">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
