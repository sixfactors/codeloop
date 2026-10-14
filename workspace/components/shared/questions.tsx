'use client';

import { useState } from 'react';
import { Check, CheckCheck, MessageSquare } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { useAcceptAll, useAnswer, useCanWrite, useQuestions } from '@/hooks/use-api';
import type { Question } from '@/lib/types';

function QuestionRow({ cardId, q }: { cardId: string; q: Question }) {
  const answer = useAnswer();
  const { canWrite, reason } = useCanWrite();
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const answered = Boolean(q.answer);

  return (
    <Item variant="outline" size="sm" className="flex-col items-stretch">
      <ItemContent>
        <ItemTitle className="flex items-start gap-2">
          <span className="font-mono text-xs text-muted-foreground">#{q.n}</span>
          <span>{q.question}</span>
        </ItemTitle>
        {q.recommended && !answered && !q.options?.length ? <ItemDescription>Recommended: {q.recommended}</ItemDescription> : null}
        {answered ? <ItemDescription className="text-foreground"><Badge variant="secondary" className="mr-1">answered</Badge>{q.answer}</ItemDescription> : null}
      </ItemContent>
      {!answered ? (
        <ItemActions className="flex-col items-stretch gap-2">
          {typing ? (
            <>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer" rows={3} aria-label={`Answer to question ${q.n}`} disabled={!canWrite} />
              <div className="flex gap-2">
                <Button size="sm" disabled={!canWrite || !text.trim() || answer.isPending} title={canWrite ? undefined : reason} onClick={() => answer.mutate({ id: cardId, n: q.n, body: { text: text.trim() } }, { onSuccess: () => { setText(''); setTyping(false); } })}>Send</Button>
                <Button size="sm" variant="ghost" onClick={() => setTyping(false)}>Cancel</Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              {q.options?.length ? q.options.map((o) => {
                const recommended = o.key === q.recommended;
                return (
                  <Button key={o.key} size="sm" variant={recommended ? 'default' : 'outline'} disabled={!canWrite || answer.isPending} title={canWrite ? undefined : reason} onClick={() => answer.mutate({ id: cardId, n: q.n, body: { option: o.key } })} data-testid={`question-option-${q.n}-${o.key}`} data-recommended={recommended || undefined}>
                    <span className="font-mono text-xs opacity-70">{o.key}</span>{o.text}{recommended ? <Badge variant="secondary" className="ml-1 rounded-full">recommended</Badge> : null}
                  </Button>
                );
              }) : null}
              {q.recommended && !q.options?.length ? (
                <Button size="sm" disabled={!canWrite || answer.isPending} title={canWrite ? undefined : reason} onClick={() => answer.mutate({ id: cardId, n: q.n, body: { accept: true } })} data-testid="question-accept"><Check />Accept</Button>
              ) : null}
              <Button size="sm" variant="outline" disabled={!canWrite} title={canWrite ? undefined : reason} onClick={() => setTyping(true)} data-testid="question-answer"><MessageSquare />Answer</Button>
            </div>
          )}
          {answer.error ? <p className="text-xs text-destructive">{(answer.error as Error).message}</p> : null}
        </ItemActions>
      ) : null}
    </Item>
  );
}

/** `compact`: open questions only (the panel's). `answered`: answered ones only (the record under Output, so an open question is never listed twice). */
export function Questions({ cardId, compact = false, answered = false }: { cardId: string; compact?: boolean; answered?: boolean }) {
  // Not isLoading: a server render is not fetching, so that flag differs from the client's first render and breaks hydration.
  const { data, error } = useQuestions(cardId);
  if (!data && !error) return <Skeleton className="h-16 w-full" />;
  if (error) return <p className="text-xs text-muted-foreground">Questions unavailable: {(error as Error).message}</p>;
  const list = compact ? (data ?? []).filter((q) => !q.answer) : answered ? (data ?? []).filter((q) => q.answer) : data ?? [];
  if (!list.length) return <p className="text-xs text-muted-foreground">{compact ? 'Nothing open.' : 'No questions on this story.'}</p>;
  const suggested = list.filter((q) => !q.answer && q.recommended).length;
  return (
    <ItemGroup className="gap-2">
      {suggested > 0 ? <AcceptAll cardId={cardId} count={suggested} /> : null}
      {list.map((q) => <QuestionRow key={q.n} cardId={cardId} q={q} />)}
    </ItemGroup>
  );
}

/** One click answers every open question with its recommended answer; the questions with none stay open. */
function AcceptAll({ cardId, count }: { cardId: string; count: number }) {
  const accept = useAcceptAll();
  const { canWrite, reason } = useCanWrite();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" disabled={!canWrite || accept.isPending} title={canWrite ? undefined : reason} onClick={() => accept.mutate({ id: cardId }, { onSuccess: (r) => toast.success(`Accepted ${r.accepted} suggested answer${r.accepted === 1 ? '' : 's'}`), onError: (e) => toast.error(`Accept all failed: ${(e as Error).message}`) })} data-testid="accept-all"><CheckCheck />Accept all suggested ({count})</Button>
      {accept.error ? <p className="text-xs text-destructive">{(accept.error as Error).message}</p> : null}
    </div>
  );
}
