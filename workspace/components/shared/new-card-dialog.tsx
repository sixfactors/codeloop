'use client';

// New card from the board: the story fields the CLI's `card propose` / `start` take, posted through
// the SDK. A proposal lands in the backlog for the owner to promote; an owner can start it in its
// lane at once. The engine's story check answers a mechanism title with a refusal, shown inline.

import { useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCardFacets, useCards, useConfig, useCreateCard, useInitiatives, useLanes } from '@/hooks/use-api';
import type { Card as CardT } from '@/lib/types';

const SIZES = ['S', 'M', 'L'] as const;
const NONE = '__none__';
const NO_CARDS: CardT[] = [];

function personasOf(cfg: unknown): string[] {
  const list = (cfg as { personas?: unknown })?.personas;
  if (Array.isArray(list)) return list.map((p) => (typeof p === 'string' ? p : String((p as { id?: string; name?: string }).id ?? (p as { name?: string }).name ?? ''))).filter(Boolean);
  if (list && typeof list === 'object') return Object.keys(list as Record<string, unknown>);
  return [];
}

export function NewCardDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated?: (id: string) => void }) {
  const lanes = useLanes();
  const config = useConfig();
  const initiatives = useInitiatives();
  const facets = useCardFacets(NO_CARDS);
  const { payload } = useCards();
  const create = useCreateCard();
  const owner = Boolean(payload?.owner);
  const personas = useMemo(() => personasOf(config.data), [config.data]);
  const features = useMemo(() => (facets.feature ?? []).map((o) => o.value), [facets.feature]);

  const [title, setTitle] = useState('');
  const [lane, setLane] = useState('build');
  const [persona, setPersona] = useState('');
  const [can, setCan] = useState('');
  const [so, setSo] = useState('');
  const [size, setSize] = useState<string>('S');
  const [feature, setFeature] = useState('');
  const [initiative, setInitiative] = useState('');
  const [start, setStart] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const laneIds = lanes.data.length ? lanes.data.map((l) => l.id) : ['build'];
  // The engine's story check needs all three story parts; the button waits for them.
  const canSubmit = title.trim().length > 0 && persona.trim().length > 0 && can.trim().length > 0 && so.trim().length > 0 && !create.isPending;

  const reset = () => { setTitle(''); setPersona(''); setCan(''); setSo(''); setSize('S'); setFeature(''); setInitiative(''); setStart(false); setRefusal(null); };

  const submit = async () => {
    if (!canSubmit) return;
    setRefusal(null);
    const input = {
      lane, title: title.trim(), size,
      ...(persona ? { persona } : {}), ...(can.trim() ? { can: can.trim() } : {}), ...(so.trim() ? { so: so.trim() } : {}),
      ...(feature ? { feature } : {}), ...(initiative ? { initiative } : {}),
    };
    try {
      const made = await create.mutateAsync({ input, start: owner && start });
      const id = made.card.id;
      toast.success(start ? `Started ${id} in ${lane}. ${made.hint}` : `Proposed ${id}. ${made.hint}`);
      onOpenChange(false);
      reset();
      onCreated?.(id);
    } catch (e) {
      // 400 is the story check: the message says what to change (title names a mechanism, persona unknown).
      setRefusal(e instanceof Error ? e.message : 'Create failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setRefusal(null); }}>
      <DialogContent className="sm:max-w-[520px]" data-testid="new-card-dialog">
        <DialogHeader>
          <DialogTitle>New story</DialogTitle>
          <DialogDescription>A story: who, what they can now do, and why. It lands in the backlog as a proposal{owner ? ', or starts in its lane now' : ''}.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-card-title">Title</Label>
            <Input id="new-card-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Export invoices as CSV" autoFocus data-testid="new-card-title" />
            <p className="text-xs text-muted-foreground">Name what the user can now do, not the mechanism.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-card-persona">Persona</Label>
              {personas.length ? (
                <Select value={persona || NONE} onValueChange={(v) => setPersona(v === NONE || !v ? '' : v)}>
                  <SelectTrigger id="new-card-persona" className="w-full" data-testid="new-card-persona"><SelectValue>{(v: string | null) => (!v || v === NONE ? 'None' : v)}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {personas.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input id="new-card-persona" value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="finance lead" data-testid="new-card-persona" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-card-size">Size</Label>
              <Select value={size} onValueChange={(v) => v && setSize(v)}>
                <SelectTrigger id="new-card-size" className="w-full" data-testid="new-card-size"><SelectValue /></SelectTrigger>
                <SelectContent>{SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-card-can">I can</Label>
            <Input id="new-card-can" value={can} onChange={(e) => setCan(e.target.value)} placeholder="download every invoice for a period as one file" data-testid="new-card-can" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-card-so">So that</Label>
            <Input id="new-card-so" value={so} onChange={(e) => setSo(e.target.value)} placeholder="month-end reconciliation takes minutes" data-testid="new-card-so" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-card-lane">Lane</Label>
              <Select value={lane} onValueChange={(v) => v && setLane(v)}>
                <SelectTrigger id="new-card-lane" className="w-full" data-testid="new-card-lane"><SelectValue /></SelectTrigger>
                <SelectContent>{laneIds.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-card-feature">Feature</Label>
              {features.length ? (
                <Select value={feature || NONE} onValueChange={(v) => setFeature(v === NONE || !v ? '' : v)}>
                  <SelectTrigger id="new-card-feature" className="w-full" data-testid="new-card-feature"><SelectValue>{(v: string | null) => (!v || v === NONE ? 'None' : v)}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {features.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input id="new-card-feature" value={feature} onChange={(e) => setFeature(e.target.value)} placeholder="feature slug" data-testid="new-card-feature" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-card-initiative">Initiative</Label>
              <Select value={initiative || NONE} onValueChange={(v) => setInitiative(v === NONE || !v ? '' : v)}>
                <SelectTrigger id="new-card-initiative" className="w-full" data-testid="new-card-initiative"><SelectValue>{(v: string | null) => (!v || v === NONE ? 'None' : (initiatives.data ?? []).find((b) => b.id === v)?.title ?? v)}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {(initiatives.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {owner ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={start} onCheckedChange={(v: boolean) => setStart(v)} data-testid="new-card-start" />
              Start in {lane} now, skipping the backlog
            </label>
          ) : null}
          {refusal ? <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" data-testid="new-card-refusal">{refusal}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!canSubmit} data-testid="new-card-create">{create.isPending ? 'Creating…' : start && owner ? 'Start story' : 'Propose story'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
