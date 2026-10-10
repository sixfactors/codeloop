'use client';

// Compact markdown for specs and evidence files, loaded on first use.
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const Markdown = dynamic(() => import('./markdown-impl'), { loading: () => <Skeleton className="h-16 w-full" /> });
