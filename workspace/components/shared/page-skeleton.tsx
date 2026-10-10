// Copied from chanl-admin components/shared/page-skeleton.tsx. StatCardGrid (from the chanl design
// system package) is replaced by the same responsive grid inline; a `columns` prop is added so the
// board can show ghost columns instead of a table.

import { Skeleton } from '@/components/ui/skeleton';

interface PageSkeletonProps {
  /** Number of stat card skeletons to show (0 to hide stats section) */
  statCards?: number;
  /** Number of table row skeletons to show */
  tableRows?: number;
  /** Whether to show the toolbar skeleton (search + filters) */
  showToolbar?: boolean;
  /** Ghost kanban columns instead of the table (board page). */
  columns?: number;
}

export function PageSkeleton({ statCards = 4, tableRows = 5, showToolbar = true, columns = 0 }: PageSkeletonProps) {
  return (
    <div className="space-y-6" data-testid="page-skeleton" aria-busy="true">
      {statCards > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: statCards }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded-full" />
              </div>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      )}

      {showToolbar && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-1 items-center gap-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-9 w-24" />
          </div>
          <Skeleton className="h-9 w-9" />
        </div>
      )}

      {columns > 0 ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: columns }).map((_, i) => (
            <div key={i} className="w-64 shrink-0 space-y-3">
              <Skeleton className="h-4 w-24" />
              {Array.from({ length: 3 - (i % 2) }).map((_, j) => (
                <div key={j} className="space-y-2 rounded-xl border bg-card p-4">
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border">
          <div className="flex items-center gap-4 border-b p-4">
            {[120, 80, 96, 64, 48].map((w, i) => (
              <Skeleton key={i} className="h-4" style={{ width: w }} />
            ))}
          </div>
          {Array.from({ length: tableRows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b p-4 last:border-0">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
