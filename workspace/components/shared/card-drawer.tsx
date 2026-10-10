'use client';

// The board's card sheet (design contract §6): DetailSheet from chanl-admin with j/k navigation
// across the cards currently shown on the board.

import { useMemo } from 'react';
import { DetailSheet } from '@/components/shared/detail-sheet';
import { CardActions, CardDetail, CardHeaderTags, storyLine } from '@/components/shared/card-detail';
import { useCard } from '@/hooks/use-api';

export function CardDrawer({ id, onClose, ids = [], onNavigate }: { id: string | null; onClose: () => void; ids?: string[]; onNavigate?: (id: string) => void }) {
  const { data: card } = useCard(id ?? '');
  const index = id ? ids.indexOf(id) : -1;
  const navigation = useMemo(
    () =>
      index >= 0 && onNavigate
        ? {
            currentIndex: index,
            totalCount: ids.length,
            onPrev: index > 0 ? () => onNavigate(ids[index - 1]) : undefined,
            onNext: index < ids.length - 1 ? () => onNavigate(ids[index + 1]) : undefined,
          }
        : undefined,
    [ids, index, onNavigate]
  );
  return (
    <DetailSheet
      open={Boolean(id)}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={card?.title ?? id ?? ''}
      description={card ? storyLine(card) : undefined}
      tags={card ? <CardHeaderTags card={card} /> : undefined}
      navigation={navigation}
      footerActions={card ? <CardActions card={card} inSheet /> : undefined}
      testId="card-sheet"
    >
      {id ? <CardDetail id={id} stacked /> : null}
    </DetailSheet>
  );
}
