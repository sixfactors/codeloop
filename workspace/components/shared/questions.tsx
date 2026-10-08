'use client';

import { useState } from 'react';
import { Check, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { useAnswer, useQuestions } from '@/hooks/use-api';
import type { Question } from '@/lib/types';

function QuestionRow({ cardId, q }: { cardId: string; q: Question }) {
  const answer = useAnswer();
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
        {q.recommended ? <ItemDescription>Recommended: {q.recommended}</ItemDescription> : null}
        {answered ? <ItemDescription className="text-foreground"><Badge variant="secondary" className="mr-1">answered</Badge>{q.answer}</ItemDescription> : null}
      </ItemContent>
      {!answered ? (
        <ItemActions className="flex-col items-stretch gap-2">
          {typing ? (
            <>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer" rows={3} aria-label={`Answer to question ${q.n}`} />
              <div className="flex gap-2">
                <Button size="sm" disabled={!text.trim() || answer.isPending} onClick={() => answer.mutate({ id: cardId, n: q.n, body: { text: text.trim() } }, { onSuccess: () => { setText(''); setTyping(false); } })}>Send</Button>
                <Button size="sm" variant="ghost" onClick={() => setTyping(false)}>Cancel</Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              {q.recommended ? (
                <Button size="sm" disabled={answer.isPending} onClick={() => answer.mutate({ id: cardId, n: q.n, body: { accept: true } })}><Check />Accept</Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => setTyping(true)}><MessageSquare />Answer</Button>
            </div>
          )}
          {answer.error ? <p className="text-xs text-destructive">{(answer.error as Error).message}</p> : null}
        </ItemActions>
      ) : null}
    </Item>
  );
}

export function Questions({ cardId, compact = false }: { cardId: string; compact?: boolean }) {
  // Not isLoading: a server render is not fetching, so that flag differs from the client's first render and breaks hydration.
  const { data, error } = useQuestions(cardId);
  if (!data && !error) return <Skeleton className="h-16 w-full" />;
  if (error) return <p className="text-xs text-muted-foreground">Questions unavailable: {(error as Error).message}</p>;
  const list = compact ? (data ?? []).filter((q) => !q.answer) : data ?? [];
  if (!list.length) return <p className="text-xs text-muted-foreground">{compact ? 'Nothing open.' : 'No questions on this card.'}</p>;
  return <ItemGroup className="gap-2">{list.map((q) => <QuestionRow key={q.n} cardId={cardId} q={q} />)}</ItemGroup>;
}
