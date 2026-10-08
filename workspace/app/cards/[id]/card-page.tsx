'use client';

import { Hash, Kanban } from 'lucide-react';
import { PageLayout } from '@/components/shared/page-layout';
import { CardActions, CardDetailBody, CardDetailSkeleton, CardHeaderTags, storyLine } from '@/components/shared/card-detail';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineError } from '@/components/shared/inline-error';
import { isMissing, useCard } from '@/hooks/use-api';
import { routes } from '@/lib/routes';

export function CardPage({ id }: { id: string }) {
  const { data: card, isLoading, error, refetch } = useCard(id);
  const crumbs = [{ label: 'Board', href: routes.board }, { label: id }];

  if (isLoading) return <PageLayout icon={Kanban} backHref={routes.board} title={id} breadcrumbs={crumbs} actionsLoading><CardDetailSkeleton /></PageLayout>;
  if (error && !isMissing(error)) return <PageLayout icon={Kanban} backHref={routes.board} title={id} breadcrumbs={crumbs}><InlineError title="Card failed to load" error={error} onRetry={() => refetch()} /></PageLayout>;
  if (!card) return <PageLayout icon={Kanban} backHref={routes.board} title={id} breadcrumbs={crumbs}><EmptyState icon={Hash} title={`No card ${id}`} description="It may have been dropped or renamed." action={{ label: 'Back to board', href: routes.board }} /></PageLayout>;

  return (
    <PageLayout
      icon={Kanban}
      backHref={routes.board}
      title={card.title}
      description={storyLine(card)}
      badge={<CardHeaderTags card={card} />}
      actions={<CardActions card={card} />}
      breadcrumbs={crumbs}
    >
      <CardDetailBody card={card} />
    </PageLayout>
  );
}
