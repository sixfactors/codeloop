'use client';

// The owner's hand controls on a story: Edit (title, story line, priority, feature, size), Move to a
// stage of its lane, and a confirm with a note for Reopen and Send back to backlog. The engine owns
// the rules (a builder holding the story, a move back past a passed gate without a note) and answers
// a refusal with its reason, which the dialog shows in place.

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { InlineError } from '@/components/shared/inline-error';
import { storyLine } from '@/components/shared/card-detail';
import { useCardFacets, useLanes, useStoryControl } from '@/hooks/use-api';
import type { StoryEdit } from '@/lib/api';
import { toast } from '@/lib/toast';
import { BANDS, type Card as CardT } from '@/lib/types';

const SIZES = ['S', 'M', 'L'] as const;
const NONE = '__none__';
const NO_CARDS: CardT[] = [];

type DialogProps = { card: CardT; open: boolean; onOpenChange: (o: boolean) => void };

export function EditStoryDialog({ card, open, onOpenChange }: DialogProps) {
  const { edit } = useStoryControl();
  const facets = useCardFacets(NO_CARDS);
  const features = useMemo(() => (facets.feature ?? []).map((o) => o.value), [facets.feature]);
  const initial = { title: card.title, story: storyLine(card) ?? '', priority: card.priority ?? '', feature: card.feature ?? '', size: card.size ?? '' };
  const [form, setForm] = useState(initial);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  // Only what changed goes to the server, so an untouched story line never rewrites spec.md.
  const changed = Object.fromEntries(Object.entries(form).filter(([k, v]) => v !== initial[k as keyof typeof initial])) as StoryEdit;
  const save = () => edit.mutate({ id: card.id, fields: changed }, { onSuccess: () => { toast.success(`Edited ${card.id}`); onOpenChange(false); } });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" data-testid="edit-story-dialog">
        <DialogHeader>
          <DialogTitle>Edit {card.id}</DialogTitle>
          <DialogDescription>The story line follows into spec.md. Each change goes on the story history.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5"><Label htmlFor="edit-title">Title</Label><Input id="edit-title" value={form.title} onChange={(e) => set('title')(e.target.value)} data-testid="edit-title" /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="edit-story">Story</Label><Textarea id="edit-story" rows={3} value={form.story} onChange={(e) => set('story')(e.target.value)} placeholder="As a <persona>, I can <what>, so that <outcome>." data-testid="edit-story" /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-priority">Priority</Label>
              <Select value={form.priority || NONE} onValueChange={(v) => set('priority')(!v || v === NONE ? '' : v)}>
                <SelectTrigger id="edit-priority" className="w-full" data-testid="edit-priority"><SelectValue>{(v: string | null) => (!v || v === NONE ? 'None' : v)}</SelectValue></SelectTrigger>
                <SelectContent><SelectItem value={NONE}>None</SelectItem>{BANDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-feature">Feature</Label>
              <Select value={form.feature || NONE} onValueChange={(v) => set('feature')(!v || v === NONE ? '' : v)}>
                <SelectTrigger id="edit-feature" className="w-full" data-testid="edit-feature"><SelectValue>{(v: string | null) => (!v || v === NONE ? 'None' : v)}</SelectValue></SelectTrigger>
                <SelectContent><SelectItem value={NONE}>None</SelectItem>{features.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-size">Size</Label>
              <Select value={form.size || NONE} onValueChange={(v) => set('size')(!v || v === NONE ? '' : v)}>
                <SelectTrigger id="edit-size" className="w-full" data-testid="edit-size"><SelectValue>{(v: string | null) => (!v || v === NONE ? 'None' : v)}</SelectValue></SelectTrigger>
                <SelectContent>{SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {edit.error ? <InlineError title="Not edited" error={edit.error} /> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={edit.isPending || !Object.keys(changed).length || !form.title.trim()} data-testid="edit-save">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MoveStageDialog({ card, open, onOpenChange }: DialogProps) {
  const { move } = useStoryControl();
  const lanes = useLanes();
  const stages = lanes.data.find((l) => l.id === card.lane)?.stages ?? [];
  const [stage, setStage] = useState('');
  const [note, setNote] = useState('');
  const from = stages.findIndex((s) => s.id === card.stage);
  const to = stages.findIndex((s) => s.id === stage);
  // Mirrors the engine's rule so the owner knows before saving; the engine still decides.
  const undoes = to >= 0 && to < from ? stages.slice(to, from).filter((s) => s.gate).map((s) => s.gate!.name) : [];
  const save = () => move.mutate({ id: card.id, stage, note: note.trim() || undefined }, { onSuccess: () => { toast.success(`Moved ${card.id} to ${stage}`); onOpenChange(false); } });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="move-stage-dialog">
        <DialogHeader>
          <DialogTitle>Move {card.id}</DialogTitle>
          <DialogDescription>It is at {card.stage}. The new stage starts clean: no gate, no retries.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="move-stage">Stage</Label>
            <Select value={stage} onValueChange={(v) => v && setStage(v)}>
              <SelectTrigger id="move-stage" className="w-full" data-testid="move-stage"><SelectValue>{(v: string | null) => v || 'Choose a stage'}</SelectValue></SelectTrigger>
              <SelectContent>{stages.map((s) => <SelectItem key={s.id} value={s.id} disabled={s.id === card.stage}>{s.id}{s.gate ? ` · gate ${s.gate.name}` : ''}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="move-note">{undoes.length ? `Why (required: this undoes the ${undoes.join(' and ')} gate)` : 'Why (optional)'}</Label>
            <Textarea id="move-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-testid="move-note" />
          </div>
          {move.error ? <InlineError title="Not moved" error={move.error} /> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={move.isPending || !stage || (undoes.length > 0 && !note.trim())} data-testid="move-save">Move</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Reopen (a done or dropped story) or Send back to backlog (any story), each with an optional note. */
export function BackDialog({ card, open, onOpenChange, kind }: DialogProps & { kind: 'reopen' | 'backlog' }) {
  const { reopen, park } = useStoryControl();
  const [note, setNote] = useState('');
  const closed = card.stage === 'done' || card.stage === 'dropped';
  // A done or dropped story comes back through reopen; an active one is parked, which keeps its stage for later.
  const run = kind === 'reopen' || closed ? reopen : park;
  const save = () => {
    const done = { onSuccess: () => { toast.success(kind === 'reopen' ? `Reopened ${card.id}` : `${card.id} is back in the backlog`); onOpenChange(false); } };
    if (kind === 'reopen') reopen.mutate({ id: card.id, note: note.trim() || undefined }, done);
    else if (closed) reopen.mutate({ id: card.id, to: 'backlog', note: note.trim() || undefined }, done);
    else park.mutate({ id: card.id, note: note.trim() || undefined }, done);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid={`${kind}-dialog`}>
        <DialogHeader>
          <DialogTitle>{kind === 'reopen' ? `Reopen ${card.id}` : `Send ${card.id} back to backlog`}</DialogTitle>
          <DialogDescription>
            {kind === 'reopen' ? 'It goes back to the first stage of its lane.' : closed ? 'It waits in the backlog as a proposal and holds no lane slot.' : `It leaves ${card.stage} for the backlog; approving it puts it back there.`}
          </DialogDescription>
        </DialogHeader>
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why (optional)" aria-label="Note" data-testid={`${kind}-note`} />
        {run.error ? <InlineError title="Not changed" error={run.error} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={run.isPending} data-testid={`${kind}-save`}>{kind === 'reopen' ? 'Reopen' : 'Send back'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
