'use client';

// The markdown parser and its plugins are a separate chunk, fetched on first use; the server still
// renders the body so a wiki page arrives with its text.
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const WikiMarkdown = dynamic(() => import('./wiki-markdown'), {
  loading: () => <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-2/3" /></div>,
});
