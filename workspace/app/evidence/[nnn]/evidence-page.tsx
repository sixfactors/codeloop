'use client';

import { FolderOpen } from 'lucide-react';
import { PageLayout } from '@/components/shared/page-layout';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
import { Markdown } from '@/components/shared/markdown';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { isMissing, useCard, useEvidence } from '@/hooks/use-api';
import { useRoutes } from '@/components/providers/project-provider';

export function EvidencePage({ nnn }: { nnn: string }) {
  const real = nnn;
  const routes = useRoutes();
  const ev = useEvidence(real);
  const card = useCard(`c-${real}`);
  const title = card.data?.title ?? `Evidence ${real}`;
  const crumbs = [{ label: 'Board', href: routes.board }, { label: `c-${real}`, href: routes.card(`c-${real}`) }, { label: 'Evidence' }];

  if (ev.error) {
    return (
      <PageLayout icon={FolderOpen} backHref={routes.card(`c-${real}`)} breadcrumbs={crumbs} title={title}>
        {isMissing(ev.error)
          ? <EmptyState icon={FolderOpen} title="Evidence is not served yet" description={`GET /api/evidence/${real} is being added. Verify runs, the review table, deploy logs and screenshots land here.`} />
          : <InlineError title="Evidence failed to load" error={ev.error} onRetry={() => ev.refetch()} />}
      </PageLayout>
    );
  }
  const files = ev.data?.files ?? [];
  return (
    <PageLayout icon={FolderOpen} backHref={routes.card(`c-${real}`)} breadcrumbs={crumbs} title={title} description={ev.isLoading ? `Evidence for c-${real}` : `Evidence for c-${real}, ${files.length} files`}>
      {ev.isLoading ? <PageSkeleton statCards={0} showToolbar={false} tableRows={4} /> : !files.length ? <EmptyState icon={FolderOpen} title="Empty folder" description="No evidence has been written for this story yet. Verify writes its proof here." /> : (
        <div className="flex flex-col gap-4">
          <Table>
            <TableHeader><TableRow><TableHead>File</TableHead><TableHead>Kind</TableHead><TableHead>Path</TableHead></TableRow></TableHeader>
            <TableBody>{files.map((f) => <TableRow key={f.name}><TableCell className="font-mono text-xs">{f.url ? <a href={f.url} target="_blank" rel="noreferrer" className="underline underline-offset-3" data-testid="evidence-file-link">{f.name}</a> : f.name}</TableCell><TableCell>{f.kind ? <Badge variant="outline" className="rounded-full">{f.kind}</Badge> : null}</TableCell><TableCell className="text-xs text-muted-foreground">{f.path}</TableCell></TableRow>)}</TableBody>
          </Table>
          <Accordion multiple className="max-w-3xl">
            {files.filter((f) => f.content || (f.kind === 'image' && f.url)).map((f) => (
              <AccordionItem key={f.name} value={f.name}>
                <AccordionTrigger className="font-mono text-xs">{f.name}</AccordionTrigger>
                <AccordionContent>
                  {f.kind === 'image' && f.url ? <img src={f.url} alt={f.name} className="max-w-full rounded border" /> : f.name.endsWith('.md') ? <Markdown>{f.content!}</Markdown> : <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">{f.content}</pre>}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}
    </PageLayout>
  );
}
